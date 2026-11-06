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
import { BY_ID, IR_BY_ID, SERVO_PINS } from "../hardware/addons.js";

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
  /* IS THE BOARD THIS BLOCK NEEDS ACTUALLY BOLTED ON?

     This used to say "the gym has not got it" and that was the end of
     the matter. Now the gym has sockets, so the honest answer is "not
     on this robot, but you can fit one" - and the block goes quiet in
     exactly the way the real one does when the board is not there. The
     note is said once per robot per board, not once per call, because a
     block inside `forever` would otherwise fill the log in a second.

     Returns true when the caller should give up. */
  const needs = (id, what) => {
    if (chassis.fitted(id)) return false;
    const a = BY_ID[id];
    sayOnce("fit:" + id, "note: " + what + " needs the " +
            (a ? a.name : id) + ", which is not fitted - " +
            "click the robot and fit one");
    return true;
  };

  /* An IR key's real code off the real handset. The child can read the
     same number in the MakeCode drawer, so it has to be the same number. */
  const codeOf = (key) => {
    const k = IR_BY_ID[String(key)];
    return k ? k.code : 0;
  };

  const num = (v) => (typeof v === "number" && isFinite(v) ? Math.round(v) : 0);

  /* One thing drawn on the little screen. The newest sits last, and the
     list is capped: a `forever` loop writing a reading would otherwise
     grow it without end, and only the last screenful can be seen anyway. */
  const oledPut = (item) => {
    const o = chassis.show().oled;
    if (item.kind === "text") {
      /* text at the same spot replaces what was there, the way writing
         over a line on a real screen does */
      o.lines = o.lines.filter(l => !(l.kind === "text" && l.x === item.x && l.y === item.y));
    }
    o.lines.push(item);
    if (o.lines.length > 64) o.lines.splice(0, o.lines.length - 64);
    o.all = false;
  };

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
      /* No eyes, no answer. The real board returns 0 with nothing
         plugged in, and 0 is also "nothing in range", so a program
         written for a robot with the eyes off behaves exactly as it
         would in an empty room - which is the truth. */
      if (needs("sonar", "the sonar")) return 0;
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

    /* ---------------- the boards you bolt on ----------------

       Each of these needs its own little board screwed to the robot.
       `needs` checks; if the board is not fitted the block says so once
       and does nothing, which is what the real one does. Everything
       written here goes into `chassis.show()`, and the card draws it.

       Nothing is buffered. The real extension can be put into a manual
       update mode, but a child whose drawing never appears because they
       forgot `show changes` has learnt nothing except that the gym is
       broken - so writes land immediately and `matShow` and
       `oledUpdate` are kept as the harmless blocks they look like. */

    /* ---- the Talon claw ---- */
    setTalon: (degrees) => {
      if (needs("talon", "the talon")) return;
      const d = clamp(Math.round(degrees || 0), 0, 90);
      chassis.show().talon.open = d;
      say(d === 0 ? "talon closed" : "talon open " + d + " degrees");
    },

    /* ---- plain servos ----
       The pin matters: a Bit:Bot breaks out P1 and P2, and a child who
       picks another gets told rather than watching nothing happen. */
    bbSetServo: (servo, degrees) => {
      if (needs("servo", "a servo")) return;
      const pin = String(servo || "P1");
      if (SERVO_PINS.indexOf(pin) < 0) {
        sayOnce("servopin:" + pin, "note: a Bit:Bot has servo sockets on " +
                SERVO_PINS.join(" and ") + ", not " + pin);
        return;
      }
      const d = clamp(Math.round(degrees || 0), 0, 180);
      chassis.show().servo[pin] = { mode: "angle", deg: d, dir: null, speed: 0, trim: 0 };
      say("servo " + pin + " to " + d + " degrees");
    },
    bb360Servo: (servo, direction, speed) => {
      if (needs("servo", "a servo")) return;
      const pin = String(servo || "P1");
      if (SERVO_PINS.indexOf(pin) < 0) return;
      const was = chassis.show().servo[pin];
      const sp = clamp(Math.round(speed || 0), 0, 100);
      const band = chassis.show().servo.deadband || 0;
      chassis.show().servo[pin] = {
        mode: "spin",
        /* under the deadband a real continuous servo just sits there
           humming, which is the whole reason the block exists */
        dir: sp <= band ? null : (sign(direction) < 0 ? "REV" : "FWD"),
        speed: sp <= band ? 0 : sp,
        deg: null,
        trim: was ? was.trim || 0 : 0
      };
      say("servo " + pin + " " + (sp <= band ? "stopped (inside the deadband)"
                                             : (sign(direction) < 0 ? "back" : "forward") + " at " + sp + "%"));
    },
    bbServoTrim: (servo, trim) => {
      if (needs("servo", "a servo")) return;
      const pin = String(servo || "P1");
      const sh = chassis.show().servo;
      if (!sh[pin]) sh[pin] = { mode: "spin", dir: null, speed: 0, deg: null, trim: 0 };
      sh[pin].trim = clamp(Math.round(trim || 0), -100, 100);
      say("servo " + pin + " trimmed by " + sh[pin].trim + "%");
    },
    bbServoDeadband: (deadband) => {
      if (needs("servo", "a servo")) return;
      chassis.show().servo.deadband = clamp(Math.round(deadband || 0), 0, 50);
      say("servo deadband " + chassis.show().servo.deadband + "%");
    },
    bbStopServos: () => {
      if (needs("servo", "a servo")) return;
      const sh = chassis.show().servo;
      for (const pin of SERVO_PINS) sh[pin] = null;
      say("servos off");
    },

    /* ---- the infra-red receiver ----

       Two families of block, and the difference is real hardware: the
       PRO has a receiver on board (P14) and uses the plain blocks; every
       other model needs the add-on (P15) and uses the "add-on" ones. A
       handler is registered under the key's own name, and a key press
       in the room fires it - see `ir` in room.js. */
    onIREvent: (key, cb) => {
      if (proOnly("onIREvent")) return;
      ctx.on("ir:" + String(key), cb);
    },
    irKey: (key) => {
      if (proOnly("irKey")) return false;
      return chassis.show().ir.code === codeOf(key);
    },
    lastIRCode: () => (proOnly("lastIRCode") ? 0 : chassis.show().ir.code),
    irKeyCode: (key) => codeOf(key),

    onIREventAddon: (key, cb) => {
      if (needs("ir", "the IR remote")) return;
      ctx.on("ir:" + String(key), cb);
    },
    irKeyAddon: (key) => {
      if (needs("ir", "the IR remote")) return false;
      return chassis.show().ir.code === codeOf(key);
    },
    lastIRCodeAddon: () => (needs("ir", "the IR remote") ? 0 : chassis.show().ir.code),
    irKeyCodeAddon: (key) => codeOf(key),

    /* ---- the 5x5 colour matrix ----
       Index 0 is the top left and they run along each row, so
       `at x,y` and `LED at` agree with each other and with the
       micro:bit screen the children already know. */
    matClear: () => {
      if (needs("matrix", "the matrix")) return;
      chassis.show().matrix.px.fill(null);
      say("matrix cleared");
    },
    setMatrix: (rgb) => {
      if (needs("matrix", "the matrix")) return;
      chassis.show().matrix.px.fill(cssOf(rgb));
      say("matrix all " + colourName(rgb));
    },
    setPixel: (ledId, rgb) => {
      if (needs("matrix", "the matrix")) return;
      const i = Math.round(ledId);
      if (i < 0 || i > 24) return;
      chassis.show().matrix.px[i] = cssOf(rgb);
    },
    setArrayPixel: (x, y, rgb) => {
      if (needs("matrix", "the matrix")) return;
      const cx = Math.round(x), cy = Math.round(y);
      if (cx < 0 || cx > 4 || cy < 0 || cy > 4) return;
      chassis.show().matrix.px[cy * 5 + cx] = cssOf(rgb);
    },
    matRainbow: () => {
      if (needs("matrix", "the matrix")) return;
      const px = chassis.show().matrix.px;
      for (let i = 0; i < 25; i++) px[i] = "hsl(" + Math.round(i * 300 / 24) + ",95%,55%)";
      say("matrix rainbow");
    },
    matRectangle: (x1, y1, x2, y2, rgb, fill) => {
      if (needs("matrix", "the matrix")) return;
      const px = chassis.show().matrix.px, c = cssOf(rgb);
      const ax = clamp(Math.min(x1, x2), 0, 4), bx = clamp(Math.max(x1, x2), 0, 4);
      const ay = clamp(Math.min(y1, y2), 0, 4), by = clamp(Math.max(y1, y2), 0, 4);
      for (let y = ay; y <= by; y++) {
        for (let x = ax; x <= bx; x++) {
          const edge = x === ax || x === bx || y === ay || y === by;
          if (fill || edge) px[y * 5 + x] = c;
        }
      }
    },
    matShowEyeball: (pos, rgb, size) => {
      if (needs("matrix", "the matrix")) return;
      const px = chassis.show().matrix.px, c = cssOf(rgb);
      const big = String(size || "large").toLowerCase() !== "small";
      px.fill(null);
      const lo = big ? 0 : 1, hi = big ? 4 : 3;
      for (let y = lo; y <= hi; y++) for (let x = lo; x <= hi; x++) px[y * 5 + x] = c;
      /* the pupil is a hole in the white, looking where it was told */
      const where = String(pos || "Forward").toLowerCase();
      const dx = where.indexOf("left") >= 0 ? -1 : where.indexOf("right") >= 0 ? 1 : 0;
      const dy = where.indexOf("up") >= 0 ? -1 : where.indexOf("down") >= 0 ? 1 : 0;
      const pxx = clamp(2 + dx, lo, hi), pyy = clamp(2 + dy, lo, hi);
      px[pyy * 5 + pxx] = null;
      say("eyeball looking " + where);
    },
    matShowImage: (myImage, rgb) => {
      if (needs("matrix", "the matrix")) return;
      const px = chassis.show().matrix.px, c = cssOf(rgb);
      if (!myImage || typeof myImage.pixel !== "function") {
        sayOnce("matimage", "note: the matrix needs a picture made with `create image`");
        return;
      }
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) px[y * 5 + x] = myImage.pixel(x, y) ? c : null;
      }
      say("matrix image");
    },
    matShow: () => {},
    matBrightness: (brightness) => {
      if (needs("matrix", "the matrix")) return;
      chassis.show().matrix.bright = clamp(Math.round(brightness || 0), 0, 255);
    },

    /* ---- the BitFace ---- */
    setBitface: (rgb) => {
      if (needs("bitface", "the BitFace")) return;
      const f = chassis.show().bitface, c = cssOf(rgb);
      f.eyeL = c; f.eyeR = c; f.nose = c; f.mouth = c;
      f.shape = f.shape || "Smile";
      say("BitFace all " + colourName(rgb));
    },
    setBitEye: (eye, rgb) => {
      if (needs("bitface", "the BitFace")) return;
      const f = chassis.show().bitface, c = cssOf(rgb), which = String(eye || "Both");
      if (which !== "Right") f.eyeL = c;
      if (which !== "Left") f.eyeR = c;
      say("BitFace " + which.toLowerCase() + " eye " + colourName(rgb));
    },
    setBitNose: (rgb) => {
      if (needs("bitface", "the BitFace")) return;
      chassis.show().bitface.nose = cssOf(rgb);
    },
    setBitMouth: (mouth, rgb) => {
      if (needs("bitface", "the BitFace")) return;
      const f = chassis.show().bitface;
      f.shape = String(mouth || "Smile");
      f.mouth = cssOf(rgb);
      say("BitFace " + f.shape.toLowerCase());
    },
    bitBrightness: (brightness) => {
      if (needs("bitface", "the BitFace")) return;
      chassis.show().bitface.bright = clamp(Math.round(brightness || 0), 0, 255);
    },

    /* ---- the OLED ----
       Kept as what was asked for - these words at this spot, this line
       from here to there - rather than as a grid of dots. The card can
       then draw real text instead of a blurry 5x7 font, and a saved
       project stays small. */
    oledText: (text, x, y, inv) => {
      if (needs("oled", "the screen")) return;
      oledPut({ kind: "text", text: String(text), x: num(x), y: num(y), inv: !!inv });
      say("OLED: " + text);
    },
    oledNumber: (n, x, y, inv) => {
      if (needs("oled", "the screen")) return;
      oledPut({ kind: "text", text: String(n), x: num(x), y: num(y), inv: !!inv });
      say("OLED: " + n);
    },
    oledUpdate: () => {},
    oledSet: (set) => {
      if (needs("oled", "the screen")) return;
      const o = chassis.show().oled;
      o.lines = []; o.all = !!set;
      say(set ? "OLED all on" : "OLED cleared");
    },
    oledInvert: (inv) => { if (!needs("oled", "the screen")) chassis.show().oled.invert = !!inv; },
    oledZOOM: (zoom) => { if (!needs("oled", "the screen")) chassis.show().oled.zoom = !!zoom; },
    oledPlotPixel: (x, y, doSet) => {
      if (needs("oled", "the screen")) return;
      oledPut({ kind: "dot", x: num(x), y: num(y), on: doSet !== false });
    },
    oledLine: (x1, y1, x2, y2, doSet) => {
      if (needs("oled", "the screen")) return;
      oledPut({ kind: "line", x: num(x1), y: num(y1), x2: num(x2), y2: num(y2), on: doSet !== false });
    },
    oledRectangle: (x1, y1, x2, y2, doSet) => {
      if (needs("oled", "the screen")) return;
      oledPut({ kind: "rect", x: num(x1), y: num(y1), x2: num(x2), y2: num(y2), on: doSet !== false });
    },
    oledCircle: (x, y, r, doSet) => {
      if (needs("oled", "the screen")) return;
      oledPut({ kind: "circle", x: num(x), y: num(y), r: num(r), on: doSet !== false });
    },

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
