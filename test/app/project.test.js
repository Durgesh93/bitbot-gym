/* Saving a room and opening it again.

   The test that matters here is the ROUND TRIP, and it is done against a
   real room rather than a fixture: arrange one, save it, pull the room
   apart, open the save, and ask the room - not the file - whether it came
   back. A fixture would only prove that capture() and restore() agree
   with each other, which they would even if both were wrong about what a
   lamp is.

   What is deliberately NOT asserted: that the light field, the sound
   field or any sensor reading comes back identical. Those are consequences
   of the room, so if the room is right they follow, and pinning them here
   would make this test fail every time a field is improved. */

import { describe, it, expect, beforeEach } from "vitest";
import { createRoom, ROOM } from "../../src/app/room.js";
import { createBus } from "../../src/core/bus.js";
import { capture, restore, check, FORMAT } from "../../src/app/project.js";
import { clearLog } from "../../src/core/log.js";

/* What the gym itself does when it saves and opens - kept here in one
   place so the test exercises the same two steps the menu does. */
function save(bus, room, name) {
  const snap = bus.send(ROOM, { cmd: "snapshot" });
  const saved = {};
  for (const b of snap.bodies) {
    const got = bus.send(ROOM, { cmd: "saved", id: b.id });   // null for anything not a board
    if (got) saved[b.id] = got;
  }
  snap.tuning = bus.send(ROOM, { cmd: "tuning" });
  return capture(snap, saved, {}, name);
}

function open(bus, room, project) {
  /* out with what is there - a project says exactly what is in the room */
  for (const b of [...room.bodies()]) bus.send(ROOM, { cmd: "remove", id: b.id });
  const plan = restore(project);
  for (const c of plan.room) bus.send(ROOM, c);
  const ids = [];
  for (const b of plan.boards) {
    const id = bus.send(ROOM, b.add);
    if (b.group) bus.send(ROOM, { cmd: "group", id, group: b.group });
    if (b.code) bus.send(ROOM, { cmd: "load", id, code: b.code });
    ids.push(id);
  }
  return ids;
}

const CODE = 'basic.showIcon(IconNames.Heart)\n';

describe("saving a room as a project", () => {
  let bus, room;
  beforeEach(() => {
    clearLog();
    bus = createBus();
    room = createRoom({ bus, scene: "classroom", seed: 3 });
  });

  function arrange() {
    bus.send(ROOM, { cmd: "empty" });
    bus.send(ROOM, { cmd: "thing", name: "table", x: 700, y: 700 });
    bus.send(ROOM, { cmd: "addLamp", x: 400, y: 1600, kind: "floor" });
    bus.send(ROOM, { cmd: "addMagnet", x: 1500, y: 500, rot: Math.PI });
    bus.send(ROOM, { cmd: "line", from: { x: 200, y: 1000 }, to: { x: 1800, y: 1000 }, width: 30 });
    const a = bus.send(ROOM, { cmd: "add", kind: "bitbot", name: "Mia", x: 600, y: 1500 });
    const b = bus.send(ROOM, { cmd: "add", kind: "microbit", name: "Sam", x: 1400, y: 1500 });
    bus.send(ROOM, { cmd: "group", id: a, group: 4 });
    bus.send(ROOM, { cmd: "group", id: b, group: 4 });
    bus.send(ROOM, { cmd: "load", id: a, code: CODE });
    return { a, b };
  }

  it("writes down what was arranged, and nothing that is worked out", () => {
    arrange();
    const p = save(bus, room, "Dice Duel");

    expect(p.gym).toBe(FORMAT);
    expect(p.name).toBe("Dice Duel");
    expect(p.room.furniture.map(f => f.name)).toContain("table");
    expect(p.room.lamps.length).toBeGreaterThanOrEqual(1);   // the classroom has its own
    expect(p.room.magnets).toHaveLength(1);
    expect(p.room.lines).toHaveLength(1);
    expect(p.boards.map(b => b.name).sort()).toEqual(["Mia", "Sam"]);

    /* the consequences are NOT in the file */
    const text = JSON.stringify(p);
    for (const worked of ["indirect", "regions", "senses", "reads", "screen"])
      expect(text, worked + " should not be saved: the gym works it out")
        .not.toContain('"' + worked + '"');
  });

  it("puts the whole room back", () => {
    arrange();
    const p = save(bus, room, "Dice Duel");

    /* wreck it thoroughly */
    bus.send(ROOM, { cmd: "empty" });
    bus.send(ROOM, { cmd: "clearFloor" });
    for (const b of [...room.bodies()]) bus.send(ROOM, { cmd: "remove", id: b.id });
    expect(room.bodies()).toHaveLength(0);

    open(bus, room, p);

    const back = bus.send(ROOM, { cmd: "snapshot" });
    expect(back.furniture.filter(f => f.name === "table")).toHaveLength(1);
    expect(back.lamps).toHaveLength(p.room.lamps.length);
    expect(back.magnets).toHaveLength(1);
    expect(back.magnets[0].rot).toBeCloseTo(Math.PI, 3);
    expect(back.lines).toHaveLength(1);
    expect(back.bodies).toHaveLength(2);
  });

  it("puts each board back with its name, its spot, its group and its code", () => {
    arrange();
    const p = save(bus, room, "Dice Duel");
    for (const b of [...room.bodies()]) bus.send(ROOM, { cmd: "remove", id: b.id });
    const ids = open(bus, room, p);

    const mia = ids.map(id => bus.send(ROOM, { cmd: "saved", id })).find(s => s.name === "Mia");
    expect(mia.kind).toBe("bitbot");
    expect(mia.group).toBe(4);
    expect(mia.code).toBe(CODE);

    const sam = ids.map(id => bus.send(ROOM, { cmd: "saved", id })).find(s => s.name === "Sam");
    expect(sam.kind).toBe("microbit");
    expect(sam.group).toBe(4);

    /* AND THEY STAND EXACTLY WHERE THEY STOOD. This was a loose range
       check once, and a loose range check is what let a real bug
       through: the gym opened a project by POSTING the room commands
       and SENDING each board, so a board went down on its spot and the
       queued `scene` then reopened the room under it and moved it to a
       default start. The robot was still roughly in the room, so a
       range passed; it was just no longer on its line. A spot saved is
       a spot restored, to the millimetre. */
    for (const b of p.boards) {
      const back = room.bodies().find(x => x.x > b.x - 2 && x.x < b.x + 2 &&
                                           x.y > b.y - 2 && x.y < b.y + 2);
      expect(back, b.name + " is not on the spot it was saved at").toBeTruthy();
    }
  });

  it("a board opened back up still runs its program", async () => {
    arrange();
    const p = save(bus, room, "Dice Duel");
    for (const b of [...room.bodies()]) bus.send(ROOM, { cmd: "remove", id: b.id });
    const ids = open(bus, room, p);

    bus.send(ROOM, { cmd: "run", id: ids[0] });
    for (let i = 0; i < 200; i++) { room.tick(); await Promise.resolve(); await Promise.resolve(); }
    expect(room.problems()).toEqual([]);
  });

  it("opening the same project twice does not give two of everything", () => {
    arrange();
    const p = save(bus, room, "Dice Duel");
    open(bus, room, p);
    open(bus, room, p);

    const back = bus.send(ROOM, { cmd: "snapshot" });
    expect(back.bodies).toHaveLength(2);
    expect(back.lamps).toHaveLength(p.room.lamps.length);
    expect(back.magnets).toHaveLength(1);
    expect(back.furniture.filter(f => f.name === "table")).toHaveLength(1);
  });

  /* A project file is the one thing here that arrives from outside the
     gym, off a stick or out of an email, so it is checked and not
     trusted. Each of these says something a teacher can act on. */
  it("says what is wrong with a file rather than falling over", () => {
    expect(check(null)).toMatch(/not a saved project/);
    expect(check({ hello: 1 })).toMatch(/not a saved project/);
    expect(check({ gym: FORMAT + 1 })).toMatch(/newer gym/);
    expect(check({ gym: FORMAT, boards: [] })).toMatch(/no room in it/);
    expect(check({ gym: FORMAT, room: {} })).toMatch(/no boards in it/);
    expect(check({ gym: FORMAT, room: {}, boards: [] })).toBe(null);
    expect(() => restore({ gym: 99 })).toThrow(/newer gym/);
  });

  /* A SILENT SPEAKER IS A SETTING, so it has to survive. The Room menu's
     own door switches a new speaker on - which is right for a child
     pressing "Speaker" and wrong for a project - so a room saved with the
     speaker off used to open with it playing, and every card in it read
     SOUND 50 instead of SOUND 0. Nothing about the file was wrong; it was
     being opened through the wrong door. */
  it("brings a speaker back on its spot, playing or silent as it was", () => {
    bus.send(ROOM, { cmd: "empty" });
    bus.send(ROOM, { cmd: "addSpeaker", x: 400, y: 400 });
    bus.send(ROOM, { cmd: "addSpeaker", x: 1600, y: 400 });
    bus.send(ROOM, { cmd: "speaker", id: 0, playing: false });   // this one is off
    const was = bus.send(ROOM, { cmd: "snapshot" }).speakers.map(S => ({ ...S }));
    expect(was.map(S => S.playing)).toEqual([false, true]);

    const p = save(bus, room, "Quiet Room");
    expect(p.room.speakers.map(S => S.playing)).toEqual([false, true]);
    open(bus, room, p);

    const back = bus.send(ROOM, { cmd: "snapshot" }).speakers;
    expect(back).toHaveLength(2);
    expect(back.map(S => !!S.playing), "the silent one came back playing")
      .toEqual([false, true]);
    /* and on the SAME SPOT: a speaker goes in centred and is kept by its
       corner, so opening through the wrong door shifted it half a box
       every single time the room was saved and opened again */
    for (let i = 0; i < 2; i++) {
      expect(back[i].x, "the speaker moved").toBeCloseTo(was[i].x, 3);
      expect(back[i].y, "the speaker moved").toBeCloseTo(was[i].y, 3);
    }
  });

  it("puts the lamps and the magnet back on their exact spots", () => {
    arrange();
    const was = bus.send(ROOM, { cmd: "snapshot" });
    const p = save(bus, room, "Dice Duel");
    open(bus, room, p);
    const back = bus.send(ROOM, { cmd: "snapshot" });

    for (let i = 0; i < was.lamps.length; i++) {
      expect(back.lamps[i].x).toBeCloseTo(was.lamps[i].x, 3);
      expect(back.lamps[i].y).toBeCloseTo(was.lamps[i].y, 3);
    }
    expect(back.magnets[0].x).toBeCloseTo(was.magnets[0].x, 3);
    expect(back.magnets[0].y).toBeCloseTo(was.magnets[0].y, 3);
    expect(back.furniture.find(f => f.name === "table").x)
      .toBeCloseTo(was.furniture.find(f => f.name === "table").x, 3);
  });

  it("opens a room that was saved empty", () => {
    const p = { gym: FORMAT, name: "nothing", room: { scene: "classroom" }, boards: [] };
    expect(() => open(bus, room, p)).not.toThrow();
    expect(bus.send(ROOM, { cmd: "snapshot" }).bodies).toHaveLength(0);
  });
});
