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
    /* A ROBOT'S WIDTH APART, not a hand's breadth: two Bit:Bots are each
       about 190mm across, so their microphones cannot be closer than that
       however they are parked. Asking at 100mm was asking what it sounds
       like inside another robot, where the field climbs as one over the
       distance squared and sails past the 255 a board can report. */
    const near = f.at({ x: 1200, y: 1000 }, { self: "B" });
    const away = f.at({ x: 1900, y: 1900 }, { self: "B" });
    /* 255 is the convention for "pressed against your own microphone" -
       there is no room in between to take anything away. The room's ring
       lands on top of it, which is why this is not an equality any more;
       the board clamps the reading to 255 when it reads the field. */
    expect(own).toBeGreaterThanOrEqual(255);
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

  it("is quieter behind something, but only a little", () => {
    /* A cupboard is not a wall. It used to be treated as one - the old
       field put Maekawa's barrier formula in the way, which is the sum
       for a screen that runs the whole width of the room, and it took
       about 19 dB off. A cupboard is 300mm wide and the sound the buzzer
       makes is around 600mm from crest to crest, so most of it simply
       walks round the sides without noticing. What is left is about a
       decibel, and that is the honest answer. */
    const spot = { x: 1700, y: 1000 };
    const open = build({ speakers: [{ x: 300, y: 1000, playing: true }] });
    const hidden = build({
      speakers: [{ x: 300, y: 1000, playing: true }],
      furniture: [{ name: "cupboard", x: 1000, y: 700 }]
    });
    const a = open.at(spot), b = hidden.at(spot);
    expect(b).toBeLessThan(a * 0.9);     // a real drop
    expect(b).toBeGreaterThan(a * 0.4);  // but it got round it, as sound does
  });

  it("rings in a hard room and much less in a soft one", () => {
    /* Far from the source almost everything you hear has bounced, so the
       floor's material - the one surface a classroom actually chooses -
       sets the reading. There is no separate "ring" to subtract any more:
       it is one wave, and this is simply what it comes to. */
    const far = { x: 1500, y: 1500 };
    const hard = build({ ground: { material: "polished" },
                         speakers: [{ x: 300, y: 300, playing: true }] });
    const soft = build({ ground: { material: "carpet" },
                         speakers: [{ x: 300, y: 300, playing: true }] });
    expect(hard.at(far)).toBeGreaterThan(soft.at(far) * 1.2);
  });

  it("barely rings at all outdoors, where there is no room to ring in", () => {
    /* A fence is not a ceiling and the sky is not a wall, so nothing
       comes back and the far corner of a playground is properly quiet -
       which is why shouting across one is such hard work. */
    const far = { x: 1500, y: 1500 };
    const inside = build({ speakers: [{ x: 300, y: 300, playing: true }] });
    const out = build({ sun: { azimuth: 140, elevation: 28, I: 3 },
                        ground: { material: "grass" },
                        speakers: [{ x: 300, y: 300, playing: true }] });
    expect(out.at(far)).toBeLessThan(inside.at(far) * 0.5);
    expect(out.at(far)).toBeGreaterThan(0);
  });

  it("sounds the same to the left of a speaker as to the right of it", () => {
    /* A speaker is a box with the source inside it, and the box was
       screening its own driver: every ray out of one side crossed its own
       cabinet wall and paid Maekawa's toll, so the field had a cliff down
       the middle. Two robots a hand's breadth apart read 113 and 255. */
    const f = build({ speakers: [{ x: 915, y: 935, playing: true }] });
    const mid = 915 + 170 / 2;
    const left = f.at({ x: mid - 600, y: 1000 });
    const right = f.at({ x: mid + 600, y: 1000 });
    expect(Math.abs(left - right)).toBeLessThan(left * 0.05);
  });

  it("speaks from the middle of its box and not from a corner of it", () => {
    /* Furniture is measured from a corner. Reading x, y as the source put
       the sound a hand's breadth outside the cabinet, through its front. */
    const f = build({ speakers: [{ x: 915, y: 935, playing: true }] });
    const centre = { x: 915 + 170 / 2, y: 935 + 130 / 2 };
    const a = f.at({ x: centre.x - 500, y: centre.y });
    const b = f.at({ x: centre.x + 500, y: centre.y });
    expect(Math.abs(a - b)).toBeLessThan(a * 0.02);
  });

  it("stops ringing when the last speaker is taken out of the room", () => {
    /* The reverberant field is kept until the sources change, and the key
       for "no sources at all" was the empty string - which is also what
       the key was reset to when the furniture moved. Taking the speaker
       away did both at once, the early return matched, and an empty room
       went on sounding at 160. */
    const scene = loadScene({ speakers: [{ x: 1000, y: 1000, playing: true }] });
    const f = createSound(scene);
    expect(f.at({ x: 400, y: 1600 })).toBeGreaterThan(0);
    scene.furniture.length = 0;
    scene.speakers.length = 0;
    expect(f.at({ x: 400, y: 1600 })).toBe(0);
  });

  it("leaves a microphone somewhere to go at both ends of the room", () => {
    /* A micro:bit reads 0 to 255 and clamps, so a field that sits above
       255 across the room reads the same everywhere and teaches nothing.
       The speaker's `loud` is set against this: it is what a microphone
       reads at `reach` out in the open, and it is chosen so a child can
       drive the whole floor and watch the number move the whole way. */
    const f = build({ ground: { material: "lino" },
                      speakers: [{ x: 915, y: 935, playing: true }] });
    let lo = Infinity, hi = 0;
    for (let y = 200; y <= 1800; y += 200)
      for (let x = 200; x <= 1800; x += 200) {
        const v = f.at({ x, y, z: 42 });
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    expect(hi).toBeLessThan(255);        // nowhere on the floor is pinned
    expect(lo).toBeGreaterThan(20);      // the far end is still audible
    expect(hi).toBeGreaterThan(lo * 2);  // and there is a slope between them
  });

  it("adds a second speaker on top of the first", () => {
    /* Two speakers are two separate solves of the room, added together.
       Energy is what adds - these are independent noises, not one noise
       split in two, so they do not interfere, they accumulate. */
    const far = { x: 1700, y: 1000 };
    const one = build({ speakers: [{ x: 400, y: 915, playing: true }] });
    const two = build({ speakers: [{ x: 400, y: 915, playing: true },
                                   { x: 1430, y: 915, playing: true }] });
    expect(two.at(far)).toBeGreaterThan(one.at(far) * 2);
  });

  it("sounds the same either side of a symmetric pair of speakers", () => {
    /* One speaker being symmetric could be luck in how its own cabinet
       lands on the grid. Two of them, straddling the middle of the room,
       can only come out even if the solve and the grid are both honest. */
    const f = build({ speakers: [{ x: 400, y: 915, playing: true },
                                 { x: 1430, y: 915, playing: true }] });
    const left = f.at({ x: 700, y: 1000 }), right = f.at({ x: 1300, y: 1000 });
    expect(Math.abs(left - right)).toBeLessThan(left * 0.01);
  });

  it("still stands in the way after it is switched off", () => {
    /* A speaker is a box of wood whether or not it is playing. Switching
       it off stops it being a source; it does not take it out of the
       room, and the sound coming past it still has to get round it.

       WHERE it stands decides which way the reading moves, which is why
       this test names a spot rather than waving at the idea. A hard box
       shadows what is behind it AND throws sound back into the room, and
       in a room this reverberant the second can win: the same cabinet
       200mm further along reads LOUDER than no cabinet at all. */
    const spot = { x: 1700, y: 1000 };
    const alone = build({ speakers: [{ x: 400, y: 915, playing: true }] });
    const blocked = build({ speakers: [{ x: 400, y: 915, playing: true },
                                       { x: 1300, y: 915, playing: false }] });
    expect(blocked.at(spot)).toBeLessThan(alone.at(spot) * 0.95);
    expect(blocked.at(spot)).toBeGreaterThan(alone.at(spot) * 0.6);
  });

  it("adds up two noises at once", () => {
    const f = build({ speakers: [{ x: 100, y: 100, playing: true }] });
    const one = f.at({ x: 600, y: 600 });
    f.setEmitters([{ owner: "A", x: 600, y: 700 }]);
    expect(f.at({ x: 600, y: 600 }, { self: "B" })).toBeGreaterThan(one);
  });
});
