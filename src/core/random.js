/* The gym's one source of randomness, and the reason a run can be repeated.

   Sensors jitter, two eyes are never a perfect pair, and a motor is never
   quite its twin. All of that is real and has to stay. But with Math.random()
   behind it, no two runs are ever the same, so "it went wrong once" is a bug
   nobody can ever catch. With a seed, the same seed gives the same run,
   every time, on every machine - and a failing run can simply be replayed.

   mulberry32: a few lines, very fast, and good enough for sensor noise. It is
   NOT for anything that needs real unpredictability, and nothing here does. */

export function createRandom(seed) {
  let a = (seed == null ? 1 : seed) >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,                                            // 0 up to but not including 1
    between: (lo, hi) => lo + next() * (hi - lo),
    plusMinus: (n) => (next() * 2 - 1) * n,           // sensor jitter, centred on nothing
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    coin: () => next() < 0.5,
    reseed(s) { a = (s == null ? 1 : s) >>> 0; },
    seed: () => a
  };
}

/* One stream for the whole gym, so a single seed settles the whole run. The
   room controls reseed it on Reset; a test seeds it in its first line. */
export const random = createRandom(20261030);
