import { describe, it, expect } from "vitest";
import { loadScene } from "../../../src/world/scene.js";
import { createMedium } from "../../../src/world/fields/medium.js";

const build = d => createMedium(loadScene(d));

describe("the medium field", () => {
  it("carries sound at the textbook speed for the air it is in", () => {
    expect(build({ medium: { airTemp: 0 } }).speedOfSound()).toBeCloseTo(331.3, 6);
    expect(build({ medium: { airTemp: 20 } }).speedOfSound()).toBeCloseTo(343.42, 6);
    expect(build({ medium: { airTemp: 12 } }).speedOfSound()).toBeCloseTo(338.572, 6);
  });

  it("makes a sonar read long in cold air and short in hot", () => {
    /* The robot still thinks it is in a 20 degree room, so a slower echo
       looks like a further wall. Small, but it is the honest reason an
       outdoor measurement does not quite match an indoor one. */
    expect(build({ medium: { airTemp: 5 } }).sonarScale()).toBeGreaterThan(1);
    expect(build({ medium: { airTemp: 20 } }).sonarScale()).toBeCloseTo(1, 9);
    expect(build({ medium: { airTemp: 35 } }).sonarScale()).toBeLessThan(1);
  });

  it("stays within a percent or two, so it is a nuance and not a wrecking ball", () => {
    expect(build({ medium: { airTemp: 0 } }).sonarScale()).toBeLessThan(1.04);
  });

  it("is still air indoors and may have a breeze outdoors", () => {
    expect(build({}).wind()).toEqual({ x: 0, y: 0 });
    expect(build({ medium: { wind: [0.4, -0.1] } }).wind()).toEqual({ x: 0.4, y: -0.1 });
  });

  it("hands over the whole lot in one answer", () => {
    const m = build({ medium: { airTemp: 12, wind: [1, 2] } }).at();
    expect(m).toMatchObject({ airTemp: 12, wind: { x: 1, y: 2 } });
    expect(m.speedOfSound).toBeCloseTo(338.572, 6);
  });
});
