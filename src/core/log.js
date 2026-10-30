/* What the gym says out loud.

   The model and the blocks call say(); they must not know whether anyone is
   listening, or whether there is a screen at all. Whoever wants to show the
   lines subscribes with onSay. In a test nobody subscribes, so the lines
   collect in recent() and can simply be read back. That is the whole reason
   the model can be tested in node. */

const listeners = [];
const buffer = [];
const KEEP = 400;

export function onSay(fn) {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

export function say(msg, cls, device) {
  const line = { msg: msg, cls: cls || "", device: device || null };
  buffer.push(line);
  while (buffer.length > KEEP) buffer.shift();
  for (const fn of listeners) fn(line);
}

/* "say it once": a note a child only needs the first time it happens. */
export function sayOnce(device, key, msg) {
  if (!device.noted) device.noted = new Set();
  if (device.noted.has(key)) return;
  device.noted.add(key);
  say(msg, "say", device);
}

export const recent = () => buffer.slice();
export const clearLog = () => { buffer.length = 0; };
