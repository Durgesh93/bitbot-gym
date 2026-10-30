/* The orchestrator.

   Every message in the gym goes through here: a block asking the robot to
   drive, the robot answering what its sensors see, the world saying a step
   has passed. Nothing calls anything else directly, which is what lets a
   test stand in for any part of the system.

   It is also the truth about the hardware. A real micro:bit cannot reach
   inside a real Bit:Bot; it sends a byte down the I2C wire and waits. The
   gym works the same way, so what a child learns here is not a lie. */

export function createBus() {
  const handlers = new Map();      // address -> (message) => reply
  const watchers = [];             // everyone who wants to see all of it
  const sent = [];                 // what has gone by, for tests to read
  let depth = 0;

  function listen(address, handler) {
    if (handlers.has(address)) throw new Error("two things answer to " + address);
    handlers.set(address, handler);
    return () => handlers.delete(address);
  }

  function watch(fn) {
    watchers.push(fn);
    return () => { const i = watchers.indexOf(fn); if (i >= 0) watchers.splice(i, 1); };
  }

  /* send is synchronous and returns the reply, because a sensor block has to
     give the child a number there and then. A missing address is an error and
     not a silent undefined: a block aimed at nothing is always a mistake. */
  function send(address, message) {
    const handler = handlers.get(address);
    if (!handler) throw new Error("nothing answers to " + address + " (" + (message && message.cmd) + ")");
    /* A handler that sends while handling is fine - a sensor read inside a
       move, say - but a loop between two handlers would hang the browser. */
    if (++depth > 32) { depth = 0; throw new Error("messages are going round in circles at " + address); }
    const record = { address: address, message: message };
    sent.push(record);
    while (sent.length > 500) sent.shift();
    try {
      const reply = handler(message);
      record.reply = reply;
      for (const w of watchers) w(record);
      return reply;
    } finally { depth--; }
  }

  const knows = (address) => handlers.has(address);
  const traffic = () => sent.slice();
  const forget = () => { sent.length = 0; };

  return { listen, watch, send, knows, traffic, forget };
}

/* The gym has one bus. Tests make their own with createBus(). */
export const bus = createBus();
