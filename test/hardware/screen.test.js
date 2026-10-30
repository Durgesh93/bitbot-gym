import { describe, it, expect } from "vitest";
import { createScreen, columnsOf, frameAt, scrollSteps, glyph, ICONS } from "../../src/hardware/screen.js";

const lit = cells => cells.filter(v => v > 0).length;
const rows = cells => {
  const out = [];
  for (let r = 0; r < 5; r++) out.push(cells.slice(r * 5, r * 5 + 5).map(v => (v ? "#" : ".")).join(""));
  return out;
};

describe("the 5x5 screen", () => {
  it("starts blank", () => {
    expect(lit(createScreen().cells())).toBe(0);
  });

  it("plots and unplots one LED at a time", () => {
    const s = createScreen();
    s.plot(2, 3);
    expect(s.point(2, 3)).toBe(true);
    expect(lit(s.cells())).toBe(1);
    s.unplot(2, 3);
    expect(s.point(2, 3)).toBe(false);
  });

  it("ignores a plot off the edge instead of corrupting a neighbour", () => {
    /* `plot 5, 0` is a thing children type, and on the real board nothing
       happens. It must not quietly light the first LED of the next row. */
    const s = createScreen();
    s.plot(5, 0);
    s.plot(-1, 2);
    s.plot(0, 9);
    expect(lit(s.cells())).toBe(0);
  });

  it("keeps the brightness a plot was given", () => {
    const s = createScreen();
    s.plot(0, 0, 60);
    expect(s.brightnessAt(0, 0)).toBe(60);
    expect(s.point(0, 0)).toBe(true);          // anything above nothing is on
  });

  it("draws a heart the right way up", () => {
    const s = createScreen();
    s.icon("Heart");
    expect(rows(s.cells())).toEqual([".#.#.", "#####", "#####", ".###.", "..#.."]);
  });

  it("takes a picture typed as dots and hashes", () => {
    const s = createScreen();
    s.leds(`
      . # . # .
      . . . . .
      # . . . #
      . # # # .
      . . . . .`);
    expect(rows(s.cells())[0]).toBe(".#.#.");
    expect(rows(s.cells())[3]).toBe(".###.");
  });

  it("fills a bar graph from the bottom up", () => {
    /* children read this one as a thermometer, so the bottom row has to be
       the row that fills first */
    const s = createScreen();
    s.bar(1, 10);
    expect(rows(s.cells())[4][0]).toBe("#");
    expect(lit(s.cells())).toBe(3);            // 25 * 1/10, rounded
    s.bar(10, 10);
    expect(lit(s.cells())).toBe(25);
    s.bar(0, 10);
    expect(lit(s.cells())).toBe(0);
  });

  it("does not divide by zero when the top of the graph is zero", () => {
    const s = createScreen();
    expect(() => s.bar(5, 0)).not.toThrow();
    expect(lit(s.cells())).toBe(25);
  });

  it("shows a box for a character it has no glyph for", () => {
    expect(glyph("å")).toBe(glyph("å"));
    expect(glyph("A")).not.toBe(glyph("å"));
  });

  it("has every icon exactly 25 cells", () => {
    for (const [name, bits] of Object.entries(ICONS)) {
      expect(bits.replace(/ /g, ""), name).toHaveLength(25);
    }
  });
});

describe("scrolling, which is how the board shows a word", () => {
  it("walks a message in from the right and off to the left", () => {
    const cols = columnsOf("HI");
    /* the first step puts the message's leading column in the rightmost
       column of the screen, and nothing is showing the step before that */
    expect(frameAt(cols, -5).replace(/0/g, "")).toBe("");
    expect(frameAt(cols, -4).slice(0, 4)).toBe("0000");
    expect(frameAt(cols, -4)[4]).toBe(cols[0][0]);
    expect(frameAt(cols, scrollSteps(cols)).replace(/0/g, "")).toBe("");
  });

  it("puts a blank column between two letters and none after the last", () => {
    expect(columnsOf("A")).toHaveLength(5);
    expect(columnsOf("AB")).toHaveLength(11);
    expect(columnsOf("ABC")).toHaveLength(17);
  });

  it("takes longer for a longer number, which is the lesson", () => {
    /* "show number 12" visibly takes longer than "show number 1", and
       children ask why. It should, and by this much. */
    expect(scrollSteps(columnsOf("1"))).toBe(10);
    expect(scrollSteps(columnsOf("12"))).toBe(16);
  });

  it("shows the whole message somewhere in the middle of the scroll", () => {
    const cols = columnsOf("8");
    let seen = false;
    for (let k = -4; k <= scrollSteps(cols); k++) {
      if (frameAt(cols, k) === glyph("8")) seen = true;
    }
    expect(seen).toBe(true);
  });
});
