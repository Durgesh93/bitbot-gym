import { describe, it, expect } from "vitest";
import { loadScene } from "../../../src/world/scene.js";
import { createSound } from "../../../src/world/fields/sound.js";

const build = d => createSound(loadScene(d));

describe("the sound field", () => {
  it("is silent in an empty room", () => {
    expect(build({}).at({ x: 1000, y: 1000 })).toBe(0);
  });

  it("stays silent while the speaker is switched off", () => {
    const f = build({ speakers: [{ x: 100, y: 100, playing: false }] });
    expect(f.at({ x: 500, y: 500 })).toBe(0);
  });

  it("gets louder as you walk towards the speaker", () => {
    const f = build({ speakers: [{ x: 100, y: 100, playing: true }] });
    const near = f.at({ x: 300, y: 300 });
    const far = f.at({ x: 1800, y: 1800 });
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it("hears a board's own buzzer loud and its neighbour's faint", () => {
    const f = build({});
    f.setEmitters([{ owner: "A", x: 1000, y: 1000 }]);
    const own = f.at({ x: 1000, y: 1000 }, { self: "A" });
    const near = f.at({ x: 1100, y: 1000 }, { self: "B" });
    const away = f.at({ x: 1900, y: 1900 }, { self: "B" });
    expect(own).toBe(255);
    expect(near).toBeLessThan(own);
    expect(away).toBeLessThan(near);
  });

  it("goes quiet again when nothing is beeping any more", () => {
    const f = build({});
    f.setEmitters([{ owner: "A", x: 1000, y: 1000 }]);
    expect(f.at({ x: 1000, y: 1000 }, { self: "B" })).toBeGreaterThan(0);
    f.setEmitters([]);
    expect(f.at({ x: 1000, y: 1000 }, { self: "B" })).toBe(0);
  });

  it("adds up two noises at once", () => {
    const f = build({ speakers: [{ x: 100, y: 100, playing: true }] });
    const one = f.at({ x: 600, y: 600 });
    f.setEmitters([{ owner: "A", x: 600, y: 700 }]);
    expect(f.at({ x: 600, y: 600 }, { self: "B" })).toBeGreaterThan(one);
  });
});
