/* Small helpers with no opinions about robots, rooms or the screen.
   Everything in core/ is a leaf: it imports nothing of ours, so the model
   can use it and still be tested on its own. */

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
