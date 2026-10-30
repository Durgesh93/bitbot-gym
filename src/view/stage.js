/* ========================================================================
   13. The second window: every board and every robot at once, so you can
       watch them all instead of clicking between them. Same origin, so we
       just build its DOM from here and keep it fed each frame.
   ======================================================================== */
const STAGE_CSS = `
  #stage { position: fixed; inset: 0; z-index: 40; background: var(--bg); display: none;
           flex-direction: column; padding: 10px 12px 12px; }
  #stage.on { display: flex; }
  #stage .bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; margin-bottom: 10px; flex: 0 0 auto; min-height: 40px; align-content: center; }
  #stage .bar .title { font-weight: 700; font-size: 16px; letter-spacing: .01em; }
  #stage .bar .title span { color: var(--accent); }
  #stage .bar .clock { font-family: var(--f-mono); color: var(--muted); font-size: 13px; }
  #stage .bar .spacer { flex: 1; }
  #stage .view { flex: 1 1 auto; min-height: 0; display: grid; gap: 12px;
                 grid-template-columns: minmax(0, 54fr) minmax(0, 46fr); }
  #stage .left { display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow: hidden; }
  #stage .left h1 { margin: 2px 0 0; }
  #stage #stageRoomSlot { flex: 1 1 auto; min-height: 0; display: flex; justify-content: center; }
  #stage canvas { width: auto; height: auto; max-width: 100%; max-height: 100%;
                  border-radius: 10px; background: #0d1017; display: block; }
  #stage .tools { display: flex; flex-wrap: wrap; gap: 6px; }
  #stage .tools button { padding: 5px 9px; font-size: 11.5px; }
  #stage .tools .sep { width: 1px; align-self: stretch; background: var(--line); margin: 0 3px; }
  #stage .cards { overflow: auto; align-content: start; display: grid; gap: 10px;
                  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); }
  #stage .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; }
  #stage .card.idle { opacity: .5; }
  /* a card brightens, and takes a green edge, while its program runs */
  #stage .card.live { background: #313d52; border-color: var(--go); box-shadow: inset 3px 0 0 var(--go); }
  #stage .card.live .top b { color: #d6ffe6; }
  /* and it goes dark with a red edge once Stop has been pressed */
  #stage .card.off { background: #20222b; border-color: #70383d; box-shadow: inset 3px 0 0 var(--stop); }
  #stage .card.off .top b { color: #eec2c4; }
  #stage .card.off .scr, #stage .card.off table { opacity: .62; }
  #stage .st { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700;
               border: 1px solid var(--line); border-radius: 999px; padding: 1px 6px; color: var(--muted); }
  #stage .st[data-st="run"] { color: #9ff0c0; border-color: var(--go); }
  #stage .st[data-st="stop"] { color: #ffb4b7; border-color: var(--stop); }
  #stage .st[data-st="wait"] { color: #bfe3f5; border-color: rgba(91,192,235,0.5); }
  #stage .top { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; }
  #stage .top b { font-size: 15px; }
  /* a card is in two halves: what the board feels, then what the robot feels */
  #stage .sect { display: flex; align-items: center; gap: 7px; margin: 10px 0 5px;
                 font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase;
                 color: var(--muted); font-weight: 700; }
  #stage .sect:after { content: ""; flex: 1; height: 1px; background: var(--line); }
  #stage .sect.bot { color: var(--accent); }
  #stage .sect.bot:after { background: rgba(91,192,235,0.3); }
  #stage .card > .sect:first-of-type { margin-top: 4px; }
  #stage .dot { width: 10px; height: 10px; border-radius: 50%; display: block; }
  #stage .where { margin-left: auto; font-size: 11px; color: var(--muted); }
  #stage .ctime { font-family: var(--f-mono); font-size: 11px; color: var(--muted);
                  font-variant-numeric: tabular-nums; }
  #stage .card.live .ctime { color: #9ff0c0; }
  #stage .card.off .ctime { color: #ffb4b7; }
  #stage .body { display: flex; gap: 10px; }
  #stage .scr { display: grid; grid-template-columns: repeat(5, 10px); gap: 3px; background: #08080c;
                padding: 7px; border-radius: 7px; height: max-content; }
  #stage .scr span { width: 10px; height: 10px; border-radius: 2px; background: #3a2a2a; display: block; }
  #stage .scr span.on { background: var(--led-on); box-shadow: 0 0 5px var(--led-on); }
  #stage table { border-collapse: collapse; width: 100%; font-size: 11.5px; }
  #stage td { padding: 1px 0; }
  #stage td.k { color: var(--muted); padding-right: 6px; white-space: nowrap; }
  #stage td.v { white-space: nowrap; }
  #stage td.v { text-align: right; font-family: var(--f-mono); font-variant-numeric: tabular-nums; }
  #stage .leds { display: flex; gap: 3px; margin-top: 7px; }
  #stage .leds i { width: 9px; height: 9px; border-radius: 50%; background: #2a2f3c; display: block; }
  #stage .arms { display: flex; gap: 14px; margin-top: 8px; }
  #stage .arms > div { display: flex; align-items: center; gap: 5px; }
  #stage .arms b { font-size: 10px; color: var(--muted); font-weight: 600; }
  #stage .mlog { margin-top: 8px; height: 86px; overflow: auto; background: #0d1017;
      border: 1px solid var(--line); border-radius: 7px; padding: 5px 7px;
      font-family: var(--f-mono); font-size: 10.5px; line-height: 1.5; color: #c6d2e4; }
  #stage .mlog div { white-space: pre-wrap; }
  #stage .mlog div.err { color: #ff9a9a; }
  #stage .mlog div.say { color: var(--warn); }
  #stage .press { display: flex; gap: 4px; margin-top: 8px; }
  #stage .press button { flex: 1; padding: 4px 2px; font-size: 11px; }
  #stage .press.keys button { font-size: 10px; padding: 4px 1px; }
  #stage .press.keys button.down { background: var(--accent); border-color: var(--accent); color: #04202c; font-weight: 700; }
  #stage .press.run button[data-go="1"] { background: var(--go); border-color: var(--go); color: #06281a; font-weight: 700; }
  #stage .press.run button[data-go="0"] { background: var(--stop); border-color: var(--stop); color: #2b0708; font-weight: 700; }
  #stage .press.run button[data-go="2"] { font-weight: 600; }
  #stage .arms { justify-content: space-between; }
  #stage #stageLog { flex: 1 1 auto; min-height: 90px; overflow: auto; background: #0d1017;
      border: 1px solid var(--line); border-radius: 10px; padding: 9px;
      font-family: var(--f-mono); font-size: 11.5px; line-height: 1.55; color: #c6d2e4; }
  #stage #stageLog div { white-space: pre-wrap; }
  #stage #stageLog div.err { color: #ff9a9a; }
  #stage #stageLog div.say { color: var(--warn); }
  @media (max-width: 900px) { #stage .view { grid-template-columns: minmax(0,1fr); } }
`;

const stageOpen = () => !!stageHost && stageHost.classList.contains("on");

// the Bit:Bot's twelve lights are six down each side, so draw them that way
const ARMS_HTML =
  '<div class="arms">' +
    '<div><b>L</b><div class="leds">' + "<i></i>".repeat(6) + "</div></div>" +
    '<div><b>R</b><div class="leds">' + "<i></i>".repeat(6) + "</div></div>" +
  "</div>";

/* The gym is two pages: the bench where you build, and the room where it runs.
   An arrow on either side, or one finger dragged across, moves between them. */
function showRoomView() { openStage(); }
function showBenchView() { closeStage(); }

function addArrows() {
  if (document.getElementById("toRoom")) return;
  const st = document.createElement("style");
  st.textContent = `
    .pager { position: fixed; top: 50%; transform: translateY(-50%); z-index: 45;
      width: 34px; height: 56px; border-radius: 10px; font-size: 19px; line-height: 1;
      background: var(--panel-2); border: 1px solid var(--line); color: var(--fg);
      cursor: pointer; opacity: .75; }
    .pager:hover { opacity: 1; }
    #toRoom { right: 6px; }
    #toBench { left: 6px; display: none; }
    #stage.on ~ #toRoom, body:has(#stage.on) #toRoom { display: none; }
    body:has(#stage.on) #toBench { display: block; }`;
  document.head.appendChild(st);
  const right = document.createElement("button");
  right.id = "toRoom"; right.className = "pager"; right.title = "the room and the boards";
  right.textContent = "\u203a";
  right.addEventListener("click", showRoomView);
  const left = document.createElement("button");
  left.id = "toBench"; left.className = "pager"; left.title = "back to the blocks";
  left.textContent = "\u2039";
  left.addEventListener("click", showBenchView);
  document.body.appendChild(right);
  document.body.appendChild(left);
}

// one finger across the page turns the page, unless it started on something
// that does its own dragging - the room, the editor, a slider or a list
function swipeStarted(t) {
  return !!(t.closest && (t.closest("#room") || t.closest("iframe") || t.closest(".cards") ||
            t.closest("#stageLog") || t.closest("#log") || t.closest("input") ||
            t.closest("select") || t.closest("textarea") || t.closest("button")));
}
let swipe = null;
document.addEventListener("pointerdown", e => {
  swipe = swipeStarted(e.target) ? null : { x: e.clientX, y: e.clientY, t: Date.now() };
}, true);
document.addEventListener("pointerup", e => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
  if (dx < 0) showRoomView(); else showBenchView();
}, true);

/* The running view: the room and every board, with the building put away.
   One page, no pop-up windows to be blocked or lost behind the browser. */
function buildStage() {
  if (stageHost) return;
  const st = document.createElement("style");
  st.textContent = STAGE_CSS;
  document.head.appendChild(st);

  stageHost = document.createElement("div");
  stageHost.id = "stage";
  stageHost.innerHTML =
    '<div class="bar">' +
      '<span class="title">Bit:Bot <span>Gym</span></span>' +
      '<span id="stageChips" style="display:flex;gap:6px;flex-wrap:wrap"></span>' +
      '<span class="spacer"></span>' +
      '<button id="stageReset">\u21ba Reset all</button>' +
      '<label class="inline">Speed <select id="stageSpeed">' +
        '<option value="1">1x</option><option value="2">2x</option>' +
        '<option value="4">4x</option><option value="8">8x</option></select></label>' +
      '<button id="stageBack" class="on">Back to blocks</button>' +
    '</div>' +
    '<div class="view">' +
      '<div class="left"><div id="stageRoomSlot"></div><div id="stageToolSlot"></div></div>' +
      '<div class="cards" id="stageCardsBox"></div>' +
    '</div>';
  document.body.appendChild(stageHost);

  stageHost.querySelector("#stageBack").addEventListener("click", closeStage);
  stageHost.querySelector("#stageReset").addEventListener("click", resetAll);
  const sp = stageHost.querySelector("#stageSpeed");
  sp.value = el("speed").value;
  sp.addEventListener("change", e => { el("speed").value = e.target.value; });
}

let tickMoan = 0;
function stageTick() {
  if (!stageOpen()) return;
  try {
    if (!running) { draw(); updateStage(); }   // while it runs, the sim loop does this
  } catch (e) {
    if (!tickMoan++) say("something went wrong drawing the room: " + e.message, "err");
  }
  requestAnimationFrame(stageTick);           // keep going whatever happened
}

function openStage() {
  buildStage();
  stageHost.classList.add("on");
  // borrow the room itself, not a picture of it, so dragging still works
  stageHost.querySelector("#stageRoomSlot").appendChild(cv);
  stageHost.querySelector("#stageToolSlot").appendChild(el("roomTools"));
  stageHost.querySelector("#stageSpeed").value = el("speed").value;
  stageCards = new Map();
  syncStage(); backfillCardLogs(); updateStage();
  requestAnimationFrame(stageTick);
}

function closeStage() {
  if (!stageHost) return;
  // give the room and its buttons back to the bench
  const home = el("roomHome");
  home.appendChild(cv);
  home.appendChild(el("roomTools"));
  stageHost.classList.remove("on");
  draw(); instruments();
}

// one card per micro:bit, rebuilt only when the cast changes
function syncStage() {
  if (!stageOpen()) return;
  const grid = stageHost.querySelector("#stageCardsBox");
  // every id, name, colour and kind, so any change at all rebuilds the cards
  const want = world.mbits.map(m => m.id + m.kind + m.name + m.colour).join(",");
  if (grid.dataset.ids !== want) {
    grid.dataset.ids = want;
    grid.innerHTML = "";
    stageCards = new Map();
    /* Every card has a micro:bit half: the screen, and everything the board
       itself can feel. A Bit:Bot card has a robot half underneath as well,
       with the wheels, the eyes, the line sensors and the sonar. */
    const MB_ROWS = [["light", "lv"], ["sound", "sd"], ["temp", "tp"],
                     ["compass", "cp"], ["field \u00b5T", "mg"], ["accel mg", "ac"],
                     ["pitch/roll", "tl"], ["buttons", "bt"], ["radio", "rg"]];
    const BOT_ROWS = [["eyes L/R", "ll"], ["line L/R", "ln"], ["sonar", "sn"],
                      ["motors", "mo"], ["speed", "sp"], ["battery", "ba"]];
    const tbl = rows => "<table>" + rows.map(r =>
      '<tr><td class="k">' + r[0] + '</td><td class="v" data-f="' + r[1] + '">-</td></tr>').join("") + "</table>";
    const KEYS = [["A", "A"], ["B", "B"], ["AB", "A+B"], ["shake", "Shake"], ["logo", "Logo"]];
    for (const m of world.mbits) {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<div class="top"><i class="dot" style="background:' + m.colour + '"></i><b>' + m.name +
        '</b><span class="st"></span><span class="where"></span>' +
        '<span class="ctime">0.0 s</span></div>' +
        '<div class="sect">micro:bit</div>' +
        '<div class="body"><div class="scr">' + "<span></span>".repeat(25) + "</div>" +
        tbl(MB_ROWS) + "</div>" +
        '<div class="press keys">' + KEYS
          .map(k => '<button data-k="' + k[0] + '">' + k[1] + "</button>").join("") + "</div>" +
        (m.bot ? '<div class="sect bot">Bit:Bot ' + m.bot.model + "</div>" + tbl(BOT_ROWS) + ARMS_HTML : "") +
        '<div class="mlog"></div>' +
        '<div class="press run"><button data-go="1">\u25b6 Play</button>' +
        '<button data-go="0">\u25a0 Stop</button>' +
        '<button data-go="2">\u21ba Reset</button></div>';
      grid.appendChild(card);
      card.querySelectorAll(".press.run button").forEach(btn => btn.addEventListener("click", () => {
        if (btn.dataset.go === "1") runDevice(m);
        else if (btn.dataset.go === "2") resetDevice(m);
        else stopDevice(m);
      }));
      // a button stays down while the finger is on it, so "button A is pressed" is true
      card.querySelectorAll(".press.keys button").forEach(btn => {
        const k = btn.dataset.k;
        const up = () => { m.held.A = m.held.B = m.held.logo = false; btn.classList.remove("down"); };
        btn.addEventListener("pointerdown", () => {
          if (k === "AB") m.held.A = m.held.B = true; else if (m.held[k] !== undefined) m.held[k] = true;
          btn.classList.add("down");
          const cb = m.handlers[k];
          if (!cb) { say("nothing is listening for " + k, "say", m); return; }
          say("pressed " + k, "say", m);
          Promise.resolve(cb()).catch(e => { if (!(e instanceof Stopped)) say(e.message, "err", m); });
        });
        btn.addEventListener("pointerup", up);
        btn.addEventListener("pointerleave", up);
        btn.addEventListener("pointercancel", up);
      });
      const f = {};
      card.querySelectorAll("[data-f]").forEach(td => f[td.dataset.f] = td);
      stageCards.set("m" + m.id, {
        card: card, cells: card.querySelectorAll(".scr span"),
        leds: card.querySelectorAll(".leds i"), where: card.querySelector(".where"),
        st: card.querySelector(".st"),
        log: card.querySelector(".mlog"), time: card.querySelector(".ctime"), f: f
      });
    }
    // the same chips as the bench, so you can still switch board up here
    const chips = stageHost.querySelector("#stageChips");
    chips.innerHTML = "";
    world.mbits.forEach((m, i) => {
      const c = document.createElement("button");
      c.className = "chip";
      c.style.borderColor = m.colour;
      c.innerHTML = '<i style="background:' + m.colour + '"></i>' + m.name;
      c.addEventListener("click", () => { world.sel = i; renderDevices(); showProjectOf(m); });
      chips.appendChild(c);
    });
  }
}

// a card built after a program started still gets the lines it missed
function backfillCardLogs() {
  if (!stageOpen()) return;
  stageCards.forEach((c, key) => {
    if (!c.log || c.log.children.length) return;
    const id = String(key).slice(1);
    for (const d of log.children) {
      if (d.dataset.dev !== id) continue;
      const line = d.cloneNode(true);
      const tag = line.querySelector("b");
      if (tag) tag.remove();
      c.log.appendChild(line);
    }
    c.log.scrollTop = c.log.scrollHeight;
  });
}

let lastNumbers = 0;
function updateStage() {
  if (!stageOpen()) return;
  // the screens and the lights keep up with every frame, but the numbers only
  // change five times a second - at sixty they are a blur nobody can read
  const now = Date.now();
  const numbers = now - lastNumbers > 190;
  if (numbers) lastNumbers = now;
  const before = stageCards.size;
  syncStage();
  if (stageCards.size !== before) backfillCardLogs();
  const dash = "—";
  for (const m of world.mbits) {
    const c = stageCards.get("m" + m.id);
    if (!c) continue;
    const b = botOf(m);
    for (let i = 0; i < 25; i++) c.cells[i].classList.toggle("on", !!m.screen[i]);
    c.where.textContent = m.kind === "bitbot" ? "robot" : "in hand";
    /* its own stopwatch: counting while it is awake, frozen where it stopped */
    const t = m.runFrom == null ? 0
            : m.live || m.state === "wait" ? simTime - m.runFrom : m.runFor || 0;
    c.time.textContent = (t / 1000).toFixed(1) + " s";
    /* Three looks, so a glance tells you where a board is: running is bright
       with a green edge, stopped goes dark with a red one, and anything else
       is the plain card. The word beside the name spells it out. */
    const st = !m.code.trim() ? "none" : m.live ? "run" : m.state || "ready";
    c.card.classList.toggle("idle", st === "none");
    c.card.classList.toggle("live", st === "run");
    c.card.classList.toggle("off", st === "stop");
    if (c.st.dataset.st !== st) {
      c.st.dataset.st = st;
      c.st.textContent = { run: "running", stop: "stopped", wait: "waiting",
                           end: "finished", ready: "ready", none: "no code" }[st];
    }
    const set = (k, v) => { if (numbers && c.f[k]) c.f[k].textContent = v; };
    // every reading three digits wide, so nothing jumps about as the numbers change
    const d3 = n => (n < 0 ? "-" : "") + String(Math.abs(Math.round(n))).padStart(3, "0");
    const held = ["A", "B", "logo"].filter(k => m.held[k]);
    // the board's own senses, which every card has
    set("lv", d3(readScreenLight(m)));
    set("sd", d3(readSoundLevel(m)));
    set("tp", d3(readTemperature(m)) + " °C");
    set("cp", d3(compassHeadingDeg(m)) + "°");
    set("mg", d3(magneticForce(m, "x")) + " / " + d3(magneticForce(m, "y")) +
              " / " + d3(magneticForce(m, "z")));
    set("ac", d3(accelMg(m, "x")) + " / " + d3(accelMg(m, "y")) + " / " + d3(accelMg(m, "z")));
    set("tl", d3(rotationDeg(m, "pitch")) + "° / " + d3(rotationDeg(m, "roll")) + "°");
    set("bt", held.length ? held.join(" + ") + " down" : "none down");
    set("rg", m.radioGroup);
    // and the robot half, on the cards that have one
    if (b) {
      set("ll", d3(readLightSensor(b, "L")) + " / " + d3(readLightSensor(b, "R")));
      set("ln", d3(readLineSensor(b, "L")) + " / " + d3(readLineSensor(b, "R")));
      set("sn", d3(readSonar(b)) + " cm");
      set("mo", d3(b.lm) + " / " + d3(b.rm));
      set("sp", d3((b.vl + b.vr) / 2) + " mm/s");
      set("ba", d3(b.batt) + "%");
    }
    for (let i = 0; i < c.leds.length; i++) {
      const col = b ? b.pixels[i] : null;
      if (!c.leds[i]) continue;
      c.leds[i].style.background = col && col !== "#000000" ? col : "#2a2f3c";
      c.leds[i].style.boxShadow = col && col !== "#000000" ? "0 0 5px " + col : "none";
    }
  }
}


/* start up: the editor, as wide as the window allows.
   One press of "Normal size" brings the instruments and the log back. */
addArrows();          // the room starts empty and dark; add what you need
document.body.classList.add("wide");          // the blocks get the room by default
el("wide").classList.add("on");
draw();

(async () => {
  try {
    await openDb();
  } catch (e) {
    say("SQLite did not load (" + e.message + "), so the bench will not be remembered this time", "err");
  }
  if (!loadAll()) {
    world.mbits = [makeDevice("bitbot", "Bit:Bot 1", COLOURS[0], 1000, 1500)];
    syncBots();
    saveAll();
  }
  placeEveryone();
  refreshViewButtons();
  renderDevices();
  draw(); instruments();
  startEditor();
})();
