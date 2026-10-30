/* The light field: how much light falls on one spot, facing one way.

   Height is the whole story. A ceiling panel is 2.4 m up, so its light comes
   almost straight DOWN and turning a robot on the spot barely changes the
   reading. A torch sits at 300 mm, level with the eyes, so its light comes in
   sideways and the two eyes disagree - which is what makes chasing a torch
   work at all. The sun is a special case with no distance at all: it is so far
   away that only the ANGLE matters, which is why outdoor shadows all lie the
   same way.

   Light is in gym units, where a lit classroom reads about 3. One unit is
   roughly 100 real lux.

   Three kinds of source, and a scene may mix them freely:
     ambient      a flat amount from every direction (sky, room bounce)
     point        a lamp: inverse square, and it casts a spreading shadow
     directional  the sun: no falloff, and it casts a parallel shadow

   The field knows nothing about sensors. A caller asks for a point and a
   normal; turning the answer into a number a child reads is the LDR's job,
   and the LDR belongs to the robot. That split is what lets the same robot
   work indoors and outdoors with no change at all. */

import { hull, pointInPoly, boxCorners, boxCentre } from "../../core/geom.js";

const D2R = Math.PI / 180;
/* How high a light hangs, when the scene does not say. */
const LAMP_Z = { ceiling: 2500, floor: 300 };
const LAMP_I = { ceiling: 18, floor: 1.92 };

/* A normal from a heading and a tilt off vertical, which is how a Bit:Bot eye
   is mounted: looking up and forward. tilt 0 is straight up. */
export function normalFrom(facing, tilt) {
  const nh = Math.sin(tilt), nz = Math.cos(tilt);
  return { x: Math.cos(facing) * nh, y: Math.sin(facing) * nh, z: nz };
}
export const UP = { x: 0, y: 0, z: 1 };

export function createLight(scene, geometry) {
  let sources = [];        // the point and directional ones
  let ambient = 0;
  let bounce = [];
  let shadows = [];        // one entry per source: [{poly, owner}]
  let dirty = true;

  /* Where the sun is, as the direction light TRAVELS, plus the direction back
     towards it which is what a surface normal is measured against. Azimuth is
     a compass bearing: 0 is up the screen, and it turns clockwise. */
  function sunVectors(sun) {
    const a = sun.azimuth * D2R, e = sun.elevation * D2R;
    const toSun = { x: Math.sin(a) * Math.cos(e), y: -Math.cos(a) * Math.cos(e), z: Math.sin(e) };
    return { toSun: toSun, travel: { x: -toSun.x, y: -toSun.y, z: -toSun.z } };
  }

  function gather() {
    sources = [];
    ambient = scene.sky.light || 0;

    scene.lamps.forEach((L, i) => {
      if (!L.on) return;
      sources.push({
        key: "lamp:" + i, kind: "point", x: L.x, y: L.y,
        z: L.z == null ? LAMP_Z[L.kind] : L.z,
        I: L.I == null ? LAMP_I[L.kind] : L.I
      });
      /* A ceiling panel floods a whole room, so some of it arrives from
         everywhere at once; a torch does not. */
      if (L.kind === "ceiling") ambient += L.ambient == null ? 0.28 : L.ambient;
    });

    if (scene.sun) {
      const v = sunVectors(scene.sun);
      sources.push({ key: "sun", kind: "sun", I: scene.sun.I, toSun: v.toSun, travel: v.travel,
                     elevation: scene.sun.elevation });
      ambient += scene.sun.sky == null ? scene.sun.I * 0.2 : scene.sun.sky;
    }
    ambient += scene.sky.bounce || 0;
  }

  /* How long a shadow is, is similar triangles: a lamp at height H and an
     object of height z standing d away throws its shadow d*z/(H-z) further
     on. The shadow is the whole area the object hides, which is the hull of
     its corners and their shadows. The sun's version is simpler: every corner
     moves the same way by the same amount, because the rays are parallel. */
  function shadowOf(src, box) {
    const corners = boxCorners(box);
    if (src.kind === "sun") {
      if (src.elevation >= 89.5) return corners;          // noon overhead: none to speak of
      const len = Math.min((box.z || 200) / Math.tan(src.elevation * D2R), 6000);
      const far = corners.map(c => ({ x: c.x + src.travel.x * len, y: c.y + src.travel.y * len }));
      return hull(corners.concat(far));
    }
    const z = Math.min(box.z || 200, src.z - 40);
    if (z <= 0) return corners;
    const stretch = z / Math.max(1, src.z - z);
    const far = corners.map(c => {
      const dx = c.x - src.x, dy = c.y - src.y, d = Math.hypot(dx, dy) || 1;
      const len = Math.min(d * stretch, 3000);
      return { x: c.x + dx / d * len, y: c.y + dy / d * len };
    });
    return hull(corners.concat(far));
  }

  function buildShadows() {
    const casters = geometry.occluders();
    shadows = sources.map(src => casters.map(c => ({ poly: shadowOf(src, c.box), owner: c.owner })));
  }

  function shaded(i, x, y, self) {
    const set = shadows[i] || [];
    for (const e of set) {
      if (e.owner && e.owner === self) continue;    // your own shadow is not on your own eyes
      if (pointInPoly(x, y, e.poly)) return true;
    }
    return false;
  }

  /* Each lit object throws a little of that light back into the room: a
     whiteboard brightens the wall beside it, a black backpack does not. */
  function buildBounce() {
    bounce = [];
    for (const bx of scene.furniture) {
      const r = bx.reflect == null ? 0.4 : bx.reflect;
      if (r < 0.05) continue;
      const o = boxCentre(bx);
      const e = direct(o.x, o.y, 0, null, bx);
      if (e < 0.02) continue;
      const face = Math.max(bx.w * bx.h, 2 * (bx.w + bx.h) * (bx.z || 100));
      bounce.push({ x: o.x, y: o.y, I: r * e * 0.35 * Math.min(1.6, face / 3e5) });
    }
  }

  /* Straight from the sources, with no bounce - which is also what the bounce
     pass itself needs, or it would chase its own tail. */
  function direct(x, y, z, normal, self) {
    let e = ambient;
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      let aim = 1;
      if (src.kind === "sun") {
        if (normal) {
          aim = normal.x * src.toSun.x + normal.y * src.toSun.y + normal.z * src.toSun.z;
          if (aim <= 0) continue;                   // the board itself is in the way
        }
        if (shaded(i, x, y, self)) continue;
        e += src.I * aim;                           // no falloff: it is 150 million km away
        continue;
      }
      const dx = src.x - x, dy = src.y - y, dz = src.z - z;
      const d2 = (dx * dx + dy * dy + dz * dz) / 1e6;        // m^2, all three axes
      const d = Math.sqrt(d2) * 1000 || 1;
      if (normal) {
        aim = (normal.x * dx + normal.y * dy + normal.z * dz) / d;
        if (aim <= 0) continue;
      }
      if (shaded(i, x, y, self)) continue;
      e += src.I * aim / (d2 + 0.09);               // inverse square, softened close up
    }
    return e;
  }

  function rebuild() {
    gather();
    buildShadows();
    buildBounce();
    dirty = false;
  }

  /* The one question this field answers:

       at({x, y}, { z, normal, self, bounce })

     normal omitted   straight up, which is the common case
     normal null      from every direction, which only the bounce pass wants
     normal {x,y,z}   a unit normal, from normalFrom(facing, tilt) for an eye

     `self` is whoever is asking, so its own shadow is kept off its own
     sensors; `bounce: false` leaves out light thrown back off the furniture. */
  function at(p, opts) {
    if (dirty) rebuild();
    const o = opts || {};
    const z = o.z == null ? 0 : o.z;
    const normal = o.normal === undefined ? UP : o.normal;
    let e = direct(p.x, p.y, z, normal, o.self);
    if (o.bounce !== false) {
      for (const B of bounce) {
        const dx = B.x - p.x, dy = B.y - p.y;
        e += B.I / ((dx * dx + dy * dy) / 1e6 + 0.3);
      }
    }
    return e;
  }

  return {
    at, rebuild,
    stale() { dirty = true; },
    ambient: () => { if (dirty) rebuild(); return ambient; },
    sources: () => { if (dirty) rebuild(); return sources.slice(); },
    shadows: () => { if (dirty) rebuild(); return shadows; }
  };
}
