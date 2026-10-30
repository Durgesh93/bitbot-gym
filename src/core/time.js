/* The simulation clock. One step is 5 ms of pretend time; the loop runs a
   handful of them per frame, which is what lets the gym run at 8x or stand
   still. It lives here, away from the loop that drives it, so a test can
   step the world forward with no browser in sight. */

export const DT = 5;

/* One object rather than two loose variables, so every module sees the same
   clock without anyone having to export a setter for it. */
export const clock = { now: 0, running: false };

export const simTime = () => clock.now;
export function advance(ms) { clock.now += ms; }
export function resetClock() { clock.now = 0; }
