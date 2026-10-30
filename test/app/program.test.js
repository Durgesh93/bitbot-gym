import { describe, it, expect, beforeEach } from "vitest";
import { createRoom, ROOM } from "../../src/app/room.js";
import { createBus } from "../../src/core/bus.js";
import { prepare } from "../../src/app/program.js";
import { clearLog, recent } from "../../src/core/log.js";

/* Run the room until a program has got somewhere. A program only moves on
   between ticks, so the loop has to give the microtasks a turn. */
async function runFor(room, ms) {
  const steps = Math.round(ms / 5);
  for (let i = 0; i < steps; i++) {
    room.tick();
    await Promise.resolve();
    await Promise.resolve();
  }
}

describe("the source transform", () => {
  it("awaits a pause, because the gym cannot block", () => {
    expect(prepare("basic.pause(100)")).toContain("await basic.pause(100)");
  });

  it("awaits a child's own function too, since it may pause inside", () => {
    const out = prepare("function wiggle() { basic.pause(50) }\nwiggle()");
    expect(out).toContain("async function wiggle(");
    expect(out).toContain("await wiggle()");
  });

  it("leaves a block that takes no time alone", () => {
    expect(prepare("basic.showIcon(IconNames.Heart)")).not.toContain("await");
  });

  it("does not await a property that merely looks like a call", () => {
    /* `mypause(` must not become `myawait pause(` or similar */
    expect(prepare("thing.basic.pause(5)")).not.toContain("await");
  });

  it("drops the type annotations MakeCode emits", () => {
    expect(prepare("let n: number = 0")).toBe("let n = 0");
  });
});

describe("running a child's program", () => {
  let bus, room;
  beforeEach(() => {
    clearLog();
    bus = createBus();
    room = createRoom({ bus, scene: "classroom", seed: 1 });
  });

  it("shows an icon on the screen", async () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "load", id, code: "basic.showIcon(IconNames.Heart)" });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 50);
    const screen = room.snapshot().bodies[0].screen;
    expect(screen.filter(v => v > 0).length).toBe(16);     // a heart is 16 LEDs
  });

  it("takes real time over a pause, measured on the room's own clock", async () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "load", id, code:
      "basic.showIcon(IconNames.Yes)\nbasic.pause(1000)\nbasic.clearScreen()" });
    bus.send(ROOM, { cmd: "run", id });

    await runFor(room, 500);
    expect(room.snapshot().bodies[0].screen.some(v => v > 0)).toBe(true);
    await runFor(room, 700);
    expect(room.snapshot().bodies[0].screen.every(v => v === 0)).toBe(true);
  });

  it("drives the robot across the floor", async () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "place", id, x: 400, y: 1500, heading: 0 });
    bus.send(ROOM, { cmd: "load", id, code: "bitbot.go(BBDirection.Forward, 60)" });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 1000);
    expect(room.bodies()[0].x).toBeGreaterThan(550);
  });

  it("will not move below the dead band, which children always try", async () => {
    /* "go forward at 10%" does nothing on a real Bit:Bot: the PWM is not
       enough to break the gearbox free. */
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "place", id, x: 400, y: 1500, heading: 0 });
    bus.send(ROOM, { cmd: "load", id, code: "bitbot.go(BBDirection.Forward, 10)" });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 1000);
    expect(room.bodies()[0].x).toBeCloseTo(400, 1);
    expect(recent().some(l => /too slow to move/.test(l.msg))).toBe(true);
  });

  it("keeps a forever loop going after the on start has finished", async () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "load", id, code:
      "let n = 0\nbasic.forever(function () { n += 1; led.plot(0, 0); basic.pause(100) })" });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 400);
    expect(room.snapshot().bodies[0].screen[0]).toBeGreaterThan(0);
    expect(room.machine(id).state()).toBe("run");
  });

  it("says waiting, not finished, when a handler is still armed", async () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "load", id, code:
      "input.onButtonPressed(Button.A, function () { basic.showIcon(IconNames.Happy) })" });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 50);
    expect(room.machine(id).state()).toBe("wait");
  });

  it("runs a button handler when a finger presses the button", async () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "load", id, code:
      "input.onButtonPressed(Button.A, function () { led.plot(2, 2) })" });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 50);
    expect(room.snapshot().bodies[0].screen[12]).toBe(0);

    bus.post(ROOM, { cmd: "press", id, button: "A", down: true });
    await runFor(room, 50);
    expect(room.snapshot().bodies[0].screen[12]).toBeGreaterThan(0);
  });

  it("stops a robot dead, and it stays stopped", async () => {
    /* The bug this is here for: Stop left the forever loop running, so a
       stopped robot kept driving while the card said it had stopped. */
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "place", id, x: 400, y: 1500, heading: 0 });
    bus.send(ROOM, { cmd: "load", id, code:
      "basic.forever(function () { bitbot.go(BBDirection.Forward, 60); basic.pause(50) })" });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 500);
    expect(room.bodies()[0].x).toBeGreaterThan(450);

    bus.send(ROOM, { cmd: "stop", id });
    await runFor(room, 200);
    const stopped = room.bodies()[0].x;
    await runFor(room, 500);
    expect(room.bodies()[0].x).toBeCloseTo(stopped, 1);
    expect(room.machine(id).state()).toBe("stop");
  });

  it("carries on when a program asks for a block the gym has not got", async () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "load", id, code:
      "bitbot.oledZOOM(true)\nbasic.showIcon(IconNames.Heart)" });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 50);
    expect(room.snapshot().bodies[0].screen.filter(v => v > 0).length).toBe(16);
    expect(recent().some(l => /OLED/.test(l.msg))).toBe(true);
  });

  it("reports a syntax error rather than dying silently", async () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "load", id, code: "basic.showIcon(" });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 20);
    expect(recent().some(l => l.cls === "err" && /syntax/.test(l.msg))).toBe(true);
  });

  it("sends a radio message to the other board and not to itself", async () => {
    const a = bus.send(ROOM, { cmd: "add" });
    const b = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "load", id: b, code:
      "radio.setGroup(3)\nradio.onReceivedNumber(function (n) { basic.showNumber(n) })" });
    bus.send(ROOM, { cmd: "load", id: a, code:
      "radio.setGroup(3)\nradio.onReceivedNumber(function (n) { led.plot(4, 4) })\n" +
      "basic.pause(100)\nradio.sendNumber(7)" });
    bus.send(ROOM, { cmd: "run", id: b });
    bus.send(ROOM, { cmd: "run", id: a });
    await runFor(room, 400);

    const bodies = room.snapshot().bodies;
    const them = bodies.find(x => x.id === b), me = bodies.find(x => x.id === a);
    expect(them.screen.some(v => v > 0)).toBe(true);        // it heard
    expect(me.screen[24]).toBe(0);                          // and the sender did not
  });

  it("does not deliver to a board listening on another group", async () => {
    const a = bus.send(ROOM, { cmd: "add" });
    const b = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "load", id: b, code:
      "radio.setGroup(9)\nradio.onReceivedNumber(function (n) { led.plot(0, 0) })" });
    bus.send(ROOM, { cmd: "load", id: a, code:
      "radio.setGroup(3)\nbasic.pause(100)\nradio.sendNumber(7)" });
    bus.send(ROOM, { cmd: "run", id: b });
    bus.send(ROOM, { cmd: "run", id: a });
    await runFor(room, 400);
    expect(room.snapshot().bodies.find(x => x.id === b).screen[0]).toBe(0);
  });

  it("refuses the bitbot blocks when the board is not plugged into one", async () => {
    /* Which is the state every radio lesson is actually in. */
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "place", id, x: 400, y: 1500, heading: 0 });
    bus.send(ROOM, { cmd: "plug", id, on: false });
    bus.send(ROOM, { cmd: "load", id, code: "bitbot.go(BBDirection.Forward, 80)" });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 500);
    expect(room.bodies()[0].x).toBeCloseTo(400, 1);
    expect(recent().some(l => /not plugged into a Bit:Bot/.test(l.msg))).toBe(true);
  });

  it("puts a robot back where Play found it when it is reset", async () => {
    const id = bus.send(ROOM, { cmd: "add" });
    bus.send(ROOM, { cmd: "place", id, x: 400, y: 1500, heading: 0 });
    room.tick();
    bus.send(ROOM, { cmd: "load", id, code: "bitbot.go(BBDirection.Forward, 80)" });
    bus.send(ROOM, { cmd: "run", id });
    await runFor(room, 600);
    expect(room.bodies()[0].x).toBeGreaterThan(500);

    bus.send(ROOM, { cmd: "reset", id });
    room.tick();
    expect(room.bodies()[0].x).toBeCloseTo(400, 0);
    expect(room.machine(id).state()).toBe("ready");
  });
});
