/* The micro:bit's own blocks: basic, input, led, music, radio and the rest.

   Every one of these is a function a child's program calls. None of them
   knows the world exists - they go through `ctx`, which the runner builds:
   the board to write to, the latest sensor readings to answer from, a clock
   to wait on, somewhere to say things. That is why this file runs in node
   with no browser and no canvas anywhere. */

import { clamp } from "../core/util.js";
import { columnsOf, frameAt, glyph } from "../hardware/screen.js";

export function createMicrobitApi(ctx) {
  const { board, reads, wait, now, say, sayOnce, radio: wire, random } = ctx;
  const screen = board.screen;

  /* One character stands still; anything longer scrolls, exactly as the
     board does. Every step waits, so a program that shows a word really
     does take as long as the real one. */
  async function showText(text, interval) {
    const str = String(text);
    const gap = interval == null ? 150 : interval;
    if (str.length <= 1) { screen.glyph(str); await wait(gap * 4); return; }
    const cols = columnsOf(str);
    for (let k = -4; k <= cols.length; k++) {
      screen.pattern(frameAt(cols, k));
      await wait(gap);
    }
    screen.clear();
  }

  const basic = {
    showIcon: (name) => { screen.icon(name); say("show icon " + name); },
    showArrow: (name) => { screen.icon("Arrow" + name); say("show arrow " + name); },
    showLeds: (s) => { screen.leds(s); say("show leds"); },
    showNumber: async (n, interval) => {
      const str = String(Math.round(n * 1000) / 1000);
      say("show number " + str + (str.length > 1 ? "  (it has to scroll)" : ""));
      await showText(str, interval);
    },
    showString: async (t, interval) => {
      const str = String(t);
      say("show \"" + str + "\"" + (str.length > 1 ? "  (it has to scroll)" : ""));
      await showText(str, interval);
    },
    clearScreen: () => screen.clear(),
    pause: async (ms) => { await wait(ms); },
    forever: (cb) => ctx.forever(cb)
  };

  const input = {
    lightLevel: () => reads().light,
    soundLevel: () => reads().sound,
    temperature: () => ctx.temperature(),
    buttonIsPressed: (btn) => btn === "AB"
      ? (board.pressed("A") && board.pressed("B")) : board.pressed(btn),
    onButtonPressed: (btn, cb) => ctx.on(btn, cb),
    onGesture: (g, cb) => ctx.on(g, cb),
    isGesture: () => false,
    onLogoEvent: (e, cb) => ctx.on("logo", cb),
    onPinPressed: (pin, cb) => ctx.on("pin" + pin, cb),
    onPinReleased: () => {},
    onPinTouchEvent: (pin, e, cb) => ctx.on("pin" + pin, cb),
    logoIsPressed: () => board.pressed("logo"),
    pinIsPressed: (pin) => (pin === "logo" ? board.pressed("logo") : false),
    onSound: (which, cb) => ctx.on("sound" + which, cb),
    setSoundThreshold: () => {},
    acceleration: (dim) => ctx.acceleration(dim),
    rotation: (which) => ctx.rotation(which),
    compassHeading: () => reads().compass,
    magneticForce: () => reads().magnet,
    calibrateCompass: () => say("compass calibrated"),
    isCalibrated: () => true,
    runningTime: () => Math.round(now())
  };

  const led = {
    plot: (x, y) => screen.plot(x, y),
    unplot: (x, y) => screen.unplot(x, y),
    toggle: (x, y) => screen.toggle(x, y),
    point: (x, y) => screen.point(x, y),
    plotBrightness: (x, y, b) => screen.plot(x, y, clamp(Math.round(b), 0, 255)),
    pointBrightness: (x, y) => screen.brightnessAt(x, y),
    brightness: () => ctx.brightness(),
    setBrightness: (b) => { ctx.brightness(clamp(Math.round(b), 0, 255)); say("screen brightness " + ctx.brightness()); },
    setDisplayMode: () => {},
    enable: (on) => { if (!on) screen.clear(); },
    stopAnimation: () => ctx.cancel(),
    fadeIn: () => {}, fadeOut: () => {}, screenshot: () => null,
    plotBarGraph: (value, high) => { screen.bar(value, high); say("bar graph " + value + " of " + (high || 1)); }
  };

  /* Sound is not synthesised - the gym is about what the robot does - but
     every sound block still runs, still takes its time, and still makes the
     board audible to its own microphone and to its neighbours. A lesson
     about one robot hearing another needs exactly that and nothing more. */
  const music = {
    play: async (what, mode) => {
      say("sound: " + what); ctx.beep(500);
      await wait(mode === 1 ? 0 : 500);
    },
    playTone: async (f, ms) => { say("tone " + Math.round(f) + " Hz"); ctx.beep(ms); await wait(ms); },
    ringTone: (f) => { say("tone " + Math.round(f) + " Hz"); ctx.beep(1000); },
    rest: async (ms) => { await wait(ms); },
    builtinPlayableSoundEffect: s => String(s),
    builtInPlayableMelody: s => String(s),
    createSoundExpression: s => String(s),
    tonePlayable: n => String(n),
    beat: () => 250,
    tempo: () => ctx.tempo(),
    setTempo: (t) => { ctx.tempo(t); say("tempo " + t); },
    changeTempoBy: (d) => { ctx.tempo(ctx.tempo() + d); say("tempo " + ctx.tempo()); },
    startMelody: (tune) => { ctx.beep(2000); say("melody: " + tune); },
    playMelody: async (tune, mode) => {
      ctx.beep(2000); say("melody: " + tune);
      await wait(mode === 1 ? 0 : 2000);
    },
    stopMelody: () => { ctx.beep(0); say("melody stopped"); },
    stopAllSounds: () => { ctx.beep(0); say("quiet"); },
    isSoundPlaying: () => ctx.isBeeping(),
    onEvent: (e, cb) => ctx.on("music" + e, cb),
    setBuiltInSpeakerEnabled: () => {},
    volume: () => ctx.volume(),
    setVolume: (v) => ctx.volume(v)
  };

  const radio = {
    setGroup: (g) => { board.group(g); say("radio group " + g); },
    sendNumber: (n) => { say("radio sent " + n); wire.send("number", n); },
    sendString: (t) => { say("radio sent \"" + t + "\""); wire.send("string", String(t)); },
    sendValue: (k, v) => { say("radio sent " + k + "=" + v); wire.send("value", v, String(k)); },
    onReceivedNumber: (cb) => ctx.on("radioNumber", cb),
    onReceivedString: (cb) => ctx.on("radioString", cb),
    onReceivedValue: (cb) => ctx.on("radioValue", cb),
    receivedPacket: () => wire.strength(),
    setTransmitPower: (p) => board.power(p),
    setTransmitSerialNumber: () => {}
  };

  const control = {
    waitMicros: async (us) => { await wait(us / 1000); },
    inBackground: (cb) => ctx.forever(cb),
    reset: () => {},
    deviceName: () => ctx.name(),
    millis: () => Math.round(now())
  };

  const loops = {
    /* "every N ms do" - the forever queue already waits 20 ms between
       turns, so one wait here does the rest. */
    everyInterval: (ms, cb) => ctx.forever(async () => { await wait(Math.max(0, ms - 20)); await cb(); })
  };

  const game = {
    score: () => ctx.score(),
    setScore: (n) => { ctx.score(n); say("score is " + n); },
    addScore: (n) => { ctx.score(ctx.score() + n); say("score " + ctx.score()); },
    removeLife: (n) => { ctx.life(ctx.life() - (n || 1)); say("lives " + ctx.life()); },
    setLife: (n) => ctx.life(n),
    life: () => ctx.life(),
    isGameOver: () => ctx.over(),
    gameOver: async () => { ctx.over(true); say("GAME OVER, score " + ctx.score());
                            await showText("GAME OVER " + ctx.score()); },
    startCountdown: (ms) => say("countdown " + Math.round(ms / 1000) + " s"),
    currentTime: () => Math.round(now())
  };

  const makeImage = (text) => {
    const bits = String(text).replace(/[^#.]/g, "").replace(/#/g, "1").replace(/\./g, "0");
    return {
      showImage: (offset) => { screen.pattern(bits.slice(offset || 0).padEnd(25, "0").slice(0, 25)); say("show image"); },
      scrollImage: async (step, interval) => {
        screen.pattern(bits.padEnd(25, "0").slice(0, 25));
        await wait(interval || 200);
      },
      plotFrame: (n) => screen.pattern(bits.slice(n * 25).padEnd(25, "0").slice(0, 25)),
      width: () => bits.length / 5,
      pixel: (x, y) => bits[y * 5 + x] === "1"
    };
  };
  const images = { createImage: makeImage, createBigImage: makeImage };

  const serial = {
    writeLine: t => say("serial: " + t),
    writeString: t => say("serial: " + t),
    writeNumber: n => say("serial: " + n),
    writeValue: (k, v) => say("serial: " + k + " = " + v),
    redirectToUSB: () => {}, setBaudRate: () => {}, onDataReceived: () => {}, readLine: () => ""
  };

  const pins = {
    analogReadPin: () => 0, digitalReadPin: () => 0,
    analogWritePin: () => {}, digitalWritePin: () => {},
    analogSetPeriod: () => {}, servoWritePin: () => {}, servoSetPulse: () => {},
    setPull: () => {}, onPulsed: () => {}, pulseIn: () => 0,
    map: (v, a, b, c, d) => (v - a) * (d - c) / (b - a) + c
  };

  return { basic, input, led, music, radio, control, pins, loops, game, images, serial,
           randint: (a, b) => random.int(a, b), showText, glyph };
}
