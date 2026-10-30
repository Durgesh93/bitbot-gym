/* The surface field: what the floor is like, right under one point.

   A line on the floor is a stripe of a given width between two points, which
   is geometry rather than a drawn bitmap - so a test can check a line sensor
   with no canvas anywhere. The field answers with the physical facts; what
   counts as "on the line" is a threshold, and a threshold belongs to the
   sensor that owns it. */

import { MATERIALS } from "../scene.js";

/* How far p is from the segment a-b. */
function toSegment(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

export function createSurface(scene) {
  const g = scene.ground;
  const lines = scene.lines.map(l => ({
    a: { x: l.from[0], y: l.from[1] },
    b: { x: l.to[0], y: l.to[1] },
    half: l.width / 2,
    reflect: l.reflect == null ? 0.03 : l.reflect   // black tape swallows the light
  }));

  function at(p) {
    const inside = p.x >= 0 && p.y >= 0 && p.x <= scene.size && p.y <= scene.size;
    for (const l of lines) {
      if (toSegment(p, l.a, l.b) <= l.half) {
        return { material: g.material, reflect: l.reflect, dark: true,
                 mu: g.mu, roll: g.roll, dead: g.dead, inside: inside };
      }
    }
    /* Off the edge of an open scene there is still ground; in a walled room
       the robot can never get there, so it does not matter what we say. */
    return { material: g.material, reflect: g.reflect, dark: false,
             mu: g.mu, roll: g.roll, dead: g.dead, inside: inside };
  }

  return { at, lines: () => lines, materials: () => MATERIALS };
}
