/* ========================================================================
   4. The MakeCode shims. These are the blocks, written out as the robot
      and the board would really behave.
   ======================================================================== */
const log = document.getElementById("log");
let stageHost = null, stageCards = new Map(), stageRoom = null;
function say(msg, cls, m) {
  const d = document.createElement("div");
  if (cls) d.className = cls;
  if (m) {
    d.dataset.dev = m.id;
    const tag = document.createElement("b");
    tag.textContent = m.name + " ";
    tag.style.color = m.colour;
    d.appendChild(document.createTextNode((simTime / 1000).toFixed(1).padStart(5) + "  "));
    d.appendChild(tag);
    d.appendChild(document.createTextNode(msg));
    log.appendChild(d);
    while (log.children.length > 400) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
    echoToStage(d);
    echoToCard(d, m);
    return;
  }
  d.textContent = (simTime / 1000).toFixed(1).padStart(5) + "  " + msg;
  log.appendChild(d);
  while (log.children.length > 300) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
  echoToStage(d);
}

// one board's line also goes on that board's own card
function echoToCard(d, m) {
  if (!m || !stageOpen()) return;
  const c = stageCards.get("m" + m.id);
  if (!c || !c.log) return;
  const line = d.cloneNode(true);
  const tag = line.querySelector("b");
  if (tag) tag.remove();                      // the card already says whose it is
  c.log.appendChild(line);
  while (c.log.children.length > 60) c.log.removeChild(c.log.firstChild);
  c.log.scrollTop = c.log.scrollHeight;
}

// the running view keeps its own copy of the whole log
function echoToStage(d) {
  if (!stageOpen()) return;
  const l = stageHost.querySelector("#stageLog");
  if (!l) return;        // the running view keeps its log on the cards now
  l.appendChild(d.cloneNode(true));
  while (l.children.length > 400) l.removeChild(l.firstChild);
  l.scrollTop = l.scrollHeight;
}

const ICONS = {
  Heart: "0101011111111110111000100", SmallHeart: "0000001010011100010000000",
  Asleep: "0000011011000000111000000", Happy: "0000001010000001000101110",
  Sad: "0000001010000000111010001", Angry: "1000101010000001111110101",
  Surprised: "0101000000001000101000100", Confused: "0101000000000000101010101",
  Yes: "0000000001000101010001000", No: "1000101010001000101010001",
  Skull: "0111010101111110111001110", Ghost: "0111010101111111111110101",
  Chessboard: "0101010101010101010101010", Square: "1111110001100011000111111",
  Diamond: "0010001010100010101000100", Target: "0010001110110110111000100",
  Duck: "0110011100011111111001110", House: "0010001110111111111001110",
  StickFigure: "0010011111001000101010001", Umbrella: "0111011111001000101001100"
};
const ARROWS = {
  North:     "0010001110101010010000100", NorthEast: "0011100011001010100010000",
  East:      "0010000010111110001000100", SouthEast: "1000001000001010001100111",
  South:     "0010000100101010111000100", SouthWest: "0000100010101001100011100",
  West:      "0010001000111110100000100", NorthWest: "1110011000101000001000001"
};
const UNKNOWN = "1111110001101011000111111";

const screenEls = [];
(function buildScreen() {
  const s = document.getElementById("screen");
  if (!s) return;
  for (let i = 0; i < 25; i++) { const e = document.createElement("span"); s.appendChild(e); screenEls.push(e); }
  const p = document.getElementById("pix");
  for (let i = 0; i < 12; i++) { const e = document.createElement("i"); p.appendChild(e); }
})();

function setScreen(m, pattern) {
  for (let i = 0; i < 25; i++) m.screen[i] = pattern[i] === "1" ? 1 : 0;
}
function screenFromLeds(m, text) {
  const bits = String(text).replace(/[^#.]/g, "").replace(/#/g, "1").replace(/\./g, "0");
  setScreen(m, bits.padEnd(25, "0").slice(0, 25));
}
/* The 5x5 font. One digit or one letter stands still; anything longer
   scrolls in from the right, a column at a time, exactly as the board does. */
const FONT = {
  "0": "01100 10010 10010 10010 01100", "1": "00100 01100 00100 00100 01110",
  "2": "11100 00010 01100 10000 11110", "3": "11110 00010 01100 00010 11100",
  "4": "10000 10100 10100 11110 00100", "5": "11110 10000 11100 00010 11100",
  "6": "00110 01000 11100 10010 01100", "7": "11110 00010 00100 01000 01000",
  "8": "01100 10010 01100 10010 01100", "9": "01100 10010 01110 00010 01100",
  "A": "01100 10010 11110 10010 10010", "B": "11100 10010 11100 10010 11100",
  "C": "01110 10000 10000 10000 01110", "D": "11100 10010 10010 10010 11100",
  "E": "11110 10000 11100 10000 11110", "F": "11110 10000 11100 10000 10000",
  "G": "01110 10000 10110 10010 01110", "H": "10010 10010 11110 10010 10010",
  "I": "11100 01000 01000 01000 11100", "J": "11110 00010 00010 10010 01100",
  "K": "10010 10100 11000 10100 10010", "L": "10000 10000 10000 10000 11110",
  "M": "10001 11011 10101 10001 10001", "N": "10001 11001 10101 10011 10001",
  "O": "01100 10010 10010 10010 01100", "P": "11100 10010 11100 10000 10000",
  "Q": "01100 10010 10010 01100 00110", "R": "11100 10010 11100 10100 10010",
  "S": "01110 10000 01100 00010 11100", "T": "11111 00100 00100 00100 00100",
  "U": "10010 10010 10010 10010 01100", "V": "10001 10001 10001 01010 00100",
  "W": "10001 10001 10101 11011 10001", "X": "10010 10010 01100 10010 10010",
  "Y": "10001 01010 00100 00100 00100", "Z": "11110 00100 01000 10000 11110",
  " ": "00000 00000 00000 00000 00000", "-": "00000 00000 11110 00000 00000",
  "+": "00000 00100 01110 00100 00000", ".": "00000 00000 00000 00000 00100",
  "?": "11100 00010 01100 00000 01000", "!": "01000 01000 01000 00000 01000",
  ":": "00000 01000 00000 01000 00000", "=": "00000 11110 00000 11110 00000",
  "%": "10001 00010 00100 01000 10001", "/": "00001 00010 00100 01000 10000",
  "<": "00010 00100 01000 00100 00010", ">": "01000 00100 00010 00100 01000"
};
const GLYPH_UNKNOWN = "11111 10001 10101 10001 11111";

function glyph(ch) { return (FONT[String(ch).toUpperCase()] || GLYPH_UNKNOWN).replace(/ /g, ""); }
function showGlyph(m, ch) { setScreen(m, glyph(ch)); }

// one column of the whole message, as five bits top to bottom
function messageColumns(text) {
  const cols = [];
  const chars = String(text).split("");
  chars.forEach((ch, n) => {
    const g = glyph(ch);
    for (let c = 0; c < 5; c++) {
      let bits = "";
      for (let r = 0; r < 5; r++) bits += g[r * 5 + c];
      cols.push(bits);
    }
    if (n < chars.length - 1) cols.push("00000");   // one blank column between letters
  });
  return cols;
}

async function scrollText(m, text, interval) {
  const cols = messageColumns(text);
  const gap = interval || 150;
  for (let offset = -4; offset <= cols.length; offset++) {
    const out = new Array(25).fill("0");
    for (let c = 0; c < 5; c++) {
      const col = cols[offset + c];
      if (!col) continue;
      for (let r = 0; r < 5; r++) out[r * 5 + c] = col[r];
    }
    setScreen(m, out.join(""));
    await wait(m, gap);
  }
  setScreen(m, "0".repeat(25));
}

// a single character sits still; a longer one scrolls, which is what the board does
async function showText(m, text, interval) {
  const str = String(text);
  if (str.length <= 1) { showGlyph(m, str); await wait(m, (interval || 150) * 4); return; }
  await scrollText(m, str, interval);
}

/* Sound is not simulated: the gym is about what the robot does. Every sound
   block still runs and still takes its time, and the log says what played. */



const ENUMS = {
  /* ---- the micro:bit side ---- */
  IconNames: new Proxy({}, { get: (_, k) => String(k) }),
  ArrowNames: new Proxy({}, { get: (_, k) => String(k) }),
  Direction: { Right: "right", Left: "left" },
  LedSpriteProperty: new Proxy({}, { get: (_, k) => String(k) }),
  DisplayMode2: { BlackAndWhite: 0, Greyscale: 1 },
  Button: { A: "A", B: "B", AB: "AB" },
  Gesture: { Shake: "shake", LogoUp: "logo", LogoDown: "logodown", ScreenUp: "up", ScreenDown: "down",
             TiltLeft: "tiltleft", TiltRight: "tiltright", FreeFall: "freefall" },
  TouchPin: { P0: "P0", P1: "P1", P2: "P2", Logo: "logo" },
  Note: new Proxy({}, { get: (_, k) => String(k) }),
  BeatFraction: new Proxy({}, { get: (_, k) => String(k) }),
  PlaybackMode: { UntilDone: 0, InBackground: 1, LoopingInBackground: 2 },
  soundExpression: new Proxy({}, { get: (_, k) => String(k) }),
  DisplayMode: { BlackAndWhite: 0 },
  Dimension: { X: "x", Y: "y", Z: "z", Strength: "s" },
  Rotation: { Pitch: "pitch", Roll: "roll" },
  DetectedSound: { Loud: "loud", Quiet: "quiet" },

  /* ---- the Bit:Bot side, straight from the 4tronix extension ----
     Values are names rather than numbers, so whatever order 4tronix chose
     cannot bite us. The colours are the real numbers, because convertRGB
     and the colour blocks hand each other plain numbers. */
  BBModel: { Classic: "Classic", XL: "XL", PRO: "PRO", Auto: "Auto" },
  BBMotor: { Left: "L", Right: "R", Both: "B" },
  BBArms: { Both: "B", Left: "L", Right: "R" },
  BBDirection: { Forward: "FWD", Reverse: "REV" },
  BBArcDirection: { ForwardLeft: "FL", ForwardRight: "FR", ReverseLeft: "RL", ReverseRight: "RR" },
  BBRobotDirection: { Left: "L", Right: "R" },
  BBStopMode: { Coast: "coast", Brake: "brake" },
  BBLineSensor: { Left: "L", Right: "R" },
  BBPLineSensor: { Left: "L", Right: "R", Centre: "C" },
  BBLightSensor: { Left: "L", Right: "R" },
  BBPulseSensor: { Left: "L", Right: "R" },
  BBPingUnit: { Centimeters: "cm", Inches: "in", MicroSeconds: "us" },
  BBSensorUnit: { Millimeters: "mm", Centimeters: "cm", Inches: "in", Pulses: "pulses" },
  BBServos: { P1: "P1", P2: "P2" },
  BBMode: { Manual: "manual", Auto: "auto" },
  BBBuzz: { On: true, Off: false },
  BBBuzzVolume: { Off: "off", Quiet: "quiet", Medium: "medium", Loud: "loud" },
  BBBluetooth: { btEnable: true, btDisable: false },
  LIMode: { Off: "off", On: "on", Auto: "auto" },
  BBColors: { Red: 0xff0000, Orange: 0xffa500, Yellow: 0xffff00, Green: 0x00ff00, Blue: 0x0000ff,
              Indigo: 0x4b0082, Violet: 0x8a2be2, Purple: 0xff00ff, White: 0xffffff, Black: 0x000000 },
  BBirKeys: new Proxy({}, { get: (_, k) => String(k) }),
  BBirNoAny: new Proxy({}, { get: (_, k) => String(k) }),
  eyePos: new Proxy({}, { get: (_, k) => String(k) }),
  eyeSize: new Proxy({}, { get: (_, k) => String(k) }),
  bfEyes: new Proxy({}, { get: (_, k) => String(k) }),
  bfMouth: new Proxy({}, { get: (_, k) => String(k) })
};

/* said once per run, so a note does not drown the log */
function once(m, key, msg, cls) {
  if (!m.noted.has(key)) { m.noted.add(key); say(msg, cls || "say", m); }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function cssOf(rgb) {
  if (typeof rgb === "string") return rgb;
  const n = clamp(Math.round(rgb || 0), 0, 0xffffff);
  return "#" + n.toString(16).padStart(6, "0");
}
function proOnly(m, b, name) {
  if (b && b.model === "PRO") return false;
  once(m, "pro:" + name, "note: " + name + " only does anything on a Bit:Bot PRO - your " +
       (b ? b.model : "XL") + " ignores it");
  return true;
}

/* ---- the radio: one shared air, and a board never hears itself ---- */
function radioSend(from, kind, value, name) {
  for (const m2 of world.mbits) {
    if (m2 === from || m2.radioGroup !== from.radioGroup) continue;
    const h = kind === "number" ? m2.handlers.radioNumber
            : kind === "string" ? m2.handlers.radioString : m2.handlers.radioValue;
    m2.lastFrom = from;
    if (!h) continue;
    Promise.resolve(h(value, name)).catch(e => { if (!(e instanceof Stopped)) say(e.message, "err", m2); });
  }
}
// how strong the signal was, which is really just how far away the sender is
function signalStrength(m) {
  const from = m.lastFrom;
  if (!from) return -128;
  const a = placeOf(m), b = placeOf(from);
  const d = Math.hypot(a.x - b.x, a.y - b.y) / 1000;
  return Math.round(clamp(-42 - 26 * Math.log10(d + 0.12), -95, -30));
}

function makeApi(m) {
  let b = botOf(m);
  const sayd = (t, c) => say(t, c, m);

  const basic = {
    showIcon: (name) => { setScreen(m, ICONS[name] || UNKNOWN); sayd("show icon " + name); },
    showArrow: (name) => { setScreen(m, ARROWS[name] || UNKNOWN); sayd("show arrow " + name); },
    showLeds: (s) => { screenFromLeds(m, s); sayd("show leds"); },
    showNumber: async (n, interval) => {
      const str = String(Math.round(n * 1000) / 1000);
      sayd("show number " + str + (str.length > 1 ? "  (it has to scroll)" : ""));
      await showText(m, str, interval);
    },
    showString: async (t, interval) => {
      const str = String(t);
      sayd("show \"" + str + "\"" + (str.length > 1 ? "  (it has to scroll)" : ""));
      await showText(m, str, interval);
    },
    clearScreen: () => setScreen(m, "0".repeat(25)),
    pause: async (ms) => { await wait(m, ms); },
    forever: (cb) => m.foreverQueue.push(cb)
  };
  const input = {
    lightLevel: () => readScreenLight(m),
    soundLevel: () => readSoundLevel(m),
    temperature: () => readTemperature(m),
    buttonIsPressed: (btn) => btn === "AB" ? (m.held.A && m.held.B) : !!m.held[btn],
    onButtonPressed: (btn, cb) => { m.handlers[btn] = cb; },
    onGesture: (g, cb) => { m.handlers[g] = cb; },
    isGesture: () => false,
    onLogoEvent: (e, cb) => { m.handlers.logo = cb; },
    onPinPressed: (pin, cb) => { m.handlers["pin" + pin] = cb; },
    onPinReleased: () => {},
    onPinTouchEvent: (pin, e, cb) => { m.handlers["pin" + pin] = cb; },
    logoIsPressed: () => m.held.logo,
    pinIsPressed: (pin) => pin === "logo" ? m.held.logo : false,
    onSound: (which, cb) => { m.handlers["sound" + which] = cb; },
    setSoundThreshold: () => {},
    acceleration: (dim) => accelMg(m, dim),
    rotation: (which) => rotationDeg(m, which),
    compassHeading: () => compassHeadingDeg(m),
    magneticForce: (dim) => magneticForce(m, dim),
    calibrateCompass: () => sayd("compass calibrated"),
    isCalibrated: () => true,
    runningTime: () => Math.round(simTime)
  };
  const led = {
    plot: (x, y) => { m.screen[y * 5 + x] = 1; },
    unplot: (x, y) => { m.screen[y * 5 + x] = 0; },
    toggle: (x, y) => { m.screen[y * 5 + x] ^= 1; },
    point: (x, y) => !!m.screen[y * 5 + x],
    plotBrightness: (x, y, b) => { m.screen[y * 5 + x] = b > 0 ? 1 : 0; },
    pointBrightness: (x, y) => (m.screen[y * 5 + x] ? m.bright : 0),
    brightness: () => m.bright,
    setBrightness: (b) => { m.bright = clamp(Math.round(b), 0, 255); sayd("screen brightness " + m.bright); },
    setDisplayMode: () => {},
    enable: (on) => { if (!on) setScreen(m, "0".repeat(25)); },
    stopAnimation: () => { m.token++; },
    fadeIn: () => {}, fadeOut: () => {}, screenshot: () => null,
    plotBarGraph: (value, high) => {
      const h = high || 1;
      const rows = Math.max(0, Math.min(5, Math.round(value / h * 5)));
      const out = new Array(25).fill("0");
      for (let r = 0; r < rows; r++) for (let c = 0; c < 5; c++) out[(4 - r) * 5 + c] = "1";
      setScreen(m, out.join("")); sayd("bar graph " + value + " of " + h);
    }
  };
  const music = {
    play: async (what, mode) => {
      sayd("sound: " + what); m.beeping = simTime + 500;      // loud enough for its own microphone
      await wait(m, mode === 1 ? 0 : 500);
    },
    playTone: async (f, ms) => {
      sayd("tone " + Math.round(f) + " Hz"); m.beeping = simTime + ms;
      await wait(m, ms);
    },
    ringTone: (f) => { sayd("tone " + Math.round(f) + " Hz"); m.beeping = simTime + 1000; },
    rest: async (ms) => { await wait(m, ms); },
    builtinPlayableSoundEffect: (s) => String(s),
    builtInPlayableMelody: (s) => String(s),
    createSoundExpression: (s) => String(s),
    tonePlayable: (n, b) => String(n),
    beat: (b) => 250,
    tempo: () => m.tempo || 120,
    setTempo: (t) => { m.tempo = t; sayd("tempo " + t); },
    changeTempoBy: (d) => { m.tempo = (m.tempo || 120) + d; sayd("tempo " + m.tempo); },
    startMelody: (tune) => { m.beeping = simTime + 2000; sayd("melody: " + tune); },
    playMelody: async (tune, mode) => {
      m.beeping = simTime + 2000; sayd("melody: " + tune);
      await wait(m, mode === 1 ? 0 : 2000);
    },
    stopMelody: () => { m.beeping = 0; sayd("melody stopped"); },
    stopAllSounds: () => { m.beeping = 0; sayd("quiet"); },
    isSoundPlaying: () => simTime < m.beeping,
    onEvent: (e, cb) => { m.handlers["music" + e] = cb; },
    setBuiltInSpeakerEnabled: () => {},
    volume: () => m.volume === undefined ? 127 : m.volume,
    setVolume: (v) => { m.volume = v; }
  };
  const radio = {
    setGroup: (g) => { m.radioGroup = g; sayd("radio group " + g); },
    sendNumber: (n) => { sayd("radio sent " + n); radioSend(m, "number", n); },
    sendString: (t) => { sayd("radio sent \"" + t + "\""); radioSend(m, "string", String(t)); },
    sendValue: (k, v) => { sayd("radio sent " + k + "=" + v); radioSend(m, "value", v, String(k)); },
    onReceivedNumber: (cb) => { m.handlers.radioNumber = cb; },
    onReceivedString: (cb) => { m.handlers.radioString = cb; },
    onReceivedValue: (cb) => { m.handlers.radioValue = cb; },
    receivedPacket: () => signalStrength(m),
    setTransmitPower: () => { },
    setTransmitSerialNumber: () => { }
  };
  /* ====================================================================
     Every block in the 4tronix Bit:Bot extension (v2.1.9), behaving the
     way the real one does - including refusing to work when the block
     belongs to a model you have not got, or when nothing is plugged in.
     ==================================================================== */
  const sign = d => (d === "REV" ? -1 : 1);
  const armRange = arm => arm === "L" ? [0, 6] : arm === "R" ? [6, 12] : [0, 12];
  const stopWheel = w => { if (w === "L") b.lm = 0; else if (w === "R") b.rm = 0; else { b.lm = 0; b.rm = 0; } };
  const setWheels = (l, r) => { b.lm = l; b.rm = r; };
  /* "go 20 cm", "spin 90 degrees" and "arc 90 degrees" are the three blocks the
     PRO does not do with its motors directly: it hands the job to the controller
     on the motor board, which counts the wheels round and runs its own loop until
     the job is done. So the gym counts the wheels too, and eases off near the end
     the way that controller does - otherwise the robot sails past its target. */
  const runCounting = async (want, measure) => {
    const l0 = b.enc.l, r0 = b.enc.r;
    let lastSeen = 0, stuckFor = 0, eased = false;
    for (;;) {
      const gone = measure(b.enc.l - l0, b.enc.r - r0);
      const left = want - gone;
      if (left <= 0) return;
      if (left < want * 0.25 && left < 60 && !eased) {      // the last stretch, taken slowly
        eased = true;
        const f = 22 / Math.max(Math.abs(b.lm), Math.abs(b.rm), 1);
        if (f < 1) { b.lm *= f; b.rm *= f; }
      }
      stuckFor = gone - lastSeen < 0.05 ? stuckFor + 5 : 0;
      lastSeen = gone;
      if (stuckFor > 2000) { sayd("the wheels are not turning - something is in the way"); return; }
      await wait(m, 5);
    }
  };
  // how far it has gone: the two wheels averaged
  const runWheels = (mm) => runCounting(Math.abs(mm), (dl, dr) => (Math.abs(dl) + Math.abs(dr)) / 2);
  // how far it has TURNED: the difference between the wheels, which is all a
  // robot with two wheels ever knows about its own heading
  const runTurn = (deg) => runCounting(Math.abs(deg) * Math.PI / 180 * BOT.axle,
                                       (dl, dr) => Math.abs(dl - dr));
  const addon = (group, name) =>
    once(m, "addon:" + group, "note: " + name + " needs the " + group + " add-on, which the gym has not got");

  const bitbot = {

    /* ---- the bolt-on boards 4tronix sells for the Bit:Bot ----------------
       The class has none of these, so rather than pretend, each one says
       plainly what it would have needed. The program carries on. */
    oledSet: () => once(m, "oled", "there is no OLED screen on this Bit:Bot, so the screen blocks do nothing", "say"),
    oledLine: () => once(m, "oled", "there is no OLED screen on this Bit:Bot, so the screen blocks do nothing", "say"),
    oledCircle: () => once(m, "oled", "there is no OLED screen on this Bit:Bot, so the screen blocks do nothing", "say"),
    oledNumber: () => once(m, "oled", "there is no OLED screen on this Bit:Bot, so the screen blocks do nothing", "say"),
    oledZOOM: () => once(m, "oled", "there is no OLED screen on this Bit:Bot, so the screen blocks do nothing", "say"),
    setMatrix: () => once(m, "matrix", "there is no 8x8 matrix on this Bit:Bot, so the matrix blocks do nothing", "say"),
    matShowImage: () => once(m, "matrix", "there is no 8x8 matrix on this Bit:Bot, so the matrix blocks do nothing", "say"),
    matRectangle: () => once(m, "matrix", "there is no 8x8 matrix on this Bit:Bot, so the matrix blocks do nothing", "say"),
    matBrightness: () => once(m, "matrix", "there is no 8x8 matrix on this Bit:Bot, so the matrix blocks do nothing", "say"),
    setArrayPixel: () => once(m, "matrix", "there is no 8x8 matrix on this Bit:Bot, so the matrix blocks do nothing", "say"),
    setBitEye: () => once(m, "face", "there is no BitFace on this Bit:Bot, so the eye and mouth blocks do nothing", "say"),
    setBitMouth: () => once(m, "face", "there is no BitFace on this Bit:Bot, so the eye and mouth blocks do nothing", "say"),
    saveCalibration: () => sayd("wheel calibration saved"),

    /* ---------------- which robot ---------------- */
    select_model: (mod) => { b.model = (mod === "Auto" ? "XL" : mod); sayd("Bit:Bot model: " + b.model); },
    getModel: () => b.model,
    BBModels: (mod) => mod,
    getVersionCode: () => b.model === "PRO" ? 16 : b.model === "XL" ? 9 : 0,
    getFirmwareCode: () => proOnly(m, b, "getFirmwareCode") ? 0 : 11,
    bbEnableBluetooth: () => { },

    /* ---------------- driving, the 0 to 100 blocks ---------------- */
    go: (dir, speed) => {
      b.brake = false;
      const s = sign(dir) * clamp(speed, -100, 100);
      setWheels(s, s);
      sayd((sign(dir) < 0 ? "reverse" : "forward") + " at " + speed + "%" +
          (wheelSpeed(b, speed) === 0 ? "  (too slow to move)" : ""));
    },
    goms: async (dir, speed, ms) => { bitbot.go(dir, speed); await wait(m, ms); bitbot.stop("brake"); },
    rotate: (dir, speed) => {
      b.brake = false;
      const s = clamp(speed, 0, 100);
      setWheels(dir === "R" ? s : -s, dir === "R" ? -s : s);
      sayd("turn " + (dir === "R" ? "right" : "left") + " at " + speed + "%" +
          (wheelSpeed(b, s) === 0 ? "  (too slow to move)" : ""));
    },
    rotatems: async (dir, speed, ms) => { bitbot.rotate(dir, speed); await wait(m, ms); bitbot.stop("brake"); },
    stop: (mode) => {
      stopWheel("B");
      b.brake = (mode !== "coast");
      if (mode === "coast") once(m, "coast", "note: coasting - the robot rolls on until friction stops it");
    },
    move: (motor, dir, speed) => {
      b.brake = false;
      const s = sign(dir) * clamp(speed, -100, 100);
      if (motor === "L") b.lm = s; else if (motor === "R") b.rm = s; else setWheels(s, s);
      sayd((motor === "L" ? "left motor " : motor === "R" ? "right motor " : "both motors ") +
          (sign(dir) < 0 ? "reverse" : "forward") + " at " + speed + "%" +
          (wheelSpeed(b, speed) === 0 ? "  (too slow to move)" : ""));
    },
    movems: async (motor, dir, speed, ms) => { bitbot.move(motor, dir, speed); await wait(m, ms); stopWheel(motor); },
    BBBias: (dir, bias) => {
      b.bias = { dir: dir, amount: clamp(bias, 0, 80) };
      sayd("bias " + clamp(bias, 0, 80) + "% to the " + (dir === "R" ? "right" : "left"));
    },

    /* ---------------- driving, the old 0 to 1023 blocks ---------------- */
    motor: (which, speed) => {
      const pct = clamp(speed, -1023, 1023) / 1023 * 100;
      if (which === "L") b.lm = pct; else if (which === "R") b.rm = pct; else setWheels(pct, pct);
      once(m, "scale1023", "note: motor, drive and driveTurn run on 0 to 1023, not 0 to 100");
      sayd("motor " + (which === "L" ? "left" : which === "R" ? "right" : "both") +
          " at " + speed + " of 1023");
    },
    drive: (speed) => bitbot.motor("B", speed),
    driveMilliseconds: async (speed, ms) => { bitbot.motor("B", speed); await wait(m, ms); stopWheel("B"); },
    driveTurn: (dir, speed) => {
      const s = Math.max(0, speed);
      bitbot.motor("L", dir === "L" ? -s : s);
      bitbot.motor("R", dir === "L" ? s : -s);
    },
    driveTurnMilliseconds: async (dir, speed, ms) => { bitbot.driveTurn(dir, speed); await wait(m, ms); stopWheel("B"); },

    /* ---------------- driving by distance and angle: PRO only ---------------- */
    gocm: async (dir, speed, distance) => {
      if (proOnly(m, b, "gocm")) return;
      bitbot.go(dir, speed);
      if (wheelSpeed(b, clamp(speed, 0, 100)) > 0) await runWheels(Math.abs(distance) * 10);
      bitbot.stop("brake");
    },
    spinDeg: async (dir, speed, angle) => {
      if (proOnly(m, b, "spinDeg")) return;
      bitbot.rotate(dir, speed);
      if (wheelSpeed(b, clamp(speed, 0, 100)) > 0) await runTurn(angle);
      bitbot.stop("brake");
    },
    arc: (dir, speed, radius) => {
      if (proOnly(m, b, "arc")) return;
      const R = Math.max(radius, 7) * 10;                      // the extension floors the radius at 7 cm
      const back = (dir === "RL" || dir === "RR") ? -1 : 1;
      const inner = speed * (R - BOT.axle / 2) / (R + BOT.axle / 2);
      const left = (dir === "FL" || dir === "RL") ? inner : speed;
      const right = (dir === "FL" || dir === "RL") ? speed : inner;
      setWheels(back * left, back * right);
      sayd("arc " + dir + " at " + speed + "%, radius " + Math.max(radius, 7) + " cm");
    },
    arcdeg: async (dir, speed, radius, angle) => {
      if (proOnly(m, b, "arcdeg")) return;
      bitbot.arc(dir, speed, radius);
      if (wheelSpeed(b, speed) > 0) await runTurn(angle);
      bitbot.stop("brake");
    },
    steer: (direction, speed) => {
      if (proOnly(m, b, "steer")) return;
      const d = clamp(direction, -100, 100), sp = clamp(speed, 0, 100);
      setWheels(d > 0 ? sp : (100 + d) * sp / 100, d < 0 ? sp : (100 - d) * sp / 100);
      sayd("steer " + d + " at " + sp + "%");
    },

    /* ---------------- wheel encoders: PRO only ---------------- */
    enablePID: (on) => { if (!proOnly(m, b, "enablePID")) sayd("PID " + (on ? "on" : "off")); },
    wheelSensor: (sensor, unit) => {
      if (proOnly(m, b, "wheelSensor")) return 0;
      const mm = Math.abs(sensor === "L" ? b.enc.l : b.enc.r);
      if (unit === "mm") return Math.round(mm);
      if (unit === "cm") return Math.round(mm / 10);
      if (unit === "in") return Math.round(mm / 25.4);
      return Math.round(mm * 10.36);
    },
    turnAngle: () => proOnly(m, b, "turnAngle") ? 0
      : Math.round((b.enc.l - b.enc.r) / BOT.axle * 180 / Math.PI),
    resetWheelSensors: (which) => {
      if (which === "L") b.enc.l = 0; else if (which === "R") b.enc.r = 0; else { b.enc.l = 0; b.enc.r = 0; }
    },
    lastEncoderError: () => proOnly(m, b, "lastEncoderError") ? 0 : 0,
    motorTrim: () => proOnly(m, b, "motorTrim"),
    pidConstants: () => proOnly(m, b, "pidConstants"),
    carryForwardErrors: () => proOnly(m, b, "carryForwardErrors"),
    clearPidErrors: () => proOnly(m, b, "clearPidErrors"),
    stopThreshold: () => proOnly(m, b, "stopThreshold"),
    setStartPWM: () => proOnly(m, b, "setStartPWM"),

    /* ---------------- the line sensors ---------------- */
    readLine: (sensor) => readLineSensor(b, sensor),
    readLineDigital: (sensor) => {
      // the real extension returns false on anything that is not a PRO
      if (b.model !== "PRO") {
        once(m, "rld", "note: read line digital always says false unless you have a PRO - use \"read line sensor\" on an XL", "err");
        return false;
      }
      return readLineSensor(b, sensor) === 1;
    },
    readLineAnalog: (sensor) => {
      if (proOnly(m, b, "readLineAnalog")) return 0;
      return readLineSensor(b, sensor) ? 120 + Math.round(Math.random() * 60) : 820 + Math.round(Math.random() * 60);
    },
    mergeLinePosition: () => {
      if (proOnly(m, b, "mergeLinePosition")) return 0;
      const l = readLineSensor(b, "L"), r = readLineSensor(b, "R"), c = readLineSensor(b, "C");
      if (!l && !r && !c) return 0;
      return Math.round(((r * 100 + c * 50) - (l * 100 + c * 50)) / Math.max(1, l + r + c));
    },
    setThreshold: () => proOnly(m, b, "setThreshold"),
    calibrateLine: () => proOnly(m, b, "calibrateLine"),

    /* ---------------- the other sensors ---------------- */
    readLight: (sensor) => readLightSensor(b, sensor),
    sonar: (unit) => {
      const cm = readSonar(b);
      if (cm === 0) once(m, "sonar0", "note: nothing within 2 m, so sonar gives 0 - watch out for \"if sonar < 15\"");
      if (unit === "in") return Math.round(cm / 2.54);
      if (unit === "us") return Math.round(cm * 59);
      return cm;
    },
    batteryVoltage: () => proOnly(m, b, "batteryVoltage") ? 0 : Math.round((4.85 + Math.random() * 0.2) * 100) / 100,

    /* ---------------- the lights along each arm ---------------- */
    setLedColor: (rgb) => { b.pixels.fill(cssOf(rgb)); sayd("lights " + nameOfColour(rgb)); },
    setPixelColor: (id, rgb) => { b.pixels[((id % 12) + 12) % 12] = cssOf(rgb); },
    ledClear: () => b.pixels.fill(null),
    ledBrightness: (level) => { b.pixelBright = clamp(level, 0, 255); },
    ledRainbow: (dir, arm) => {
      const [a, b] = armRange(arm);
      for (let i = a; i < b; i++) b.pixels[i] = "hsl(" + Math.round((i - a) * 300 / (b - a - 1 || 1)) + ",95%,55%)";
      sayd("rainbow");
    },
    ledShift: (dir, arm) => {
      const [a, b] = armRange(arm), slice = b.pixels.slice(a, b);
      if (dir) { slice.pop(); slice.unshift(null); } else { slice.shift(); slice.push(null); }
      for (let i = a; i < b; i++) b.pixels[i] = slice[i - a];
    },
    ledRotate: (dir, arm) => {
      const [a, b] = armRange(arm), slice = b.pixels.slice(a, b);
      if (dir) slice.unshift(slice.pop()); else slice.push(slice.shift());
      for (let i = a; i < b; i++) b.pixels[i] = slice[i - a];
    },
    setUpdateMode: () => { },
    ledShow: () => { },
    BBColours: (c) => c,
    convertRGB: (r, g, b) => (clamp(r, 0, 255) << 16) + (clamp(g, 0, 255) << 8) + clamp(b, 0, 255),

    /* ---------------- the buzzer ---------------- */
    buzz: (flag) => sayd("buzzer " + (flag ? "on" : "off")),
    buzzTime: async (ms) => { sayd("buzz for " + ms + " ms"); await wait(m, ms); },
    setVolume: (v) => { if (!proOnly(m, b, "setVolume")) sayd("buzzer volume " + v); },

    /* ---------------- things the gym has not got bolted on ---------------- */
    setTalon: () => addon("servo", "the talon"),
    bbSetServo: () => addon("servo", "set servo"),
    bb360Servo: () => addon("servo", "the 360 servo"),
    bbServoDeadband: () => addon("servo", "servo deadband"),
    bbServoTrim: () => addon("servo", "servo trim"),
    bbStopServos: () => addon("servo", "stop servos"),

    onIREvent: () => { if (!proOnly(m, b, "onIREvent")) addon("infra-red", "the IR remote"); },
    irKey: () => { proOnly(m, b, "irKey"); return false; },
    lastIRCode: () => { proOnly(m, b, "lastIRCode"); return 0; },
    irKeyCode: () => 0,
    onIREventAddon: () => addon("infra-red", "the IR remote"),
    irKeyAddon: () => { addon("infra-red", "the IR remote"); return false; },
    lastIRCodeAddon: () => { addon("infra-red", "the IR remote"); return 0; },
    irKeyCodeAddon: () => 0,

    matClear: () => addon("matrix", "the 5x5 matrix"), setMatrix: () => addon("matrix", "the 5x5 matrix"),
    setPixel: () => addon("matrix", "the 5x5 matrix"), setArrayPixel: () => addon("matrix", "the 5x5 matrix"),
    matRainbow: () => addon("matrix", "the 5x5 matrix"), matRectangle: () => addon("matrix", "the 5x5 matrix"),
    matShowEyeball: () => addon("matrix", "the 5x5 matrix"), matShowImage: () => addon("matrix", "the 5x5 matrix"),
    matShow: () => addon("matrix", "the 5x5 matrix"), matBrightness: () => addon("matrix", "the 5x5 matrix"),

    setBitface: () => addon("bitface", "the BitFace"), setBitEye: () => addon("bitface", "the BitFace"),
    setBitNose: () => addon("bitface", "the BitFace"), setBitMouth: () => addon("bitface", "the BitFace"),
    bitBrightness: () => addon("bitface", "the BitFace"),

    oledText: () => addon("OLED", "the screen"), oledNumber: () => addon("OLED", "the screen"),
    oledUpdate: () => addon("OLED", "the screen"), oledSet: () => addon("OLED", "the screen"),
    oledInvert: () => addon("OLED", "the screen"), oledZOOM: () => addon("OLED", "the screen"),
    oledPlotPixel: () => addon("OLED", "the screen"), oledLine: () => addon("OLED", "the screen"),
    oledRectangle: () => addon("OLED", "the screen"),

    /* ---------------- the memory on the board ---------------- */
    writeEEROM: () => once(m, "eerom", "note: the gym has no EEROM to remember things in"),
    wrEEROM: () => once(m, "eerom", "note: the gym has no EEROM to remember things in"),
    readEEROM: () => { once(m, "eerom", "note: the gym has no EEROM to remember things in"); return 0; },
    rdEEROM: () => { once(m, "eerom", "note: the gym has no EEROM to remember things in"); return 0; },
    loadCalibration: () => { }, saveCalibration: () => { },
    checkCalibration: () => 0
  };
  // "every N ms do" - the queue runs each job again and again, so one wait does it
  const loops = {
    everyInterval: (ms, cb) => m.foreverQueue.push(async () => { await wait(m, Math.max(0, ms - 20)); await cb(); })
  };
  const game = {
    score: () => m.score || 0,
    setScore: (n) => { m.score = n; sayd("score is " + n); },
    addScore: (n) => { m.score = (m.score || 0) + n; sayd("score " + m.score); },
    removeLife: (n) => { m.lives = (m.lives === undefined ? 3 : m.lives) - (n || 1); sayd("lives " + m.lives); },
    setLife: (n) => { m.lives = n; },
    life: () => (m.lives === undefined ? 3 : m.lives),
    isGameOver: () => !!m.over,
    gameOver: async () => { m.over = true; sayd("GAME OVER, score " + (m.score || 0)); await showText(m, "GAME OVER " + (m.score || 0)); },
    startCountdown: (ms) => sayd("countdown " + Math.round(ms / 1000) + " s"),
    currentTime: () => Math.round(simTime)
  };
  const mkImage = (text) => {
    const bits = String(text).replace(/[^#.]/g, "").replace(/#/g, "1").replace(/\./g, "0");
    return {
      showImage: (offset) => { setScreen(m, bits.slice(offset || 0).padEnd(25, "0").slice(0, 25)); sayd("show image"); },
      scrollImage: async (step, interval) => { setScreen(m, bits.padEnd(25, "0").slice(0, 25)); await wait(m, interval || 200); },
      plotFrame: (n) => { setScreen(m, bits.slice(n * 25).padEnd(25, "0").slice(0, 25)); },
      width: () => bits.length / 5, pixel: (x, y) => bits[y * 5 + x] === "1"
    };
  };
  const images = { createImage: mkImage, createBigImage: mkImage };
  const serial = {
    writeLine: (t) => sayd("serial: " + t),
    writeString: (t) => sayd("serial: " + t),
    writeNumber: (n) => sayd("serial: " + n),
    writeValue: (k, v) => sayd("serial: " + k + " = " + v),
    redirectToUSB: () => {}, setBaudRate: () => {}, onDataReceived: () => {}, readLine: () => ""
  };
  const control = { waitMicros: async (us) => { await wait(m, us / 1000); }, inBackground: (cb) => m.foreverQueue.push(cb) };
  const pins = {
    analogReadPin: () => 0, digitalReadPin: () => 0,
    analogWritePin: () => {}, digitalWritePin: () => {},
    analogSetPeriod: () => {}, servoWritePin: () => {}, servoSetPulse: () => {},
    setPull: () => {}, onPulsed: () => {}, pulseIn: () => 0, map: (v, a, b, c, d) => (v - a) * (d - c) / (b - a) + c
  };
  const randint = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

  // anything the gym has not been taught yet reports itself instead of crashing
  const forgiving = (name, obj, needsBot) => new Proxy(obj, {
    get(t, k) {
      if (typeof k !== "string") return t[k];
      const f = k in t ? t[k] : null;
      return function () {
        if (needsBot) {
          b = botOf(m);                         // it may have been plugged in since the last block
          if (!b) {
            once(m, "nobot", m.name + " is not plugged into a Bit:Bot, so " + name + "." + k + " does nothing", "err");
            return 0;
          }
        }
        if (!f) { sayd("note: " + name + "." + k + " is not simulated yet", "say"); return 0; }
        return f.apply(t, arguments);
      };
    }
  });
  return {
    basic: forgiving("basic", basic), input: forgiving("input", input),
    led: forgiving("led", led), music: forgiving("music", music),
    radio: forgiving("radio", radio), bitbot: forgiving("bitbot", bitbot, true),
    control: forgiving("control", control), pins: forgiving("pins", pins),
    loops: forgiving("loops", loops), game: forgiving("game", game),
    images: images, serial: forgiving("serial", serial), randint
  };
}
function nameOfColour(c) {
  for (const k in ENUMS.BBColors) if (ENUMS.BBColors[k] === c) return k.toLowerCase();
  return typeof c === "number" ? "#" + c.toString(16).padStart(6, "0") : "on";
}

