/* ========================================================================
   3. The clock the program lives on. Every pause and every timed move waits
      on simulated time, which is what lets us run at 8x or single-step.
   ======================================================================== */
let simTime = 0, running = false;
class Stopped extends Error {}

function wait(m, ms) {
  const my = m.token;
  return new Promise((res, rej) => m.timers.push({ t: simTime + Math.max(0, ms), res, rej, my }));
}
function flushTimers() {
  for (const m of world.mbits) {
    if (!m.timers.length) continue;
    const due = m.timers.filter(t => t.t <= simTime);
    if (!due.length) continue;
    m.timers = m.timers.filter(t => t.t > simTime);
    for (const t of due) t.my === m.token ? t.res() : t.rej(new Stopped());
  }
}
function killTimers(m) {
  const old = m.timers; m.timers = [];
  for (const t of old) t.rej(new Stopped());
}

