/* ========================================================================
   5. Turning what MakeCode shows you into something we can run. The only
      real trick: every pause has to be awaited, so we mark the blocking
      calls and make every function async.
   ======================================================================== */
const BLOCKING = ["basic\\.pause", "basic\\.showString", "basic\\.showNumber",
                  "bitbot\\.\\w*ms", "bitbot\\.\\w*Milliseconds", "bitbot\\.gocm",
                  "bitbot\\.spinDeg", "bitbot\\.arcdeg", "bitbot\\.buzzTime",
                  "music\\.play", "music\\.playTone",
                  "music\\.rest", "control\\.waitMicros"];

function prepare(src) {
  let s = String(src);
  s = s.replace(/:\s*(number|string|boolean|void|any)\b/g, "");          // drop type annotations
  const userFns = [...s.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
  const names = BLOCKING.concat(userFns.map(n => n.replace(/[$]/g, "\\$")));
  const re = new RegExp("(^|[^\\w.$])((?:" + names.join("|") + ")\\s*\\()", "g");
  s = s.replace(re, "$1await $2");
  s = s.replace(/\bfunction\s*\(/g, "async function (");
  s = s.replace(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g, "async function $1(");
  s = s.replace(/\(\s*\)\s*=>/g, "async () =>");
  s = s.replace(/async\s+async/g, "async");
  return s;
}

/* Each micro:bit runs its own program on the room's one clock. */
async function runOne(m) {
  m.token++;
  const my = m.token;
  m.foreverQueue = [];
  m.noted = new Set();
  m.handlers = {};
  m.radioGroup = 0;
  m.lastFrom = null;
  setScreen(m, "0".repeat(25));

  const b = botOf(m);
  if (b) {
    b.lm = b.rm = 0; b.vl = b.vr = 0; b.brake = false;
    b.enc.l = b.enc.r = 0; b.bias = { dir: null, amount: 0 };
    b.pixels.fill(null); b.trail.length = 0;
    b.batt = +el("s-batt").value;
  }
  if (!m.code.trim()) return;

  let body;
  try { body = prepare(m.code); }
  catch (e) { say("could not read the program: " + e.message, "err", m); return; }

  const seen = new Set([...body.matchAll(/\b([A-Z][A-Za-z0-9_]*)\s*\./g)].map(x => x[1]));
  const stubs = {}, stubNames = [];
  for (const n of seen) {
    if (n in ENUMS || n in window || n === "Math") continue;
    stubs[n] = new Proxy({}, { get: (_, k) => String(k) });
    stubNames.push(n);
    say("note: " + n + " is not one the gym knows, using its names as they are", "say", m);
  }
  const stubLine = stubNames.length ? "const {" + stubNames.join(",") + "} = __st;\n" : "";

  let fn;
  try {
    fn = new Function("__ns", "__en", "__st", '"use strict";\n' +
      "const {basic,input,led,music,radio,bitbot,control,pins,loops,game,images,serial,randint} = __ns;\n" +
      "const {" + Object.keys(ENUMS).join(",") + "} = __en;\n" +
      "music.PlaybackMode = __en.PlaybackMode;\n" +
      stubLine +
      "const Math = Object.assign(Object.create(window.Math), {randomRange:(a,b)=>Math_randomRange(a,b)});\n" +
      "function Math_randomRange(a,b){return Math.floor(window.Math.random()*(b-a+1))+a;}\n" +
      "return (async () => {\n" + body + "\n})();");
  } catch (e) { say("syntax error: " + e.message, "err", m); return; }

  try {
    await fn(makeApi(m), ENUMS, stubs);
  } catch (e) {
    if (!(e instanceof Stopped)) say(e.message, "err", m);
    return;
  }
  if (my !== m.token) return;
  for (const cb of m.foreverQueue) {
    (async () => { while (my === m.token) { await cb(); await wait(m, 20); } })()
      .catch(e => { if (!(e instanceof Stopped)) say(e.message, "err", m); });
  }
}

/* one board on its own, started from its own card */
async function runDevice(m) {
  if (!m.code.trim()) { say("nothing on this one yet - transfer some code first", "err", m); return; }
  if (!running) {                       // the first one to start sets the clock going
    simTime = 0;
    log.innerHTML = "";
    stageCards.forEach(c => { if (c.log) c.log.innerHTML = ""; });
    running = true;
  }
  loop();            // starts the clock, or picks it up again if it ever stopped
  const p0 = placeOf(m);
  m.start = { x: p0.x, y: p0.y, h: p0.h };        // Reset brings it back here
  m.live = true;
  m.state = "run";
  m.runFrom = simTime; m.runFor = 0;      // its own stopwatch, started by its own Play
  say("play", "say", m);
  await runOne(m);
  if (!m.foreverQueue.length) {
    m.live = false;                              // the on start reached its end
    /* it can still be awake: a button or a radio handler is waiting for
       something to happen, so the card says "waiting", not "finished".
       A Stop in the middle already set the state, so leave that alone. */
    if (m.state === "run") m.state = Object.keys(m.handlers).length ? "wait" : "end";
    if (m.state === "end") m.runFor = simTime - m.runFrom;   // the clock stops with it
  }
}
function stopDevice(m) {
  m.token++; killTimers(m); m.foreverQueue = []; m.live = false; m.state = "stop";
  m.runFor = m.runFrom == null ? 0 : simTime - m.runFrom;
  if (m.bot) { m.bot.lm = m.bot.rm = 0; m.bot.brake = true; }
  say("stopped", "say", m);
}

/* Put one back exactly as it was before it ran: stopped, screen blank, lights
   out, wheels unwound, battery full, standing where Play found it. A child can
   try the same program again and again and see the same thing happen. */
function resetDevice(m) {
  m.token++; killTimers(m); m.foreverQueue = []; m.live = false; m.state = "ready";
  m.runFrom = null; m.runFor = 0;
  m.handlers = {}; m.noted = new Set();
  m.held.A = m.held.B = m.held.logo = false; m.beeping = 0;
  m.radioGroup = 0;
  setScreen(m, "0".repeat(25));
  const p = placeOf(m);
  if (m.start) { p.x = m.start.x; p.y = m.start.y; p.h = m.start.h; }
  const b = m.bot;
  if (b) {
    b.lm = b.rm = b.vl = b.vr = b.pv = b.afwd = b.aside = b.warm = 0;
    b.brake = false; b.enc.l = b.enc.r = 0; b.batt = 100;
    b.pixels = new Array(12).fill(null); b.pixelBright = 40; b.trail = [];
    b.bias = { dir: null, amount: 0 };
  }
  const c = stageCards.get("m" + m.id);
  if (c && c.log) c.log.innerHTML = "";
  say("reset - back at the start", "say", m);
  shadowsStale = true;
  draw(); instruments(); updateStage();
}

// nobody left running, every board back at its start, clock at zero
function resetAll() {
  running = false;
  for (const m of world.mbits) resetDevice(m);
  simTime = 0;
  log.innerHTML = "";
  stageCards.forEach(c => { if (c.log) c.log.innerHTML = ""; });
  say("everything is back at the start", "say");
  draw(); instruments(); updateStage();
}

function stopAll(quiet) {
  running = false;
  for (const m of world.mbits) {
    m.token++; killTimers(m); m.foreverQueue = []; m.live = false; m.state = "stop";
    m.runFor = m.runFrom == null ? 0 : simTime - m.runFrom;
  }
  for (const b of world.bots) { b.lm = b.rm = 0; b.brake = true; }
  if (!quiet) say("stopped", "say");
}

