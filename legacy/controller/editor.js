/* ========================================================================
   11. The real MakeCode editor, embedded. The protocol is small: the editor
       asks the host for its projects (workspacesync), and hands the project
       back every time it saves (workspacesave). That is all we need.
   ======================================================================== */
const EDITOR_URL = "https://makecode.microbit.org/?controller=1&nocookiebanner=1";
const STORE_KEY = "bitbot-gym-project";

function starterProject(name) {
  const now = Math.round(Date.now() / 1000);
  const pxt = {
    name: name || "Bit:Bot Gym",
    description: "micro:bit and Bit:Bot XL blocks",
    dependencies: {
      core: "*", radio: "*", microphone: "*",
      bitbot: "github:4tronix/BitBot#v2.1.9"   // this is what puts the Bit:Bot drawer in the toolbox
    },
    files: ["main.blocks", "main.ts"],
    preferredEditor: "blocksprj"
  };
  return {
    header: {
      id: "gym-" + (name || "start") + "-" + now, name: name || "Bit:Bot Gym", meta: {}, editor: "blocksprj",
      pubId: "", pubCurrent: false, target: "microbit", targetVersion: "9.0.12",
      recentUse: now, modificationTime: now, path: "bitbot-gym", isDeleted: false
    },
    text: {
      "main.blocks": '<xml xmlns="https://developers.google.com/blockly/xml">' +
                     '<block type="pxt-on-start" x="12" y="12"></block></xml>',
      "main.ts": "",
      "pxt.json": JSON.stringify(pxt, null, 4)
    }
  };
}

let editorFrame = null, pendingPull = null, msgId = 0, pendingImport = null, tidied = false;

// show this board's blocks in the editor
function showProjectOf(m) {
  if (!m) return;
  const project = m.project || starterProject(m.name);
  if (editorFrame) sendToEditor("importproject", { project: project });
  else pendingImport = project;
}

function startEditor() {
  if (editorFrame) return;
  const slot = el("editorSlot");
  slot.innerHTML = "";
  editorFrame = document.createElement("iframe");
  editorFrame.id = "editor";
  editorFrame.title = "MakeCode editor";
  editorFrame.setAttribute("allow", "usb; clipboard-read; clipboard-write");
  editorFrame.src = EDITOR_URL;
  slot.appendChild(editorFrame);
  say("starting MakeCode - the first load takes a moment", "say");
}

function sendToEditor(action, extra) {
  if (!editorFrame) { say("the editor is not running yet", "say"); return; }
  const id = "gym-" + (++msgId);
  editorFrame.contentWindow.postMessage(
    Object.assign({ type: "pxteditor", id: id, action: action, response: true }, extra || {}), "*");
}

window.addEventListener("message", ev => {
  const msg = ev.data;
  if (!msg || typeof msg !== "object" || msg.type !== "pxthost") return;

  if (msg.action === "workspacesync") {
    // the editor is asking what projects it has; hand it the one we want it to open
    const m0 = mbit();
    const give = pendingImport || (m0 && m0.project) || starterProject(m0 ? m0.name : null);
    msg.projects = [give];
    try { ev.source.postMessage(msg, "*"); } catch (e) { }
    say(pendingImport ? "gave MakeCode the program from the .hex" : "gave MakeCode the Bit:Bot project", "say");
    pendingImport = null;
    if (!tidied) {                      // the editor is up, so take back the space it does not need
      tidied = true;
      setTimeout(() => {
        sendToEditor("hidesimulator");
        sendToEditor("setscale", { scale: 1.35 });   // bigger blocks, they are for nine year olds
      }, 600);
    }
    return;
  }
  if (msg.action === "workspacesave" && msg.project) {
    const m0 = mbit();
    if (m0) {
      m0.project = msg.project;
      const ts = (msg.project.text || {})["main.ts"];
      if (typeof ts === "string") {
        /* The editor sends the whole project back every time it saves, and an
           echo of a project we have just put there can land a second after a
           program was started. Only pressing Transfer puts the card back to
           "ready" - comparing the code will not do, because the editor tidies
           it on the way through and so it never comes back quite the same. */
        const transferred = !!pendingPull;
        m0.code = ts;
        if (transferred) { m0.state = "ready"; m0.runFrom = null; m0.runFor = 0; }
        if (pendingPull) { const f = pendingPull; pendingPull = null; f(ts); }
        else if (ts.trim()) say("took the code from your blocks", "say", m0);
      }
      saveAll();
    }
    return;
  }
  if (msg.action === "workspacereset" || msg.action === "workspaceloaded") {
    try { ev.source.postMessage(msg, "*"); } catch (e) { }
  }
});

// take what MakeCode has and put it on the selected board, the way you would flash it
async function pullCode() {
  if (!editorFrame) { startEditor(); return; }
  const m = mbit();
  const wire = el("wire");
  wire.hidden = false;
  wire.querySelector("b").textContent = "transferring to " + m.name + "\u2026";
  const started = Date.now();
  await new Promise(res => {
    pendingPull = res;
    sendToEditor("saveproject");
    setTimeout(() => { if (pendingPull === res) { pendingPull = null; res(null); } }, 4000);
  });
  await new Promise(r => setTimeout(r, Math.max(0, 900 - (Date.now() - started))));
  wire.hidden = true;
  saveAll();
  if (m.code.trim()) say("code transferred to " + m.name + " - press play on its card", "say", m);
  else say("MakeCode has not given us any blocks yet", "err", m);
  renderDevices();
  if (stageOpen()) { stageCards = new Map(); syncStage(); updateStage(); }
}

/* ========================================================================
   The bench lives in a SQLite database. The simulation itself - where a
   robot is this millisecond, how fast a wheel is turning, which pixels are
   lit - stays in memory, because that changes two hundred times a second
   and is thrown away at the end of a run. What the database holds is the
   bench: which boards exist, what they are called, which body each one is
   plugged into, and the blocks each one carries. Every change goes through
   it, so the two views can never disagree about what is in the room.

   Poke at it from the console:  gymSql("select id,kind,name from device")
   ======================================================================== */
const DB_KEY = "bitbot-gym-db";
let SQL = null, db = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS device (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('bitbot','microbit')),
    name TEXT NOT NULL, colour TEXT, x REAL, y REAL,
    model TEXT DEFAULT 'XL', code TEXT DEFAULT '', project TEXT);
  CREATE TABLE IF NOT EXISTS setting (k TEXT PRIMARY KEY, v TEXT);
`;

async function openDb() {
  if (db) return db;
  if (!window.initSqlJs) {
    await new Promise((res, rej) => {
      const sc = document.createElement("script");
      sc.src = "https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.js";
      sc.onload = res;
      sc.onerror = () => rej(new Error("could not fetch SQLite"));
      document.head.appendChild(sc);
    });
  }
  SQL = await window.initSqlJs({
    locateFile: f => "https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/" + f
  });
  let bytes = null;
  try {
    const stored = localStorage.getItem(DB_KEY);
    if (stored) bytes = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
  } catch (e) { bytes = null; }
  db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");
  db.run(SCHEMA);
  return db;
}

function persistDb() {
  if (!db) return;
  try { localStorage.setItem(DB_KEY, btoa(String.fromCharCode.apply(null, db.export()))); }
  catch (e) { /* a full or blocked store should not stop the lesson */ }
}

// a plain query for the console, and for us
function gymSql(sql, params) {
  if (!db) return [];
  const out = [];
  const st = db.prepare(sql);
  if (params) st.bind(params);
  while (st.step()) out.push(st.getAsObject());
  st.free();
  return out;
}
window.gymSql = gymSql;

/* the bench, written down */
function saveAll() {
  if (!db) return;
  try {
    db.run("BEGIN");
    db.run("DELETE FROM device;");
    const ins = db.prepare(
      "INSERT INTO device (id,kind,name,colour,x,y,model,code,project) VALUES (?,?,?,?,?,?,?,?,?)");
    for (const m of world.mbits) {
      const p = placeOf(m);
      ins.run([m.id, m.kind, m.name, m.colour, p.x, p.y,
               m.bot ? m.bot.model : "XL", m.code || "",
               m.project ? JSON.stringify(m.project) : null]);
    }
    ins.free();
    db.run("COMMIT");
  } catch (e) {
    try { db.run("ROLLBACK"); } catch (e2) { }
    say("could not write the bench: " + e.message, "err");
    return;
  }
  persistDb();
}

/* and read back */
function loadAll() {
  if (!db) return false;
  const rows = gymSql("SELECT * FROM device ORDER BY id");
  if (!rows.length) return false;
  world.mbits = rows.map((r, i) => {
    const d = makeDevice(r.kind, r.name, r.colour || COLOURS[i % COLOURS.length], r.x, r.y);
    d.id = r.id;
    d.code = r.code || "";
    try { d.project = r.project ? JSON.parse(r.project) : null; } catch (e) { d.project = null; }
    if (d.bot) d.bot.model = r.model || "XL";
    return d;
  });
  nextId = Math.max(0, ...world.mbits.map(m => m.id)) + 1;
  syncBots();
  return true;
}

function placeEveryone() {
  syncBots();
  const bots = world.bots;
  bots.forEach((b, i) => {
    b.x = ROOM * (i + 1) / (bots.length + 1); b.y = 1500; b.h = -Math.PI / 2;
    b.lm = b.rm = b.vl = b.vr = 0; b.trail.length = 0;
  });
  world.mbits.filter(m => !m.bot).forEach((m, i) => {
    m.x = 220 + (i % 5) * 150; m.y = 150 + Math.floor(i / 5) * 120;
  });
}

function nextName(kind) {
  if (kind === "bitbot") {
    let n = 1;
    while (world.mbits.some(m => m.name === "Bit:Bot " + n)) n++;
    return "Bit:Bot " + n;
  }
  let i = 0;
  while (world.mbits.some(m => m.name === "micro:bit " + String.fromCharCode(65 + i))) i++;
  return "micro:bit " + String.fromCharCode(65 + i);
}

function addDevice(kind) {
  if (world.mbits.length >= MAX_MICROBITS) return;
  if (kind === "bitbot" && world.mbits.filter(m => m.kind === "bitbot").length >= MAX_BOTS) return;
  const colour = COLOURS[world.mbits.length % COLOURS.length];
  world.mbits.push(makeDevice(kind, nextName(kind), colour, 300, 300));
  world.sel = world.mbits.length - 1;
  syncBots(); placeEveryone(); renderDevices(); showProjectOf(mbit());
  draw(); instruments(); saveAll();
}

el("renameDev").addEventListener("click", () => {
  const m = mbit();
  const given = window.prompt("What is this one called?", m.name);
  if (given === null) return;
  const name = given.trim().slice(0, 18);
  if (!name) return;
  if (world.mbits.some(o => o !== m && o.name === name)) {
    say("there is already one called " + name, "err");
    return;
  }
  const was = m.name;
  m.name = name;
  if (m.bot) m.bot.name = name;
  say(was + " is now called " + name, "say");
  renderDevices(); draw(); instruments(); saveAll();
  if (stageOpen()) { stageCards = new Map(); syncStage(); updateStage(); }
});
el("pullCode").addEventListener("click", pullCode);
el("addBot").addEventListener("click", () => addDevice("bitbot"));
el("addMbit").addEventListener("click", () => addDevice("microbit"));
// taking one away, either from the bench list or by its red x in the room
function removeDevice(m) {
  if (world.mbits.length <= 1) { say("the room needs at least one board in it", "say"); return; }
  const i = world.mbits.indexOf(m);
  if (i < 0) return;
  m.token++; killTimers(m); m.foreverQueue = []; m.live = false;
  world.mbits.splice(i, 1);
  world.sel = Math.min(world.sel, world.mbits.length - 1);
  say(m.name + " taken away", "say");
  syncBots(); renderDevices(); showProjectOf(mbit());
  shadowsStale = true; draw(); instruments(); saveAll();
  if (stageOpen()) { stageCards = new Map(); syncStage(); updateStage(); }
}
el("delDev").addEventListener("click", () => removeDevice(mbit()));

