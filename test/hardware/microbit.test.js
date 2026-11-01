import { describe, it, expect } from "vitest";
import { createBoard, PROBES, lightLevel, compassHeading, magneticForce, FIELD }
  from "../../src/hardware/microbit.js";
import { EARTH } from "../../src/world/fields/magnetic.js";

describe("the micro:bit board", () => {
  it("asks the world for only the three things it can actually sense", () => {
    /* It is a flat square of circuit board. It has no sonar and no line
       sensors - those are the chassis's, and a board in a child's hand has
       neither. It does have a magnetometer, which is why the compass
       works and why a magnet on the desk upsets it. */
    expect(PROBES.map(p => p.name)).toEqual(["screenLight", "mic", "field"]);
    expect(PROBES.every(p => p.fwd === 0 && p.side === 0)).toBe(true);
  });

  it("keeps its idea of the Earth's field in step with the world's", () => {
    /* The board carries a copy only for when nobody hands it a field. If
       the two drift apart, a unit test here and the gym disagree about
       which way north is, and nothing says so. */
    expect(FIELD).toEqual(EARTH);
  });

  it("reads light on 0 to 255, not the chassis's 0 to 1023", () => {
    /* The two scales really are different on the hardware, and a child who
       moves a program from one to the other trips over it. */
    expect(lightLevel(0)).toBe(0);
    expect(lightLevel(1e6)).toBe(255);
    expect(lightLevel(3)).toBe(141);
  });

  it("holds a button down rather than only clicking it", () => {
    const b = createBoard({ id: 1 });
    expect(b.pressed("A")).toBe(false);
    b.press("A", true);
    expect(b.pressed("A")).toBe(true);
    b.press("A", false);
    expect(b.pressed("A")).toBe(false);
    expect(b.press("C", true)).toBe(false);          // there is no C
  });

  it("hands a shake over once and then forgets it", () => {
    /* otherwise `on shake` fires for as long as the hand is moving */
    const b = createBoard({ id: 1 });
    b.gesture("shake");
    expect(b.takeGestures()).toEqual(["shake"]);
    expect(b.takeGestures()).toEqual([]);
  });

  it("keeps the radio group in the range the hardware allows", () => {
    const b = createBoard({ id: 1 });
    expect(b.group()).toBe(0);
    expect(b.group(7)).toBe(7);
    expect(b.group(900)).toBe(255);
    expect(b.group(-4)).toBe(0);
  });

  describe("the compass", () => {
    it("calls up the screen north", () => {
      expect(compassHeading(-Math.PI / 2)).toBe(357);   // 3 degrees of declination
      expect(compassHeading(0)).toBe(87);               // facing east
      expect(compassHeading(Math.PI / 2)).toBe(177);    // facing south
    });

    it("comes back round rather than going negative", () => {
      for (let k = -8; k <= 8; k++) {
        const h = compassHeading(k * Math.PI / 4);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(360);
      }
    });

    it("has most of the field pointing down, which is why it is so easily upset", () => {
      /* 50 uT in all, but only about 15 of it horizontal. Worth being able
         to show a class that has just watched a compass swing about. */
      const down = magneticForce(0, "z");
      const across = Math.hypot(magneticForce(0, "x"), magneticForce(0, "y"));
      expect(down).toBeGreaterThan(45);
      expect(across).toBeLessThan(16);
      expect(Math.hypot(down, across)).toBeCloseTo(FIELD.total, 3);
    });
  });

  it("turns its probes into what the blocks return", () => {
    const b = createBoard({ id: 1 });
    b.press("A", true);
    const r = b.read({ screenLight: 3, mic: 120.4 }, { h: -Math.PI / 2 });
    expect(r).toEqual({
      light: 141, sound: 120, compass: 357,
      magnet: magneticForce(-Math.PI / 2),
      buttonA: 1, buttonB: 0, logo: 0
    });
  });

  it("hands out a state that is plain data, not the board itself", () => {
    const b = createBoard({ id: 1 });
    const s = b.state();
    s.buttons.A = true;
    expect(b.pressed("A")).toBe(false);          // the copy is a copy
    expect(s.screen).toHaveLength(25);
  });
});
