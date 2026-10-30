/* The radio field: how well two boards hear each other.

   Only the physics lives here - how far apart they are and how strong that
   makes the signal. Who is in which group, and the rule that a board never
   hears itself, belong to the boards. Keeping them apart means a test can
   ask "what would the signal be across this room?" without inventing two
   whole micro:bits to ask it with. */

const CLOSE = -42;          // dBm touching, which is what a real board reports
const PER_DECADE = 20;      // free space loses about this much per ten times the distance
const UNIT = 50;            // mm at which it still counts as touching

export function createRadio(scene) {
  const reach = scene.radioReach == null ? 70000 : scene.radioReach;   // 70 m, as the real one does

  /* Signal strength in dBm, the same scale the micro:bit's own block reports:
     about -42 nose to nose and down towards -128 at the edge of range. */
  function strengthAt(mm) {
    const d = Math.max(UNIT, mm);
    const s = CLOSE - PER_DECADE * Math.log10(d / UNIT);
    return Math.max(-128, Math.round(s));
  }

  function between(a, b) {
    const mm = Math.hypot(a.x - b.x, a.y - b.y);
    return { distance: mm, reaches: mm <= reach, strength: strengthAt(mm) };
  }

  return { between, strengthAt, reach: () => reach };
}
