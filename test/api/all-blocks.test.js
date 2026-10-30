import { describe, it, expect, beforeEach } from "vitest";
import { createRoom, ROOM } from "../../src/app/room.js";
import { createBus } from "../../src/core/bus.js";
import { blockNames, ENUMS } from "../../src/api/index.js";
import { clearLog, recent } from "../../src/core/log.js";

/* The coverage gate.

   Every namespace is behind a forgiving proxy, which is right in a
   classroom - a block the gym has never heard of says so and the program
   carries on rather than dying half way down. But it means a block could
   quietly go missing in a refactor and nothing would notice, because the
   proxy would answer for it.

   So: call every block, with arguments of the shape MakeCode passes, and
   insist that none of them throws and that the count has not changed. */

const COUNTS = {
  basic: 8, input: 22, led: 15, music: 21, radio: 10,
  control: 5, pins: 11, loops: 1, game: 10, serial: 8, bitbot: 104
};

/* An argument that will do for each block, picked by what the real one
   takes. Anything not named here gets the general-purpose list below. */
const ARGS = {
  "basic.showIcon": ["Heart"], "basic.showArrow": ["North"],
  "basic.showLeds": ["#....\n.#...\n..#..\n...#.\n....#"],
  "basic.showNumber": [7, 50], "basic.showString": ["A", 50],
  "basic.pause": [1], "basic.forever": [() => {}],
  "input.buttonIsPressed": ["A"], "input.onButtonPressed": ["A", () => {}],
  "input.onGesture": ["shake", () => {}], "input.onLogoEvent": ["pressed", () => {}],
  "input.onPinPressed": ["P0", () => {}], "input.onPinTouchEvent": ["P0", "down", () => {}],
  "input.pinIsPressed": ["P0"], "input.onSound": ["loud", () => {}],
  "input.acceleration": ["x"], "input.rotation": ["pitch"], "input.magneticForce": ["x"],
  "led.plot": [2, 2], "led.unplot": [2, 2], "led.toggle": [2, 2], "led.point": [2, 2],
  "led.plotBrightness": [2, 2, 120], "led.pointBrightness": [2, 2],
  "led.setBrightness": [200], "led.enable": [true], "led.plotBarGraph": [5, 10],
  "music.play": ["ba ding", 1], "music.playTone": [440, 1], "music.ringTone": [440],
  "music.rest": [1], "music.tonePlayable": ["C", "Quarter"], "music.beat": ["Quarter"],
  "music.setTempo": [140], "music.changeTempoBy": [10], "music.startMelody": ["dadadadum"],
  "music.playMelody": ["dadadadum", 1], "music.onEvent": ["MelodyEnded", () => {}],
  "music.setVolume": [100], "music.builtinPlayableSoundEffect": ["giggle"],
  "music.builtInPlayableMelody": ["dadadadum"], "music.createSoundExpression": ["giggle"],
  "radio.setGroup": [3], "radio.sendNumber": [7], "radio.sendString": ["hi"],
  "radio.sendValue": ["k", 1], "radio.onReceivedNumber": [() => {}],
  "radio.onReceivedString": [() => {}], "radio.onReceivedValue": [() => {}],
  "radio.setTransmitPower": [7],
  "control.waitMicros": [100], "control.inBackground": [() => {}],
  "pins.map": [5, 0, 10, 0, 100], "loops.everyInterval": [500, () => {}],
  "game.setScore": [3], "game.addScore": [1], "game.removeLife": [1], "game.setLife": [3],
  "game.startCountdown": [1000],

  "bitbot.select_model": ["XL"], "bitbot.BBModels": ["XL"],
  "bitbot.go": ["FWD", 60], "bitbot.goms": ["FWD", 60, 1],
  "bitbot.rotate": ["R", 60], "bitbot.rotatems": ["R", 60, 1], "bitbot.stop": ["brake"],
  "bitbot.move": ["L", "FWD", 60], "bitbot.movems": ["L", "FWD", 60, 1],
  "bitbot.BBBias": ["R", 20],
  "bitbot.motor": ["B", 500], "bitbot.drive": [500], "bitbot.driveMilliseconds": [500, 1],
  "bitbot.driveTurn": ["L", 500], "bitbot.driveTurnMilliseconds": ["L", 500, 1],
  "bitbot.gocm": ["FWD", 60, 10], "bitbot.spinDeg": ["R", 60, 90],
  "bitbot.arc": ["FL", 60, 10], "bitbot.arcdeg": ["FL", 60, 10, 90],
  "bitbot.steer": [20, 60], "bitbot.enablePID": [true],
  "bitbot.wheelSensor": ["L", "mm"], "bitbot.resetWheelSensors": ["B"],
  "bitbot.readLine": ["L"], "bitbot.readLineDigital": ["L"], "bitbot.readLineAnalog": ["L"],
  "bitbot.readLight": ["L"], "bitbot.sonar": ["cm"],
  "bitbot.setLedColor": [0xff0000], "bitbot.setPixelColor": [3, 0x00ff00],
  "bitbot.ledBrightness": [80], "bitbot.ledRainbow": [true, "B"],
  "bitbot.ledShift": [true, "B"], "bitbot.ledRotate": [true, "B"],
  "bitbot.BBColours": [0xff0000], "bitbot.convertRGB": [255, 128, 0],
  "bitbot.buzz": [true], "bitbot.buzzTime": [1], "bitbot.setVolume": [2]
};
const GENERAL = [1, 1, 1, 1];

describe("every block the gym answers to", () => {
  let bus, room, api;
  beforeEach(() => {
    clearLog();
    bus = createBus();
    room = createRoom({ bus, scene: "classroom", seed: 5 });
    const id = bus.send(ROOM, { cmd: "add" });
    room.tick();
    api = room.machine(id).api;
  });

  it("has not quietly lost one", () => {
    /* The proxy answers for a name that is not there, so only a count can
       notice a block going missing. If this fails, either a block went or
       a new one arrived - both are a decision, not an accident. */
    const names = blockNames();
    for (const ns of Object.keys(COUNTS)) {
      expect(names[ns].length, ns).toBe(COUNTS[ns]);
    }
  });

  it("runs every single one without throwing", async () => {
    const names = blockNames();
    const broke = [];
    for (const ns of Object.keys(names)) {
      for (const name of names[ns]) {
        const args = ARGS[ns + "." + name] || GENERAL;
        try {
          const out = api[ns][name](...args);
          if (out && typeof out.then === "function") await Promise.race([out, tick(room)]);
        } catch (e) {
          broke.push(ns + "." + name + ": " + e.message);
        }
      }
    }
    expect(broke).toEqual([]);
  });

  it("gives every value block a number, a string or a boolean - never undefined", async () => {
    /* A block that returns undefined turns into "undefined" on the screen
       or NaN in a sum, and the child has no idea why. */
    const names = blockNames();
    const bad = [];
    for (const ns of Object.keys(names)) {
      for (const name of names[ns]) {
        if (!/^(read|get|is|has|sonar|point|brightness|volume|tempo|score|life|turnAngle|wheelSensor|batteryVoltage|convertRGB|mergeLinePosition|map|irKey|lastIR|checkCalibration)/.test(name)) continue;
        const out = api[ns][name](...(ARGS[ns + "." + name] || GENERAL));
        if (out === undefined) bad.push(ns + "." + name);
      }
    }
    expect(bad).toEqual([]);
  });

  it("knows every enum a MakeCode program might name", () => {
    for (const k of ["IconNames", "Button", "Gesture", "Note", "BeatFraction",
                     "BBDirection", "BBMotor", "BBLineSensor", "BBLightSensor",
                     "BBPingUnit", "BBColors", "BBStopMode", "BBArcDirection"]) {
      expect(ENUMS, k).toHaveProperty(k);
    }
    expect(ENUMS.BBColors.Red).toBe(0xff0000);
    expect(ENUMS.IconNames.Heart).toBe("Heart");      // any name answers for itself
  });
});

/* The three readings off the extension's own source that have each caught a
   lesson out. They are the reason the shims were written from the source
   rather than from the documentation. */
describe("the quirks of the real hardware", () => {
  let bus, room, api;
  beforeEach(() => {
    clearLog();
    bus = createBus();
    room = createRoom({ bus, scene: "classroom", seed: 5 });
    const id = bus.send(ROOM, { cmd: "add" });
    room.tick();
    api = room.machine(id).api;
  });

  it("makes read line digital say false on an XL, and says why", () => {
    expect(api.bitbot.readLineDigital("L")).toBe(false);
    expect(recent().some(l => /use "read line sensor" on an XL/.test(l.msg))).toBe(true);
    api.bitbot.select_model("PRO");
    expect(typeof api.bitbot.readLineDigital("L")).toBe("boolean");
  });

  it("runs motor on 0 to 1023 and go on 0 to 100, and warns about it", () => {
    api.bitbot.motor("B", 1023);
    expect(recent().some(l => /0 to 1023, not 0 to 100/.test(l.msg))).toBe(true);
  });

  it("gives 0 from the sonar when nothing is within 2 m, and says so", () => {
    /* "nothing there" and "touching my nose" are both small numbers, so
       `if sonar < 15` is true in an empty room. */
    const open = createRoom({ bus: createBus(), scene: "outdoor", seed: 5 });
    const id = open.handle({ cmd: "add", x: 1500, y: 1500, heading: -Math.PI / 2 });
    open.tick();
    expect(open.machine(id).api.bitbot.sonar("cm")).toBe(0);
    expect(recent().some(l => /watch out for "if sonar < 15"/.test(l.msg))).toBe(true);
  });

  it("refuses every PRO-only block on an XL, politely, and carries on", () => {
    const proOnly = ["gocm", "spinDeg", "arc", "arcdeg", "steer", "enablePID",
                     "wheelSensor", "turnAngle", "readLineAnalog", "mergeLinePosition",
                     "batteryVoltage"];
    for (const name of proOnly) {
      expect(() => api.bitbot[name](...(ARGS["bitbot." + name] || GENERAL))).not.toThrow();
    }
    const notes = recent().filter(l => /only does anything on a Bit:Bot PRO/.test(l.msg));
    expect(notes.length).toBeGreaterThanOrEqual(8);
  });

  it("says once, not once a tick, so the log stays readable", () => {
    for (let i = 0; i < 20; i++) api.bitbot.turnAngle();
    expect(recent().filter(l => /turnAngle/.test(l.msg))).toHaveLength(1);
  });
});

/* A promise that never resolves would hang the suite; the blocks that wait
   are given 1 ms and a few ticks to finish in. */
function tick(room) {
  return new Promise(resolve => {
    for (let i = 0; i < 40; i++) { room.tick(); }
    resolve();
  });
}
