/* Every block in the 4tronix Bit:Bot extension (github:4tronix/BitBot v2.1.9),
   behaving the way the real one does - which includes refusing to work.

   Three things in here are not guesses but readings off the extension's own
   source, and all three have caught a lesson out:

     - `readLineDigital` returns false on anything that is not a PRO. On an
       XL the block to use is `read line sensor`.
     - `motor`, `drive` and `driveTurn` take 0 to 1023. `go`, `move` and
       `rotate` take 0 to 100. Mixing them is the commonest reason a robot
       sits still or bolts.
     - `sonar` returns 0 when nothing is within 2 m, not something large. So
       `if sonar < 15` is true in an empty room.

   The class has XLs, so every PRO-only block says so plainly and carries
   on, exactly as the hardware does. */

import { clamp } from "../core/util.js";
import { colourName } from "./enums.js";

const sign = d => (d === "REV" ? -1 : 1);
const armRange = arm => (arm === "L" ? [0, 6] : arm === "R" ? [6, 12] : [0, 12]);

function cssOf(rgb) {
  if (typeof rgb === "string") return rgb;
  const n = clamp(Math.round(rgb || 0), 0, 0xffffff);
  return "#" + n.toString(16).padStart(6, "0");
}

export function createBitbotApi(ctx) {
  const { chassis, reads, wait, say, sayOnce, random, axle } = ctx;

  const proOnly = (name) => {
    if (chassis.model() === "PRO") return false;
    sayOnce("pro:" + name, "note: " + name + " only does anything on a Bit:Bot PRO - your " +
            chassis.model() + " ignores it");
    return true;
  };
  const addon = (group, what) =>
    sayOnce("addon:" + group, "note: " + what + " needs the " + group +
            " add-on, which the gym has not got");

  const setWheels = (l, r) => chassis.wheels(l, r);
  const stopWheel = (w) => {
    if (w === "L") chassis.wheels(0, null);
    else if (w === "R") chassis.wheels(null, 0);
    else chassis.wheels(0, 0);
  };

  /* "go 20 cm", "spin 90 degrees" and "arc 90 degrees" are the blocks the
     PRO does not do with its motors directly: it hands the job to the
     controller on the motor board, which counts the wheels round and runs
     its own loop until the job is done. So count the wheels here too, and
     ease off near the end the way that controller does - otherwise the
     robot sails past what it was asked for. */
  async function runCounting(want, measure) {
    const l0 = chassis.encoder("L"), r0 = chassis.encoder("R");
    let lastSeen = 0, stuckFor = 0, eased = false;
    for (;;) {
      const gone = measure(chassis.encoder("L") - l0, chassis.encoder("R") - r0);
      const left = want - gone;
      if (left <= 0) return;
      if (left < want * 0.25 && left < 60 && !eased) {
        eased = true;
        chassis.ease(22);
      }
      stuckFor = gone - lastSeen < 0.05 ? stuckFor + 5 : 0;
      lastSeen = gone;
      if (stuckFor > 2000) { say("the wheels are not turning - something is in the way"); return; }
      await wait(5);
    }
  }
  const runWheels = mm => runCounting(Math.abs(mm), (dl, dr) => (Math.abs(dl) + Math.abs(dr)) / 2);
  /* how far it has TURNED: the difference between the two wheels, which is
     all a robot with two wheels ever knows about its own heading */
  const runTurn = deg => runCounting(Math.abs(deg) * Math.PI / 180 * axle,
                                     (dl, dr) => Math.abs(dl - dr));

  const bitbot = {
    /* ---------------- which robot ---------------- */
    select_model: (mod) => { chassis.model(mod === "Auto" ? "XL" : mod); say("Bit:Bot model: " + chassis.model()); },
    getModel: () => chassis.model(),
    BBModels: mod => mod,
    getVersionCode: () => (chassis.model() === "PRO" ? 16 : chassis.model() === "XL" ? 9 : 0),
    getFirmwareCode: () => (proOnly("getFirmwareCode") ? 0 : 11),
    bbEnableBluetooth: () => {},

    /* ---------------- driving: the 0 to 100 blocks ---------------- */
    go: (dir, speed) => {
      chassis.brake(false);
      const s = sign(dir) * clamp(speed, -100, 100);
      setWheels(s, s);
      say((sign(dir) < 0 ? "reverse" : "forward") + " at " + speed + "%" +
          (chassis.willMove(speed) ? "" : "  (too slow to move)"));
    },
    goms: async (dir, speed, ms) => { bitbot.go(dir, speed); await wait(ms); bitbot.stop("brake"); },
    rotate: (dir, speed) => {
      chassis.brake(false);
      const s = clamp(speed, 0, 100);
      setWheels(dir === "R" ? s : -s, dir === "R" ? -s : s);
      say("turn " + (dir === "R" ? "right" : "left") + " at " + speed + "%" +
          (chassis.willMove(s) ? "" : "  (too slow to move)"));
    },
    rotatems: async (dir, speed, ms) => { bitbot.rotate(dir, speed); await wait(ms); bitbot.stop("brake"); },
    stop: (mode) => {
      stopWheel("B");
      chassis.brake(mode !== "coast");
      if (mode === "coast") sayOnce("coast", "note: coasting - the robot rolls on until friction stops it");
    },
    move: (motor, dir, speed) => {
      chassis.brake(false);
      const s = sign(dir) * clamp(speed, -100, 100);
      if (motor === "L") setWheels(s, null);
      else if (motor === "R") setWheels(null, s);
      else setWheels(s, s);
      say((motor === "L" ? "left motor " : motor === "R" ? "right motor " : "both motors ") +
          (sign(dir) < 0 ? "reverse" : "forward") + " at " + speed + "%" +
          (chassis.willMove(speed) ? "" : "  (too slow to move)"));
    },
    movems: async (motor, dir, speed, ms) => { bitbot.move(motor, dir, speed); await wait(ms); stopWheel(motor); },
    BBBias: (dir, bias) => {
      chassis.bias(dir, clamp(bias, 0, 80));
      say("bias " + clamp(bias, 0, 80) + "% to the " + (dir === "R" ? "right" : "left"));
    },

    /* ---------------- driving: the old 0 to 1023 blocks ---------------- */
    motor: (which, speed) => {
      const pct = clamp(speed, -1023, 1023) / 1023 * 100;
      if (which === "L") setWheels(pct, null);
      else if (which === "R") setWheels(null, pct);
      else setWheels(pct, pct);
      sayOnce("scale1023", "note: motor, drive and driveTurn run on 0 to 1023, not 0 to 100");
      say("motor " + (which === "L" ? "left" : which === "R" ? "right" : "both") +
          " at " + speed + " of 1023");
    },
    drive: speed => bitbot.motor("B", speed),
    driveMilliseconds: async (speed, ms) => { bitbot.motor("B", speed); await wait(ms); stopWheel("B"); },
    driveTurn: (dir, speed) => {
      const s = Math.max(0, speed);
      bitbot.motor("L", dir === "L" ? -s : s);
      bitbot.motor("R", dir === "L" ? s : -s);
    },
    driveTurnMilliseconds: async (dir, speed, ms) => { bitbot.driveTurn(dir, speed); await wait(ms); stopWheel("B"); },

    /* ---------------- by distance and angle: PRO only ---------------- */
    gocm: async (dir, speed, distance) => {
      if (proOnly("gocm")) return;
      bitbot.go(dir, speed);
      if (chassis.willMove(clamp(speed, 0, 100))) await runWheels(Math.abs(distance) * 10);
      bitbot.stop("brake");
    },
    spinDeg: async (dir, speed, angle) => {
      if (proOnly("spinDeg")) return;
      bitbot.rotate(dir, speed);
      if (chassis.willMove(clamp(speed, 0, 100))) await runTurn(angle);
      bitbot.stop("brake");
    },
    arc: (dir, speed, radius) => {
      if (proOnly("arc")) return;
      const R = Math.max(radius, 7) * 10;           // the extension floors the radius at 7 cm
      const back = (dir === "RL" || dir === "RR") ? -1 : 1;
      const inner = speed * (R - axle / 2) / (R + axle / 2);
      const left = (dir === "FL" || dir === "RL") ? inner : speed;
      const right = (dir === "FL" || dir === "RL") ? speed : inner;
      setWheels(back * left, back * right);
      say("arc " + dir + " at " + speed + "%, radius " + Math.max(radius, 7) + " cm");
    },
    arcdeg: async (dir, speed, radius, angle) => {
      if (proOnly("arcdeg")) return;
      bitbot.arc(dir, speed, radius);
      if (chassis.willMove(speed)) await runTurn(angle);
      bitbot.stop("brake");
    },
    steer: (direction, speed) => {
      if (proOnly("steer")) return;
      const d = clamp(direction, -100, 100), sp = clamp(speed, 0, 100);
      setWheels(d > 0 ? sp : (100 + d) * sp / 100, d < 0 ? sp : (100 - d) * sp / 100);
      say("steer " + d + " at " + sp + "%");
    },

    /* ---------------- the wheel encoders: PRO only ---------------- */
    enablePID: (on) => { if (!proOnly("enablePID")) say("PID " + (on ? "on" : "off")); },
    wheelSensor: (sensor, unit) => {
      if (proOnly("wheelSensor")) return 0;
      const mm = Math.abs(chassis.encoder(sensor));
      if (unit === "mm") return Math.round(mm);
      if (unit === "cm") return Math.round(mm / 10);
      if (unit === "in") return Math.round(mm / 25.4);
      return Math.round(mm * 10.36);
    },
    turnAngle: () => (proOnly("turnAngle") ? 0
      : Math.round((chassis.encoder("L") - chassis.encoder("R")) / axle * 180 / Math.PI)),
    resetWheelSensors: which => chassis.resetEncoders(which),
    lastEncoderError: () => (proOnly("lastEncoderError") ? 0 : 0),
    motorTrim: () => proOnly("motorTrim"),
    pidConstants: () => proOnly("pidConstants"),
    carryForwardErrors: () => proOnly("carryForwardErrors"),
    clearPidErrors: () => proOnly("clearPidErrors"),
    stopThreshold: () => proOnly("stopThreshold"),
    setStartPWM: () => proOnly("setStartPWM"),

    /* ---------------- the line sensors ---------------- */
    readLine: sensor => (sensor === "L" ? reads().lineL : reads().lineR),
    readLineDigital: (sensor) => {
      if (chassis.model() !== "PRO") {
        sayOnce("rld", "note: read line digital always says false unless you have a PRO - " +
                       "use \"read line sensor\" on an XL");
        return false;
      }
      return bitbot.readLine(sensor) === 1;
    },
    readLineAnalog: (sensor) => {
      if (proOnly("readLineAnalog")) return 0;
      return bitbot.readLine(sensor) ? 120 + random.int(0, 60) : 820 + random.int(0, 60);
    },
    mergeLinePosition: () => {
      if (proOnly("mergeLinePosition")) return 0;
      const l = reads().lineL, r = reads().lineR, c = 0;
      if (!l && !r && !c) return 0;
      return Math.round(((r * 100 + c * 50) - (l * 100 + c * 50)) / Math.max(1, l + r + c));
    },
    setThreshold: () => proOnly("setThreshold"),
    calibrateLine: () => proOnly("calibrateLine"),

    /* ---------------- the other sensors ---------------- */
    readLight: sensor => (sensor === "L" ? reads().lightL : reads().lightR),
    sonar: (unit) => {
      const cm = reads().sonar;
      if (cm === 0) sayOnce("sonar0", "note: nothing within 2 m, so sonar gives 0 - " +
                                      "watch out for \"if sonar < 15\"");
      if (unit === "in") return Math.round(cm / 2.54);
      if (unit === "us") return Math.round(cm * 59);
      return cm;
    },
    batteryVoltage: () => (proOnly("batteryVoltage") ? 0
      : Math.round((4.85 + random.next() * 0.2) * 100) / 100),

    /* ---------------- the lights along each arm ---------------- */
    setLedColor: (rgb) => { chassis.pixels().fill(cssOf(rgb)); say("lights " + colourName(rgb)); },
    setPixelColor: (id, rgb) => { chassis.pixels()[((id % 12) + 12) % 12] = cssOf(rgb); },
    ledClear: () => chassis.pixels().fill(null),
    ledBrightness: level => chassis.pixelBright(clamp(level, 0, 255)),
    ledRainbow: (dir, arm) => {
      const [a, z] = armRange(arm), px = chassis.pixels();
      for (let i = a; i < z; i++) px[i] = "hsl(" + Math.round((i - a) * 300 / (z - a - 1 || 1)) + ",95%,55%)";
      say("rainbow");
    },
    ledShift: (dir, arm) => {
      const [a, z] = armRange(arm), px = chassis.pixels(), slice = px.slice(a, z);
      if (dir) { slice.pop(); slice.unshift(null); } else { slice.shift(); slice.push(null); }
      for (let i = a; i < z; i++) px[i] = slice[i - a];
    },
    ledRotate: (dir, arm) => {
      const [a, z] = armRange(arm), px = chassis.pixels(), slice = px.slice(a, z);
      if (dir) slice.unshift(slice.pop()); else slice.push(slice.shift());
      for (let i = a; i < z; i++) px[i] = slice[i - a];
    },
    setUpdateMode: () => {},
    ledShow: () => {},
    BBColours: c => c,
    convertRGB: (r, g, b) => (clamp(r, 0, 255) << 16) + (clamp(g, 0, 255) << 8) + clamp(b, 0, 255),

    /* ---------------- the buzzer ---------------- */
    buzz: (flag) => { ctx.beep(flag ? 400 : 0); say("buzzer " + (flag ? "on" : "off")); },
    buzzTime: async (ms) => { ctx.beep(ms); say("buzz for " + ms + " ms"); await wait(ms); },
    setVolume: (v) => { if (!proOnly("setVolume")) say("buzzer volume " + v); },

    /* ---------------- things the gym has not got bolted on ----------------
       The class has none of these boards. Rather than pretend, each one
       says plainly what it would have needed, once, and the program
       carries on - which is what the real robot does too. */
    setTalon: () => addon("servo", "the talon"),
    bbSetServo: () => addon("servo", "set servo"),
    bb360Servo: () => addon("servo", "the 360 servo"),
    bbServoDeadband: () => addon("servo", "servo deadband"),
    bbServoTrim: () => addon("servo", "servo trim"),
    bbStopServos: () => addon("servo", "stop servos"),

    onIREvent: () => { if (!proOnly("onIREvent")) addon("infra-red", "the IR remote"); },
    irKey: () => { proOnly("irKey"); return false; },
    lastIRCode: () => { proOnly("lastIRCode"); return 0; },
    irKeyCode: () => 0,
    onIREventAddon: () => addon("infra-red", "the IR remote"),
    irKeyAddon: () => { addon("infra-red", "the IR remote"); return false; },
    lastIRCodeAddon: () => { addon("infra-red", "the IR remote"); return 0; },
    irKeyCodeAddon: () => 0,

    matClear: () => addon("matrix", "the 5x5 matrix"),
    setMatrix: () => addon("matrix", "the 5x5 matrix"),
    setPixel: () => addon("matrix", "the 5x5 matrix"),
    setArrayPixel: () => addon("matrix", "the 5x5 matrix"),
    matRainbow: () => addon("matrix", "the 5x5 matrix"),
    matRectangle: () => addon("matrix", "the 5x5 matrix"),
    matShowEyeball: () => addon("matrix", "the 5x5 matrix"),
    matShowImage: () => addon("matrix", "the 5x5 matrix"),
    matShow: () => addon("matrix", "the 5x5 matrix"),
    matBrightness: () => addon("matrix", "the 5x5 matrix"),

    setBitface: () => addon("bitface", "the BitFace"),
    setBitEye: () => addon("bitface", "the BitFace"),
    setBitNose: () => addon("bitface", "the BitFace"),
    setBitMouth: () => addon("bitface", "the BitFace"),
    bitBrightness: () => addon("bitface", "the BitFace"),

    oledText: () => addon("OLED", "the screen"),
    oledNumber: () => addon("OLED", "the screen"),
    oledUpdate: () => addon("OLED", "the screen"),
    oledSet: () => addon("OLED", "the screen"),
    oledInvert: () => addon("OLED", "the screen"),
    oledZOOM: () => addon("OLED", "the screen"),
    oledPlotPixel: () => addon("OLED", "the screen"),
    oledLine: () => addon("OLED", "the screen"),
    oledRectangle: () => addon("OLED", "the screen"),
    oledCircle: () => addon("OLED", "the screen"),

    /* ---------------- the memory on the board ---------------- */
    writeEEROM: () => sayOnce("eerom", "note: the gym has no EEROM to remember things in"),
    wrEEROM: () => sayOnce("eerom", "note: the gym has no EEROM to remember things in"),
    readEEROM: () => { sayOnce("eerom", "note: the gym has no EEROM to remember things in"); return 0; },
    rdEEROM: () => { sayOnce("eerom", "note: the gym has no EEROM to remember things in"); return 0; },
    loadCalibration: () => {},
    saveCalibration: () => say("wheel calibration saved"),
    checkCalibration: () => 0
  };

  return bitbot;
}
