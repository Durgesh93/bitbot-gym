/* One robot that can run a program: a board, a chassis, and the clock.

   The awkward part of a gym is that a child's program is written as if it
   owns the world - `drive forward, pause 1 second, turn` - while the gym
   runs ten of them against one clock that only moves when the room says so.
   This is where those two meet.

   `wait(ms)` hands back a promise and writes down when it should be kept.
   The room ticks, the clock moves, and `release` keeps every promise that
   has come due. So a program is only ever running in the gaps between
   ticks, and it cannot see a world half way through moving.

   Stop works by bumping a token. Anything still waiting on the old token is
   rejected with Stopped, which unwinds the program wherever it had got to
   without leaving a loop running in the background for the rest of the
   afternoon. That bug - a stopped robot that still drove - is the reason
   the token exists. */

import { createApi, ENUMS } from "../api/index.js";
import { compile, Stopped } from "./program.js";
import { createBoard } from "../hardware/microbit.js";
import { createChassis, CHASSIS } from "../hardware/bitbot.js";
import { say as globalSay } from "../core/log.js";
import { random } from "../core/random.js";

export const STATES = ["ready", "run", "wait", "end", "stop"];

export function createMachine(opts) {
  const o = opts || {};
  const id = o.id;
  const board = o.board || createBoard({ id: id });
  const chassis = o.chassis || createChassis();
  const now = o.now || (() => 0);
  const wire = o.radio || { send() {}, strength: () => -128 };
  const temperature = o.temperature || (() => 21);
  let latest = o.reads || (() => ({}));

  let token = 0;
  let waiters = [];
  let forever = [];
  let handlers = {};
  let noted = new Set();
  let state = "ready";
  let code = "";
  let beepUntil = 0;
  let extras = { brightness: 255, tempo: 120, volume: 127, score: 0, life: 3, over: false };
  let plugged = o.plugged == null ? true : !!o.plugged;
  let startedAt = null, ranFor = 0;

  const say = (msg, cls) => globalSay(msg, cls || "say", { id: id, name: o.name });
  const sayOnce = (key, msg) => { if (!noted.has(key)) { noted.add(key); say(msg); } };

  /* ---- the clock ------------------------------------------------------ */

  function wait(ms) {
    const mine = token;
    if (mine !== token) return Promise.reject(new Stopped());
    return new Promise((resolve, reject) => {
      waiters.push({ at: now() + Math.max(0, ms || 0), resolve, reject, token: mine });
    });
  }

  /* Called once a tick, after the clock has moved. */
  function release() {
    if (!waiters.length) return;
    const t = now();
    const due = waiters.filter(w => w.at <= t);
    if (!due.length) return;
    waiters = waiters.filter(w => w.at > t);
    for (const w of due) {
      if (w.token === token) w.resolve();
      else w.reject(new Stopped());
    }
  }

  /* ---- what the blocks are handed ------------------------------------- */

  const ctx = {
    board, chassis,
    reads: () => latest(),
    wait, now,
    say, sayOnce,
    radio: wire,
    random,
    axle: CHASSIS.axle,
    forever: cb => forever.push(cb),
    on: (name, cb) => { handlers[name] = cb; },
    cancel: () => { token++; },
    temperature,
    acceleration: () => 0,
    rotation: () => 0,
    brightness: v => { if (v != null) extras.brightness = v; return extras.brightness; },
    tempo: v => { if (v != null) extras.tempo = v; return extras.tempo; },
    volume: v => { if (v != null) extras.volume = v; return extras.volume; },
    beep: ms => { beepUntil = ms > 0 ? now() + ms : 0; board.beep(ms > 0); },
    isBeeping: () => now() < beepUntil,
    score: v => { if (v != null) extras.score = v; return extras.score; },
    life: v => { if (v != null) extras.life = v; return extras.life; },
    over: v => { if (v != null) extras.over = !!v; return extras.over; },
    plugged: () => plugged,
    name: () => o.name || ("micro:bit " + id)
  };

  const api = createApi(ctx);

  /* ---- running -------------------------------------------------------- */

  function clear() {
    token++;
    waiters = [];
    forever = [];
    handlers = {};
    noted = new Set();
    beepUntil = 0;
    board.screen.clear();
    board.beep(false);
  }

  async function run() {
    clear();
    const mine = token;
    chassis.reset();
    if (!String(code).trim()) { say("nothing on this one yet", "err"); return; }

    let program;
    try { program = compile(code, api, ENUMS); }
    catch (e) { say("syntax error: " + e.message, "err"); state = "stop"; return; }
    for (const n of program.unknown) {
      say("note: " + n + " is not one the gym knows, using its names as they are");
    }

    state = "run";
    startedAt = now();
    ranFor = 0;
    try { await program.run(); }
    catch (e) {
      if (!(e instanceof Stopped)) { say(e.message, "err"); state = "stop"; }
      return;
    }
    if (mine !== token) return;

    /* The `on start` reached its end. The robot can still be awake: a
       button or a radio handler is armed and waiting for something to
       happen, and the card should say "waiting" rather than "finished". */
    if (forever.length) {
      for (const cb of forever) loopOne(cb, mine);
      return;
    }
    state = Object.keys(handlers).length ? "wait" : "end";
    if (state === "end") ranFor = now() - startedAt;
  }

  function loopOne(cb, mine) {
    (async () => {
      while (mine === token) { await cb(); await wait(20); }
    })().catch(e => { if (!(e instanceof Stopped)) say(e.message, "err"); });
  }

  /* A handler - a button, a shake, a radio message - runs like a little
     program of its own, and is allowed to pause inside. */
  function fire(name, ...args) {
    const cb = handlers[name];
    if (!cb) return false;
    const mine = token;
    Promise.resolve()
      .then(() => cb(...args))
      .catch(e => { if (!(e instanceof Stopped)) say(e.message, "err"); });
    if (state === "wait" || state === "end") state = "wait";
    return true;
  }

  function stop(quiet) {
    clear();
    chassis.stop();
    state = "stop";
    if (startedAt != null) ranFor = now() - startedAt;
    if (!quiet) say("stopped");
  }

  /* Put it back exactly as it was before it ran, so a child can try the
     same program again and see the same thing happen. */
  function reset() {
    clear();
    chassis.reset();
    board.press("A", false); board.press("B", false); board.press("logo", false);
    board.group(0);
    extras = { brightness: 255, tempo: 120, volume: 127, score: 0, life: 3, over: false };
    state = "ready";
    startedAt = null; ranFor = 0;
  }

  return {
    id, board, chassis, api,
    load(src) { code = String(src || ""); state = "ready"; },
    code: () => code,
    run, stop, reset, release, fire,
    plug(on) { plugged = !!on; return plugged; },
    plugged: () => plugged,
    setReads(fn) { latest = fn; },
    isBeeping: () => ctx.isBeeping(),
    state: () => state,
    stopwatch: () => (state === "run" || state === "wait"
      ? (startedAt == null ? 0 : now() - startedAt) : ranFor),
    waiting: () => waiters.length,
    armed: () => Object.keys(handlers),
    /* for the card, and for a test that wants to know what a program did */
    extras: () => ({ ...extras })
  };
}
