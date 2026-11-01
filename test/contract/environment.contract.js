import { describe, it, expect } from "vitest";
import { createEnvironment } from "../../src/world/environment.js";
import { normalFrom } from "../../src/world/fields/light.js";

/* THE ENVIRONMENT CONTRACT.

   Every scene has to pass all of this. That is the point: a scene is a data
   file, and this suite is the promise the data file makes to every robot that
   will ever be put in it. Write a new scene, add one line to the scenes
   index, and it is held to exactly these rules.

   Nothing in here mentions a micro:bit or a Bit:Bot. It asks the six
   questions and checks the answers are physically sensible. */

const BODY = { r: 62, z: 95 };
const EYE = facing => ({ z: 42, normal: normalFrom(facing, 0.80) });

export function describeEnvironmentContract(label, data) {
  describe("the environment contract: " + label, () => {
    const make = () => createEnvironment(data);

    it("answers all six questions", () => {
      const env = make();
      const p = env.starts()[0];
      expect(typeof env.raycast(p, 0)).toBe("number");
      expect(typeof env.lightAt(p, EYE(0))).toBe("number");
      expect(typeof env.soundAt(p)).toBe("number");
      expect(env.surfaceAt(p)).toHaveProperty("material");
      expect(env.mediumAt()).toHaveProperty("speedOfSound");
      expect(env.radioBetween(p, { x: 0, y: 0 })).toHaveProperty("strength");
    });

    it("has at least one start pose, inside the room and not inside the furniture", () => {
      const env = make();
      const starts = env.starts();
      expect(starts.length).toBeGreaterThan(0);
      for (const s of starts) {
        expect(s.x).toBeGreaterThan(0);
        expect(s.y).toBeGreaterThan(0);
        expect(s.x).toBeLessThan(env.size);
        expect(s.y).toBeLessThan(env.size);
        env.addBody({ id: 1, ...s, ...BODY });
        env.step(16);
        expect(env.contacts(1)).toEqual([]);
        env.removeBody(1);
      }
    });

    it("never reports a negative distance, and never a NaN", () => {
      const env = make();
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2;
        const d = env.raycast({ x: env.size / 2, y: env.size / 2 }, a);
        expect(Number.isNaN(d)).toBe(false);
        expect(d).toBeGreaterThanOrEqual(0);
      }
    });

    it("never reports negative light or negative sound", () => {
      const env = make();
      for (const p of grid(env.size)) {
        expect(env.lightAt(p, EYE(0))).toBeGreaterThanOrEqual(0);
        expect(env.soundAt(p)).toBeGreaterThanOrEqual(0);
      }
    });

    it("has a floor you can actually drive on", () => {
      const env = make();
      for (const p of grid(env.size)) {
        const s = env.surfaceAt(p);
        expect(s.mu).toBeGreaterThan(0);
        expect(s.mu).toBeLessThanOrEqual(1);
        expect(s.reflect).toBeGreaterThanOrEqual(0);
        expect(s.reflect).toBeLessThanOrEqual(1);
      }
    });

    it("has air that carries sound at a believable speed", () => {
      const m = make().mediumAt();
      expect(m.speedOfSound).toBeGreaterThan(300);
      expect(m.speedOfSound).toBeLessThan(370);
    });

    it("gives the same answer twice when nothing has moved", () => {
      const env = make();
      const p = { x: env.size / 2, y: env.size / 3 };
      const once = [env.raycast(p, 0.3), env.lightAt(p, EYE(0.3)), env.soundAt(p)];
      env.moved();
      const twice = [env.raycast(p, 0.3), env.lightAt(p, EYE(0.3)), env.soundAt(p)];
      expect(twice).toEqual(once);
    });

    it("lets one body block another's ray, but never its own", () => {
      /* The contract must not assume the middle of the room is empty - the
         playground has a cone standing right in it. So find a clear spot
         with room in front of it, whatever the scene looks like. */
      const env = make();
      const spot = clearSpot(env, 500);
      expect(spot, "no clear 500 mm of floor anywhere in this scene").toBeTruthy();

      const ahead = { x: spot.x + Math.cos(spot.a) * 300, y: spot.y + Math.sin(spot.a) * 300 };
      env.addBody({ id: 7, ...ahead, ...BODY });
      const blocked = env.raycast(spot, spot.a);
      const ownRay = env.raycast(spot, spot.a, { self: 7 });

      expect(blocked).toBeLessThanOrEqual(300);
      expect(ownRay).toBeGreaterThan(blocked);
    });

    it("pushes two bodies that are on top of each other apart, and never a body off itself", () => {
      const env = make();
      const spot = clearSpot(env, 500);
      env.addBody({ id: 1, x: spot.x, y: spot.y, ...BODY });
      env.addBody({ id: 2, x: spot.x + 20, y: spot.y, ...BODY });
      env.step(16);
      const hit = env.contacts(1).filter(c => c.what === "robot");
      expect(hit).toHaveLength(1);
      expect(hit[0].other).toBe(2);
      expect(hit[0].overlap).toBeGreaterThan(0);
      expect(env.contacts(1).some(c => c.other === 1)).toBe(false);

      /* and they do not stay on top of each other */
      const gap = () => Math.hypot(env.bodyOf(2).x - env.bodyOf(1).x,
                                   env.bodyOf(2).y - env.bodyOf(1).y);
      const before = gap();
      for (let i = 0; i < 30; i++) env.step(16);
      expect(gap()).toBeGreaterThan(before);
    });

    it("keeps a body inside a walled room and lets it leave an open one", () => {
      const env = make();
      /* drive hard at the left wall and see where it ends up */
      env.addBody({ id: 1, x: 300, y: env.size / 2, ...BODY });
      env.drive(1, -400, -400);
      for (let i = 0; i < 200; i++) env.step(16);
      const x = env.bodyOf(1).x;
      if (env.scene.walls) expect(x).toBeGreaterThan(0);
      else expect(x).toBeLessThan(0);
    });

    it("hears a board's own buzzer louder than its neighbour's", () => {
      const env = make();
      const mid = env.size / 2;
      env.setEmitters([{ owner: 1, x: mid, y: mid }]);
      const mine = env.soundAt({ x: mid, y: mid }, { self: 1 });
      /* Where a neighbour can actually BE. Two boards cannot share a spot
         on the floor, and asking what the field says at nought millimetres
         asks for one over nought: the sound field is now a real wave and
         it answers that question with a very large number, not with the
         255 a board reports when the buzzer is its own. */
      const theirs = env.soundAt({ x: mid + 250, y: mid }, { self: 2 });
      expect(mine).toBeGreaterThan(theirs);
    });

    it("gives the same radio strength both ways round", () => {
      const env = make();
      const a = { x: 100, y: 100 }, b = { x: env.size - 100, y: env.size - 200 };
      expect(env.radioBetween(a, b).strength).toBe(env.radioBetween(b, a).strength);
    });

    it("makes a weaker radio signal the further apart two boards are", () => {
      const env = make();
      const near = env.radioBetween({ x: 100, y: 100 }, { x: 300, y: 100 }).strength;
      const far = env.radioBetween({ x: 100, y: 100 }, { x: env.size - 100, y: 100 }).strength;
      expect(far).toBeLessThan(near);
    });

    it("hands out a snapshot that is plain data and survives being copied", () => {
      /* If this fails, the snapshot cannot cross into a Web Worker or be
         compared in a test, and some component is holding a reference it
         should not have. */
      const env = make();
      env.addBody({ id: 1, x: 500, y: 500, ...BODY });
      const snap = env.snapshot();
      const copy = JSON.parse(JSON.stringify(snap));
      expect(copy.bodies[0]).toEqual({ id: 1, x: 500, y: 500, h: 0, r: 62, z: 95,
                                      held: false, speed: 0 });
      /* nothing in here may be a live matter.js body, or the snapshot cannot
         cross into a Worker and a component could reach back and move it */
      expect(JSON.stringify(snap)).not.toContain("\"parts\"");
    });

    it("works for a robot that only ever asks the six questions", () => {
      /* A pretend Bit:Bot built from the contract alone: two eyes, a sonar
         and a line sensor. If this reads sensibly in every scene, then the
         real one will too, because the real one asks the same six things. */
      const env = make();
      const p = env.starts()[0];
      const eyeAt = (side) => {
        const a = p.heading + side * 0.44;
        const sx = p.x + Math.cos(p.heading) * 55 - Math.sin(p.heading) * side * 34;
        const sy = p.y + Math.sin(p.heading) * 55 + Math.cos(p.heading) * side * 34;
        const lux = env.lightAt({ x: sx, y: sy }, { ...EYE(a), self: 1 });
        return Math.round(1023 * Math.pow(lux / (lux + 3), 0.85));     // the LDR curve
      };
      const left = eyeAt(-1), right = eyeAt(1);
      const cm = Math.round(env.raycast(p, p.heading) / 10 * env.mediumAt().sonarScale);
      const line = env.surfaceAt(p).dark ? 1 : 0;

      for (const v of [left, right]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1023);
      }
      expect(cm).toBeGreaterThan(0);
      expect([0, 1]).toContain(line);
    });
  });
}

/* A patch of floor a robot could actually stand on, with `room` mm of clear
   air in front of it. Scenes differ, so the contract looks rather than
   assumes. */
function clearSpot(env, room) {
  const n = 7;
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      const p = { x: env.size * i / n, y: env.size * j / n };
      env.addBody({ id: 999, ...p, ...BODY });
      env.step(16);
      const touching = env.contacts(999).length;
      env.removeBody(999);
      if (touching) continue;
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2;
        if (env.raycast(p, a) > room) return { x: p.x, y: p.y, a: a };
      }
    }
  }
  return null;
}

function grid(size) {
  const out = [];
  for (let i = 1; i < 5; i++) for (let j = 1; j < 5; j++) out.push({ x: size * i / 5, y: size * j / 5 });
  return out;
}
