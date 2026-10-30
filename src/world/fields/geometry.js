/* The geometry field: where the solid things are.

   Two kinds of solid thing live here. The scene's furniture never moves, so
   it is taken once. Bodies - the robots - are handed in fresh every tick by
   whoever owns them, which is the whole trick: a robot never has to know
   another robot exists. It puts its body in, and the next ray anybody casts
   can hit it.

   Answers two questions and nothing else:
     raycast(from, angle)  how far to the first solid thing, in mm
     contacts(body)        what this body is overlapping, and which way out  */

import { boxContains, boxNearest, boxCorners } from "../../core/geom.js";

const STEP = 4;          // how finely a ray is walked, in mm
const REACH = 2400;      // no sensor in the gym sees further than this

/* Who a body IS. A body may name itself with an `id` or with an `owner` (the
   device that holds it), and the two have to agree, because getting this
   wrong is silent and nasty: compare with `===` alone and a body with neither
   matches every other body with neither, so two robots never collide and a
   ray passes straight through one. Both of those were real bugs, found by
   the environment contract the first time it ran. */
function sameBody(a, b) {
  if (a === b) return true;
  if (a.id != null && b.id != null) return a.id === b.id;
  if (a.owner != null && b.owner != null) return a.owner === b.owner;
  return false;
}

/* Is this body the one asking? `self` may be an id or an owner. Nothing is
   ever self when nobody asked. */
function isSelf(body, self) {
  if (self == null) return false;
  return body === self || body.id === self || body.owner === self;
}

export function createGeometry(scene) {
  let bodies = [];

  /* A wall is painted plaster, not a mirror: it scatters a ping about, so an
     echo comes back even from a fair slant. Only a really glancing hit, past
     about 75 degrees, loses it altogether. */
  const glances = (c, s, nx, ny) => Math.abs(c * nx + s * ny) < 0.25;

  function raycast(from, ang, opts) {
    const o = opts || {};
    const self = o.self;
    const reach = o.reach == null ? REACH : o.reach;
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let d = 0; d < reach; d += STEP) {
      const x = from.x + c * d, y = from.y + s * d;
      if (x < 0 || y < 0 || x > scene.size || y > scene.size) {
        if (!scene.walls) return Infinity;        // open ground: nothing out there to echo
        const nx = x < 0 ? 1 : x > scene.size ? -1 : 0;
        const ny = y < 0 ? 1 : y > scene.size ? -1 : 0;
        return glances(c, s, nx, ny) ? Infinity : d;
      }
      for (const bx of scene.furniture) if (boxContains(bx, { x, y })) return d;
      for (const b of bodies) {
        if (isSelf(b, self)) continue;            // a robot does not ping itself
        if (Math.hypot(b.x - x, b.y - y) <= b.r) return d;
      }
    }
    return Infinity;
  }

  /* Everything this body is inside, and the spot just outside it to be put
     back to. The caller moves it; the field only reports. */
  function contacts(body) {
    const out = [];
    if (scene.walls) {
      const r = body.r;
      if (body.x < r) out.push({ what: "wall", to: { x: r, y: body.y } });
      if (body.y < r) out.push({ what: "wall", to: { x: body.x, y: r } });
      if (body.x > scene.size - r) out.push({ what: "wall", to: { x: scene.size - r, y: body.y } });
      if (body.y > scene.size - r) out.push({ what: "wall", to: { x: body.x, y: scene.size - r } });
    }
    for (const bx of scene.furniture) {
      const n = boxNearest(bx, body);
      if (n.gap >= body.r) continue;
      let dx = n.local.x - n.nearLocal.x, dy = n.local.y - n.nearLocal.y;
      let d = Math.hypot(dx, dy);
      if (d < 0.001) { dx = 0; dy = -1; d = 1; }   // dead centre: pick a way out
      const push = {
        x: n.nearLocal.x + dx / d * body.r,
        y: n.nearLocal.y + dy / d * body.r
      };
      out.push({ what: bx.name || "furniture", box: bx, local: push });
    }
    for (const o of bodies) {
      if (sameBody(o, body)) continue;
      const dx = body.x - o.x, dy = body.y - o.y, d = Math.hypot(dx, dy);
      if (d < body.r + o.r && d > 0.001) {
        out.push({ what: "robot", other: o, overlap: (body.r + o.r - d) / 2, nx: dx / d, ny: dy / d });
      }
    }
    return out;
  }

  /* What blocks light. Furniture as it stands; a robot as a square the size
     of its own width, which is close enough for a shadow and much cheaper. */
  function occluders() {
    const out = scene.furniture.map(bx => ({ box: bx, owner: bx }));
    for (const b of bodies) {
      out.push({
        box: { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2, z: b.z == null ? 95 : b.z, rot: 0 },
        owner: b.owner == null ? b.id : b.owner      // so an id works here too
      });
    }
    return out;
  }

  return {
    setBodies(list) { bodies = list || []; },
    bodies: () => bodies,
    raycast, contacts, occluders, sameBody, isSelf,
    corners: boxCorners,
    size: () => scene.size
  };
}
