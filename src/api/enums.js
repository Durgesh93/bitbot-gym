/* The enums a MakeCode program uses by name.

   Most are strings rather than the numbers the real firmware uses, because
   whatever order 4tronix happened to choose for `BBMotor` is not something
   the gym should depend on. The colours are the real numbers, because
   `convertRGB` and the colour blocks hand each other plain numbers and a
   child can type one in.

   An `anyName` enum answers with whatever key is asked of it, which is right
   for the ones that are only ever a label - icon names, note names. */

const anyName = () => new Proxy({}, { get: (_, k) => String(k) });

export const ENUMS = {
  /* ---- the micro:bit ---- */
  IconNames: anyName(),
  ArrowNames: anyName(),
  Direction: { Right: "right", Left: "left" },
  LedSpriteProperty: anyName(),
  DisplayMode: { BlackAndWhite: 0 },
  DisplayMode2: { BlackAndWhite: 0, Greyscale: 1 },
  Button: { A: "A", B: "B", AB: "AB" },
  Gesture: {
    Shake: "shake", LogoUp: "logo", LogoDown: "logodown", ScreenUp: "up",
    ScreenDown: "down", TiltLeft: "tiltleft", TiltRight: "tiltright", FreeFall: "freefall"
  },
  TouchPin: { P0: "P0", P1: "P1", P2: "P2", Logo: "logo" },
  Note: anyName(),
  BeatFraction: anyName(),
  PlaybackMode: { UntilDone: 0, InBackground: 1, LoopingInBackground: 2 },
  soundExpression: anyName(),
  Dimension: { X: "x", Y: "y", Z: "z", Strength: "s" },
  Rotation: { Pitch: "pitch", Roll: "roll" },
  DetectedSound: { Loud: "loud", Quiet: "quiet" },

  /* ---- the Bit:Bot, straight from the 4tronix extension v2.1.9 ---- */
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
  BBColors: {
    Red: 0xff0000, Orange: 0xffa500, Yellow: 0xffff00, Green: 0x00ff00,
    Blue: 0x0000ff, Indigo: 0x4b0082, Violet: 0x8a2be2, Purple: 0xff00ff,
    White: 0xffffff, Black: 0x000000
  },
  BBirKeys: anyName(),
  BBirNoAny: anyName(),
  eyePos: anyName(),
  eyeSize: anyName(),
  bfEyes: anyName(),
  bfMouth: anyName()
};

export const colourName = c => {
  for (const k in ENUMS.BBColors) if (ENUMS.BBColors[k] === c) return k.toLowerCase();
  return typeof c === "number" ? "#" + c.toString(16).padStart(6, "0") : "on";
};
