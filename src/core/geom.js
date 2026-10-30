/* Flat geometry in millimetres. Canvas axes: x to the right, y DOWN, so a
   positive angle turns clockwise. Nothing here knows what a robot is.

   A box is {x, y, w, h, rot}: x,y is its top-left corner before it is turned,
   and rot turns it about its own centre. That is the shape the room editor
   has always used, so the scenes read the same as the old ones. */

export const TAU = Math.PI * 2;

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* Turn a point about the origin. */
export function rotate(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export const boxCentre = bx => ({ x: bx.x + bx.w / 2, y: bx.y + bx.h / 2 });

/* Into and out of a box's own frame, where it is axis-aligned and centred. */
export function boxLocal(bx, p) {
  const o = boxCentre(bx), c = Math.cos(bx.rot || 0), s = Math.sin(bx.rot || 0);
  const dx = p.x - o.x, dy = p.y - o.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

export function boxWorld(bx, p) {
  const o = boxCentre(bx), c = Math.cos(bx.rot || 0), s = Math.sin(bx.rot || 0);
  return { x: o.x + p.x * c - p.y * s, y: o.y + p.x * s + p.y * c };
}

export function boxContains(bx, p) {
  const l = boxLocal(bx, p);
  return Math.abs(l.x) <= bx.w / 2 && Math.abs(l.y) <= bx.h / 2;
}

export function boxCorners(bx) {
  const hw = bx.w / 2, hh = bx.h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
    .map(c => boxWorld(bx, { x: c[0], y: c[1] }));
}

/* The nearest point of a box to p, and how far outside the box p is. Used for
   pushing a round robot back out of a square table. */
export function boxNearest(bx, p) {
  const l = boxLocal(bx, p);
  const near = {
    x: Math.max(-bx.w / 2, Math.min(bx.w / 2, l.x)),
    y: Math.max(-bx.h / 2, Math.min(bx.h / 2, l.y))
  };
  const dx = l.x - near.x, dy = l.y - near.y;
  return { point: boxWorld(bx, near), gap: Math.hypot(dx, dy), local: l, nearLocal: near };
}

/* The smallest convex outline containing every point: a monotone chain, which
   is all a shadow ever needs. */
export function hull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
