/* Bodies, collisions and movement, on top of matter.js.

   Matter owns where things are and what happens when they hit each other.
   We own what a Bit:Bot's wheels do, because a differential drive is not
   something a rigid-body engine knows about: two wheels at a fixed spacing
   give a forward speed and a turn rate, and we hand those to Matter as a
   velocity each step.

   Everything here is in millimetres and milliseconds, and y points DOWN as
   it does on a canvas, so a positive turn is clockwise.

   What Matter does NOT give us is a raycast with a distance on it - its own
   Query.ray says which bodies a line passes, not how far along. The sonar
   needs the distance, so the exact intersection is worked out below from the
   candidates Matter hands back. */

import Matter from "matter-js";
import { Point, Segment, Circle, Polygon } from "@flatten-js/core";

const { Engine, Composite, Bodies, Body, Query } = Matter;

const WALL = 400;                 // how thick the walls are, well clear of any robot

export function createMotion(scene) {
  const engine = Engine.create();
  engine.gravity.x = 0;
  engine.gravity.y = 0;           // looking down on the floor: nothing falls
  engine.gravity.scale = 0;

  const robots = new Map();       // id -> { matter body, our extras }
  const furniture = [];

  /* FURNITURE IS NOT FIXED AT BIRTH.

     A scene is still loaded from data, but a child adding a chair mid-lesson
     is the point of the room, so these go in and come out one at a time.
     `scene.furniture` stays the single truth - the light field reads it
     directly, which is why nothing here keeps a second copy of the specs. */
  function addThing(spec) {
    const b = Bodies.rectangle(spec.x + spec.w / 2, spec.y + spec.h / 2, spec.w, spec.h,
                               { isStatic: true, angle: spec.rot || 0, friction: 0.4 });
    b.plugin = { kind: "furniture", spec: spec };
    furniture.push(b);
    Composite.add(engine.world, b);
    return spec;
  }

  function removeThing(spec) {
    const i = furniture.findIndex(b => b.plugin.spec === spec);
    if (i < 0) return false;
    Composite.remove(engine.world, furniture[i]);
    furniture.splice(i, 1);
    return true;
  }

  function clearThings() {
    for (const b of furniture) Composite.remove(engine.world, b);
    furniture.length = 0;
  }

  /* What is under this point, newest first - so clicking a thing dropped on
     top of another picks the one you can actually see. */
  function thingAt(p) {
    for (let i = furniture.length - 1; i >= 0; i--) {
      const f = furniture[i].plugin.spec;
      if (p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h) return f;
    }
    return null;
  }

  for (const f of scene.furniture) addThing(f);

  if (scene.walls) {
    const S = scene.size, h = WALL / 2;
    for (const [x, y, w, hh] of [
      [S / 2, -h, S + WALL * 2, WALL], [S / 2, S + h, S + WALL * 2, WALL],
      [-h, S / 2, WALL, S + WALL * 2], [S + h, S / 2, WALL, S + WALL * 2]
    ]) {
      const b = Bodies.rectangle(x, y, w, hh, { isStatic: true });
      b.plugin = { kind: "wall" };
      Composite.add(engine.world, b);
    }
  }

  /* ---- bodies ---------------------------------------------------------- */

  /* HOW HARD THE TYRES HOLD before they slip. One number for every robot,
     because it is a property of the floor as much as of the tyre, and a
     class measuring their own Bit:Bot on their own hall floor sets it once
     and has the gym agree with them. */
  let grip = 0.3;
  function setGrip(v) {
    grip = Math.max(0.05, Math.min(1.2, v));
    for (const b of robots.values()) b.friction = grip;
    return grip;
  }

  function add(spec) {
    const r = spec.r == null ? 62 : spec.r;
    const b = Bodies.circle(spec.x, spec.y, r, {
      frictionAir: 0,            // our own model does the drag; Matter must not double it
      friction: grip,
      restitution: 0.05,         // a Bit:Bot does not bounce off a table leg
      mass: 0.25
    });
    Body.setAngle(b, spec.h == null ? 0 : spec.h);
    b.plugin = { kind: "robot", id: spec.id, r: r, z: spec.z == null ? 95 : spec.z, held: false };
    robots.set(spec.id, b);
    Composite.add(engine.world, b);
    return view(b);
  }

  /* A board taken off its chassis is a smaller thing, and it has to be
     smaller to the world as well as in the picture, or a bare micro:bit
     stops a sonar ping from a hand's width away. Matter scales a circle's
     radius with the body, so this is the whole of it. */
  function resize(id, r) {
    const b = robots.get(id);
    if (!b || !r) return false;
    const was = b.plugin.r;
    if (!was || Math.abs(r - was) < 0.5) return false;
    Body.scale(b, r / was, r / was);
    b.plugin.r = r;
    return true;
  }

  function remove(id) {
    const b = robots.get(id);
    if (!b) return false;
    Composite.remove(engine.world, b);
    robots.delete(id);
    return true;
  }

  /* A hand picking a robot up. Matter is told it is static, so the hand owns
     it completely and nothing can shove it while it is held. */
  function hold(id, on) {
    const b = robots.get(id);
    if (!b) return false;
    b.plugin.held = !!on;
    Body.setStatic(b, !!on);
    if (on) { Body.setVelocity(b, { x: 0, y: 0 }); Body.setAngularVelocity(b, 0); }
    return true;
  }

  function place(id, x, y, heading) {
    const b = robots.get(id);
    if (!b) return false;
    Body.setPosition(b, { x: x, y: y });
    if (heading != null) Body.setAngle(b, heading);
    Body.setVelocity(b, { x: 0, y: 0 });
    Body.setAngularVelocity(b, 0);
    return true;
  }

  /* The wheels. vl and vr are the two wheel speeds in mm/s, axle is how far
     apart they are: the middle of the robot goes at their average, and it
     turns at their difference over the axle. That is the whole of a
     differential drive, and it is ours rather than Matter's. */
  function drive(id, vl, vr, axle) {
    const b = robots.get(id);
    if (!b || b.plugin.held) return false;
    b.plugin.wheels = { vl: vl, vr: vr, axle: axle == null ? 110 : axle };
    return true;
  }

  /* One step.

     The trap: Body.setVelocity does NOT take units per step. It takes units
     per Matter's own base delta of 1000/60 ms, and scales them to whatever
     delta the body last saw. Hand it millimetres-per-5ms and the robot
     crawls at three tenths of the speed you asked for, which is exactly the
     bug this comment exists to stop coming back.

     So: millimetres per 1000/60 ms, which is just mm/s over 60. Matter then
     moves the body by v * dt / 1000 each step, which is what we wanted. */
  const BASE = 1000 / 60;

  function step(dt) {
    for (const b of robots.values()) {
      const w = b.plugin.wheels;
      if (!w || b.plugin.held) continue;
      const v = (w.vl + w.vr) / 2;                   // mm/s along the nose
      const turn = (w.vl - w.vr) / w.axle;           // radians/s, clockwise positive
      Body.setVelocity(b, { x: Math.cos(b.angle) * v / 60, y: Math.sin(b.angle) * v / 60 });
      Body.setAngularVelocity(b, turn / 60);
    }
    Engine.update(engine, dt);
    return bodies();
  }

  const view = b => ({
    id: b.plugin.id, x: b.position.x, y: b.position.y, h: b.angle,
    r: b.plugin.r, z: b.plugin.z, held: b.plugin.held,
    speed: Math.hypot(b.velocity.x, b.velocity.y)
  });
  const bodies = () => [...robots.values()].map(view);
  const bodyOf = id => { const b = robots.get(id); return b ? view(b) : null; };

  /* ---- asking the world where things are -------------------------------- */

  /* Matter narrows the field - Query.ray says which bodies a line goes near -
     and @flatten-js works out exactly where it meets them, because Matter's
     own raycast gives no distance and the sonar is all about distance.

     A sonar has a reach, so the "ray" is really a segment, which is the
     honest shape to intersect with and avoids flatten's Ray taking a normal
     rather than a direction. */

  const shapes = new WeakMap();                 // static bodies never move: build once
  function shapeOf(b) {
    if (shapes.has(b)) return shapes.get(b);
    const parts = b.parts.length > 1 ? b.parts.slice(1) : b.parts;
    const polys = parts.map(part => new Polygon(part.vertices.map(v => new Point(v.x, v.y))));
    if (b.isStatic) shapes.set(b, polys);
    return polys;
  }

  function raycast(from, angle, opts) {
    const o = opts || {};
    const reach = o.reach == null ? 2400 : o.reach;
    const c = Math.cos(angle), s = Math.sin(angle);
    const to = { x: from.x + c * reach, y: from.y + s * reach };
    const start = new Point(from.x, from.y);
    const ray = new Segment(start, new Point(to.x, to.y));
    let best = Infinity, what = null;

    const near = (p) => Math.hypot(p.x - from.x, p.y - from.y);

    for (const found of Query.ray(Composite.allBodies(engine.world), from, to, 1)) {
      const b = found.body;
      const robot = b.plugin && b.plugin.kind === "robot";
      if (robot && isSelf(b.plugin.id, o.self)) continue;      // a robot does not ping itself

      if (robot) {
        const r = b.plugin.r;
        /* The ray starting inside another robot means they are touching:
           zero, not nothing. */
        if (Math.hypot(b.position.x - from.x, b.position.y - from.y) <= r) {
          best = 0; what = b; continue;
        }
        for (const p of ray.intersect(new Circle(new Point(b.position.x, b.position.y), r))) {
          const d = near(p);
          if (d < best) { best = d; what = b; }
        }
        continue;
      }
      for (const poly of shapeOf(b)) {
        if (poly.contains(start)) { best = 0; what = b; break; }
        for (const p of ray.intersect(poly)) {
          const d = near(p);
          if (d < best) { best = d; what = b; }
        }
      }
    }
    if (!isFinite(best)) return Infinity;

    /* A wall is painted plaster, not a mirror: it scatters the ping about, so
       an echo comes back even from a fair slant. Only a really glancing hit,
       past about 75 degrees, loses it altogether. */
    if (what && what.plugin && what.plugin.kind === "wall") {
      const n = wallNormal(from.x + c * best, from.y + s * best);
      if (Math.abs(c * n.x + s * n.y) < 0.25) return Infinity;
    }
    return best;
  }

  function wallNormal(x, y) {
    const S = scene.size;
    if (y <= 1) return { x: 0, y: 1 };
    if (y >= S - 1) return { x: 0, y: -1 };
    if (x <= 1) return { x: 1, y: 0 };
    return { x: -1, y: 0 };
  }

  const isSelf = (id, self) => self != null && id === self;

  /* Who is touching whom, straight out of Matter's own pair list. */
  function contacts(id) {
    const me = robots.get(id);
    if (!me) return [];
    const out = [];
    for (const pair of engine.pairs.list) {
      if (!pair.isActive) continue;
      const other = pair.bodyA === me ? pair.bodyB : pair.bodyB === me ? pair.bodyA : null;
      if (!other) continue;
      const kind = other.plugin && other.plugin.kind;
      out.push({
        what: kind === "robot" ? "robot" : kind === "wall" ? "wall"
            : (other.plugin && other.plugin.spec && other.plugin.spec.name) || "furniture",
        kind: kind || "furniture",
        other: kind === "robot" ? other.plugin.id : null,
        overlap: pair.collision ? pair.collision.depth : 0
      });
    }
    return out;
  }

  /* What blocks light: the furniture as it stands, and each robot as a square
     the width of its chassis, which is close enough for a shadow. */
  function occluders() {
    const out = scene.furniture.map(f => ({ box: f, owner: f }));
    for (const b of robots.values()) {
      const r = b.plugin.r;
      out.push({
        box: { x: b.position.x - r, y: b.position.y - r, w: r * 2, h: r * 2, z: b.plugin.z, rot: 0 },
        owner: b.plugin.id
      });
    }
    return out;
  }

  return { add, remove, resize, setGrip, grip: () => grip, hold, place, drive, step, bodies, bodyOf, raycast, contacts, occluders,
           addThing, removeThing, clearThings, thingAt,
           engine, size: () => scene.size };
}
