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

import { TAU, hull, pointInPoly, boxCorners, boxCentre } from "../../core/geom.js";
import { prepare, illuminate, sample, ROOM_HEIGHT } from "./transport.js";
import { compute as visibilityFrom, inPolygon } from "visibility-polygon";

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

export function createLight(scene, bodies) {
  let sources = [];        // the point and directional ones
  let ambient = 0;
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
      if (L.ambient) ambient += L.ambient;     // a scene may still add its own
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

  /* Two kinds of shadow, and which one a thing casts depends on whether it is
     taller than the lamp.

     SHORTER than the lamp: the shadow ENDS. A 95 mm robot under a 2500 mm
     ceiling panel throws about 240 mm of shadow and no more, and that is the
     whole reason a torch down at 300 mm behaves differently from a panel
     overhead. Similar triangles, worked out per object.

     TALLER than the lamp, or the sun at any height: the shadow runs until it
     meets something. That is a visibility problem, and visibility-polygon
     solves it properly - exactly, and for concave and overlapping shapes
     that the hull-of-corners trick only approximated. One polygon per source
     covers every tall thing at once: outside it means in shadow. */
  function buildShadows() {
    const casters = bodies.occluders();
    shadows = sources.map(src => {
      const quads = [], walls = [];
      for (const c of casters) {
        const tall = src.kind === "sun" ? false : (c.box.z || 200) >= src.z - 40;
        if (tall) walls.push(c);
        else quads.push({ poly: shadowOf(src, c.box), owner: c.owner });
      }
      return { quads: quads, visible: walls.length ? visibility(src, walls) : null };
    });
  }

  /* What this lamp can see, given the things it cannot see past. The room's
     own edge is included or the polygon would be unbounded. */
  function visibility(src, walls) {
    const W = scene.w, H = scene.h, pad = 50;
    const segs = [
      [[-pad, -pad], [W + pad, -pad]], [[W + pad, -pad], [W + pad, H + pad]],
      [[W + pad, H + pad], [-pad, H + pad]], [[-pad, H + pad], [-pad, -pad]]
    ];
    for (const c of walls) {
      const v = boxCorners(c.box);
      for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
        segs.push([[v[j].x, v[j].y], [v[i].x, v[i].y]]);
      }
    }
    try {
      return visibilityFrom([src.x, src.y], segs);
    } catch (e) {
      return null;            // a lamp standing inside a wall: treat it as seeing all
    }
  }

  function shaded(i, x, y, self) {
    const set = shadows[i];
    if (!set) return false;
    for (const e of set.quads) {
      if (e.owner != null && e.owner === self) continue;   // not your own shadow on your own eyes
      if (pointInPoly(x, y, e.poly)) return true;
    }
    /* Nothing short of the lamp blocked it, so: can the lamp see this spot at
       all? Only tall things are in here, and a robot is never one of them, so
       there is no self to worry about. */
    if (set.visible && !inPolygon([x, y], set.visible)) return true;
    return false;
  }

  /* Straight from the sources: no ambient and no bounce. Both of those are
     worked out FROM this, so neither may be in it or the room would light
     itself from its own glow, round and round. */
  function direct(x, y, z, normal, self, noShadow) {
    let e = 0;
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      let aim = 1;
      if (src.kind === "sun") {
        if (normal) {
          aim = normal.x * src.toSun.x + normal.y * src.toSun.y + normal.z * src.toSun.z;
          if (aim <= 0) continue;                   // the board itself is in the way
        }
        if (!noShadow && shaded(i, x, y, self)) continue;
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
      if (!noShadow && shaded(i, x, y, self)) continue;
      e += src.I * aim / (d2 + 0.09);               // inverse square, softened close up
    }
    return e;
  }

  /* THE ROOM LIGHTS ITSELF, and it does it by bouncing off its own surfaces.

     What was here before was a guess with two bugs in it. Each object threw
     back a single glow from its own centre, which has no idea which way it
     is facing: it shone out of the shadow it was itself casting and lit the
     floor underneath itself. Measured on a table between two lamps, every
     scrap of light in the shadow was the table's own bounce and the shadow
     kept two thirds of the open-floor reading. The ambient beside it was a
     flat 0.28 for a ceiling panel and NOTHING for a floor lamp, so a room
     lit by two standing lamps had an ambient of 0.004 - and the only thing
     stopping its shadows being black holes was the bug above.

     Now the room is cut into patches - floor, ceiling, four walls, every
     face of every table - the light that reaches each one is worked out,
     and they throw it at each other until it settles, with a ray between
     every pair that decides whether they can see each other at all. See
     transport.js. A face cannot light what it cannot see, so a table cannot
     light its own shadow, and the grey in a shadow is now the room's walls
     and floor, which is where it comes from in life.

     IT IS BUILT FROM THE FURNITURE AND THE LAMPS, NOT THE ROBOTS. A solve
     is tens of milliseconds and a robot moves sixty times a second; a
     95 mm robot also contributes nothing anyone could measure to the glow
     of a room. So the bake is keyed on the things that matter and is left
     alone while robots drive about - which is the difference between this
     being affordable and not. */
  let indirect = null;
  let prep = null;
  let shapedFor = "", litFor = "";

  /* TWO KEYS, because the two halves cost wildly different amounts. The
     shape of the room - which decides every ray - changes when furniture
     moves. What the lamps are doing changes far more often and costs
     almost nothing to redo. Neither key mentions the robots: a 95 mm robot
     adds nothing to the glow of a room that anyone could measure, and a
     solve per frame of a drag is not affordable. */
  function shapeKey() {
    let k = scene.w + "x" + scene.h + "|" + scene.ground.material + "|" + (scene.sun ? "sun" : "-") +
            "|" + (scene.sky.walls == null ? 0.5 : scene.sky.walls);
    for (const f of scene.furniture)
      k += "|F" + Math.round(f.x) + "," + Math.round(f.y) + "," + f.w + "," + f.h +
           "," + (f.z || 0) + "," + (f.rot || 0).toFixed(3) + "," + f.reflect;
    return k;
  }
  function lampKey() {
    let k = ambient.toFixed(6);
    for (const L of scene.lamps)
      k += "|L" + L.x + "," + L.y + "," + L.kind + "," + (L.on ? 1 : 0) +
           "," + (L.I == null ? "" : L.I) + "," + (L.z == null ? "" : L.z);
    if (scene.sun) k += "|S" + scene.sun.azimuth + "," + scene.sun.elevation + "," + scene.sun.I;
    return k;
  }

  function buildIndirect() {
    const shape = shapeKey();
    if (shape !== shapedFor) {
      shapedFor = shape; litFor = "";
      prep = prepare(scene, {
        ground: scene.ground.reflect == null ? 0.25 : scene.ground.reflect,
        walls: scene.sky.walls == null ? 0.5 : scene.sky.walls,
        thing: bx => (bx.reflect == null ? 0.4 : bx.reflect)
      }, scene.furniture.map(f => ({ box: f, owner: f })),
         { indoor: !scene.sun, height: ROOM_HEIGHT, grid: 14, z: 40 });
    }
    const lamps = lampKey();
    if (lamps === litFor) return;
    litFor = lamps;
    /* what lands on each patch straight from the lamps, its own body not
       counted as something standing in its way */
    indirect = illuminate(prep,
      p => ambient + direct(p.x, p.y, p.z, { x: p.nx, y: p.ny, z: p.nz }, p.owner), 4);
  }

  function rebuild() {
    gather();
    buildShadows();
    buildIndirect();
    profiles = null;
    dirty = false;
  }

  /* How bright this source makes the floor at a given distance from it, with
     nothing in the way. The picture needs a curve to draw its glow with, and
     SAMPLING the field is the one way to be sure the glow matches the numbers
     a sensor would read - restating the inverse-square law in the renderer is
     how the two quietly drift apart, and it forgets the bounce off the
     furniture entirely. Sixteen directions averaged, with nothing in the way:
     the shadows are drawn as polygons on top, so counting them in here too
     would darken them twice. The bounce is left out for the same reason and
     a better one: it is not this lamp's, it is the whole room's, and the
     renderer lays it down once underneath every glow. */
  const PROFILE_STEPS = 12;
  let profiles = null;
  function profile(i) {
    if (!profiles) profiles = sources.map(profileOf);
    return profiles[i];
  }
  function profileOf(src) {
    const reach = scene.span * 1.5, out = [];
    for (let k = 0; k <= PROFILE_STEPS; k++) {
      const d = reach * k / PROFILE_STEPS;
      let sum = 0;
      for (let a = 0; a < 16; a++) {
        const th = a * TAU / 16;
        sum += at({ x: src.x + Math.cos(th) * d, y: src.y + Math.sin(th) * d },
                  { z: 0, shadows: false, bounce: false });
      }
      /* A glow cannot brighten further from the lamp. It can in the samples,
         because the bounce off a table is only on the table's side, and a
         bright ring is not something a radial gradient can honestly say. */
      out.push(k ? Math.min(sum / 16, out[k - 1]) : sum / 16);
    }
    return { reach: reach, e: out };
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
    let e = ambient + direct(p.x, p.y, z, normal, o.self, o.shadows === false);
    if (o.bounce !== false) e += sample(indirect, p.x, p.y, normal);
    return e;
  }

  return {
    at, rebuild,
    stale() { dirty = true; },
    ambient: () => { if (dirty) rebuild(); return ambient; },
    /* The baked indirect, for the renderer: the SAME grid the sensors read,
       so the grey in a drawn shadow is the grey a light sensor reports. */
    indirect: () => { if (dirty) rebuild(); return indirect; },
    sources: () => { if (dirty) rebuild(); return sources.slice(); },
    shadows: () => { if (dirty) rebuild(); return shadows; },
    /* flat list for the renderer: every shadow it has to draw, and the lit
       region of each source, so the picture is built from the same polygons
       the sensors are reading. They cannot disagree. */
    regions: () => {
      if (dirty) rebuild();
      return sources.map((src, i) => ({
        source: src,
        quads: shadows[i].quads.map(q => q.poly),
        visible: shadows[i].visible,
        profile: profile(i)
      }));
    }
  };
}
