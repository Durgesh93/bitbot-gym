/* The orchestrator.

   Every message in the gym goes through here: a block asking the robot to
   drive, the robot answering what its sensors see, a child dragging a robot
   across the room with the mouse. Nothing calls anything else directly, which
   is what lets a test stand in for any part of the system.

   It is also the truth about the hardware. A real micro:bit cannot reach
   inside a real Bit:Bot; it sends a byte down the I2C wire and waits. The gym
   works the same way, so what a child learns here is not a lie.

   TWO VERBS, ONE BUS.

     send(addr, msg)   now, and hands back the reply. A sensor block has to
                       give the child a number there and then. Only legal
                       inside a tick, where the world is settled.
                       -> a read or write down the I2C wire.

     post(addr, msg)   later. Goes in a queue and is delivered at ONE point
                       in the tick, before anything else runs. This is for
                       everything that arrives from outside the simulation:
                       a mouse drag, a key, a button, a radio packet.
                       -> an interrupt, which sets a flag and gets serviced
                          at the next opportunity, exactly as the board does.

   There is deliberately no second bus. Two buses would mean two orderings,
   and the moment an outside event can land halfway through a physics step the
   same program stops producing the same run - which is the one property the
   whole test suite is built on. */

export function createBus() {
  const handlers = new Map();      // address -> (message) => reply
  const watchers = [];             // everyone who wants to see all of it
  const sent = [];                 // what has gone by, for tests to read
  let queue = [];                  // posted, not yet delivered
  const slots = new Map();         // coalesce key -> its place in the queue
  let depth = 0;
  let draining = false;

  function listen(address, handler) {
    if (handlers.has(address)) throw new Error("two things answer to " + address);
    handlers.set(address, handler);
    return () => handlers.delete(address);
  }

  function watch(fn) {
    watchers.push(fn);
    return () => { const i = watchers.indexOf(fn); if (i >= 0) watchers.splice(i, 1); };
  }

  function note(record) {
    sent.push(record);
    while (sent.length > 500) sent.shift();
    for (const w of watchers) w(record);
  }

  /* A missing address is an error and not a silent undefined: a block aimed
     at nothing is always a mistake, and we would rather hear about it. */
  function send(address, message) {
    const handler = handlers.get(address);
    if (!handler) throw new Error("nothing answers to " + address + " (" + (message && message.cmd) + ")");
    /* A handler that sends while handling is fine - a sensor read inside a
       move, say - but a loop between two handlers would hang the browser. */
    if (++depth > 32) { depth = 0; throw new Error("messages are going round in circles at " + address); }
    const record = { address: address, message: message, kind: "send" };
    try {
      const reply = handler(message);
      record.reply = reply;
      note(record);
      return reply;
    } finally { depth--; }
  }

  /* Post from anywhere, at any time, including a browser event handler. It
     never throws and never returns a value, because the thing posting is not
     in a position to deal with either.

     `coalesce` is a key: a later post with the same key REPLACES the earlier
     one instead of queueing behind it. A mouse drag fires sixty times a
     second and only the last position matters, so the drag passes
     coalesce: "place:3" and the queue never grows. */
  function post(address, message, opts) {
    const key = opts && opts.coalesce;
    const item = { address: address, message: message, kind: "post" };
    if (key != null) {
      const at = slots.get(key);
      if (at) { at.address = address; at.message = message; return; }
      slots.set(key, item);
      item.key = key;
    }
    queue.push(item);
  }

  /* Deliver everything posted so far, once, in the order it arrived.

     The queue is swapped out first, so anything a handler posts while being
     delivered waits for the NEXT drain. Without that, one device that posts
     every time it is poked would spin here forever.

     A handler that throws does not stop the others, and a message with
     nobody to take it is not dropped in silence: both come back in the
     result for the caller to log once. */
  function drain() {
    if (draining) return { delivered: 0, failed: [], undelivered: [] };
    const batch = queue;
    queue = [];
    slots.clear();
    draining = true;
    const failed = [], undelivered = [];
    let delivered = 0;
    try {
      for (const item of batch) {
        const handler = handlers.get(item.address);
        if (!handler) { undelivered.push(item); note({ ...item, lost: true }); continue; }
        try {
          item.reply = handler(item.message);
          note(item);
          delivered++;
        } catch (e) {
          failed.push({ address: item.address, message: item.message, error: e });
          note({ ...item, error: e.message });
        }
      }
    } finally { draining = false; }
    return { delivered: delivered, failed: failed, undelivered: undelivered };
  }

  const knows = (address) => handlers.has(address);
  const pending = () => queue.length;
  const traffic = () => sent.slice();
  const forget = () => { sent.length = 0; };
  const clearQueue = () => { queue = []; slots.clear(); };

  return { listen, watch, send, post, drain, knows, pending, traffic, forget, clearQueue };
}

/* The gym has one bus. Tests make their own with createBus(). */
export const bus = createBus();
