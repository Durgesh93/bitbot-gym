/* ========================================================================
   9. The room's controls
   ======================================================================== */
let tool = "move", dragging = null;

function canvasToMm(ev) {
  const r = cv.getBoundingClientRect();
  return { x: (ev.clientX - r.left) / r.width * ROOM, y: (ev.clientY - r.top) / r.height * ROOM };
}
cv.addEventListener("pointerdown", ev => {
  try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* some pointers cannot be captured */ }
  const p = canvasToMm(ev);
  if (tool === "pen" || tool === "erase") { dragging = { kind: tool, last: p }; paint(p, p); return; }
  // the red x and the blue turn handle on every board, and the x on every lamp
  for (const m of world.mbits) {
    const H = devHandles(m);
    if (Math.hypot(p.x - H.del.x, p.y - H.del.y) < 44) { removeDevice(m); return; }
    if (Math.hypot(p.x - H.turn.x, p.y - H.turn.y) < 44) { dragging = { kind: "spinAny", place: placeOf(m) }; return; }
  }
  for (const L of world.lamps) {
    const H = lampHandles(L);
    if (Math.hypot(p.x - H.del.x, p.y - H.del.y) < 44) {
      world.lamps = world.lamps.filter(o => o !== L);
      shadowsStale = true;
      say("the " + L.kind + " light taken out of the room", "say");
      draw(); instruments();
      return;
    }
  }
  for (const b of world.bots) {
    const nose = { x: b.x + Math.cos(b.h) * 75, y: b.y + Math.sin(b.h) * 75 };
    if (Math.hypot(p.x - nose.x, p.y - nose.y) < 45) { b.held = true; dragging = { kind: "spin", bot: b }; return; }
    if (Math.hypot(p.x - b.x, p.y - b.y) < BOT.radius + 10) { b.held = true; dragging = { kind: "bot", bot: b }; return; }
  }
  for (const m of world.mbits) {
    if (botOf(m)) continue;
    if (Math.abs(p.x - m.x) < 40 && Math.abs(p.y - m.y) < 34) { dragging = { kind: "board", m: m }; return; }
  }
  for (const L of world.lamps) {
    if (Math.hypot(p.x - L.x, p.y - L.y) < 95) { dragging = { kind: "torch", lamp: L, moved: false }; return; }
  }
  for (let i = world.boxes.length - 1; i >= 0; i--) {
    const bx = world.boxes[i];
    const H = handlesOf(bx);
    if (Math.hypot(p.x - H.del.x, p.y - H.del.y) < 48) {          // take it away
      world.boxes = world.boxes.filter(o => o !== bx);
      shadowsStale = true;
      say((bx.name || "it") + " taken out of the room", "say");
      draw(); instruments();
      return;
    }
    if (Math.hypot(p.x - H.turn.x, p.y - H.turn.y) < 48) { dragging = { kind: "turn", box: bx }; return; }
    if (Math.hypot(p.x - H.copy.x, p.y - H.copy.y) < 48) {
      const twin = Object.assign({}, bx);
      twin.x = clamp(bx.x + 110, 0, ROOM - bx.w);
      twin.y = clamp(bx.y + 110, 0, ROOM - bx.h);
      world.boxes.push(twin);
      shadowsStale = true;
      say("another " + (twin.name || "one") + " - drag it where you want it", "say");
      dragging = { kind: "box", box: twin, dx: p.x - twin.x, dy: p.y - twin.y };
      return;
    }
    if (objContains(bx, p)) { dragging = { kind: "box", box: bx, dx: p.x - bx.x, dy: p.y - bx.y, moved: false }; return; }
  }
});
cv.addEventListener("pointermove", ev => {
  if (!dragging) return;
  const p = canvasToMm(ev);
  if (dragging.kind === "pen" || dragging.kind === "erase") { paint(dragging.last, p); dragging.last = p; }
  else if (dragging.kind === "torch") {
    if (Math.hypot(p.x - dragging.lamp.x, p.y - dragging.lamp.y) > 12) dragging.moved = true;
    dragging.lamp.x = p.x; dragging.lamp.y = p.y;
  }
  else if (dragging.kind === "bot") { dragging.bot.x = p.x; dragging.bot.y = p.y; dragging.bot.trail.length = 0; }
  else if (dragging.kind === "spin") { dragging.bot.h = Math.atan2(p.y - dragging.bot.y, p.x - dragging.bot.x); }
  else if (dragging.kind === "spinAny") {
    const q = dragging.place;
    q.h = Math.atan2(p.y - q.y, p.x - q.x);
  }
  else if (dragging.kind === "board") { dragging.m.x = p.x; dragging.m.y = p.y; }
  else if (dragging.kind === "box") {
    const nx = p.x - dragging.dx, ny = p.y - dragging.dy;
    if (Math.hypot(nx - dragging.box.x, ny - dragging.box.y) > 6) dragging.moved = true;
    dragging.box.x = nx; dragging.box.y = ny;
    shadowsStale = true;
  }
  else if (dragging.kind === "turn") {
    const o = objCentre(dragging.box);
    dragging.box.rot = Math.atan2(p.y - o.y, p.x - o.x);
    shadowsStale = true;
  }
  if (!running) { draw(); instruments(); }
});
cv.addEventListener("pointerup", () => {
  if (dragging) {
    if (dragging.kind === "pen" || dragging.kind === "erase") refreshFloor();
    if (dragging.bot) dragging.bot.held = false;
    if (dragging.lamp && !dragging.moved) dragging.lamp.on = !dragging.lamp.on;   // a tap switches it
    if (dragging.kind === "box" && dragging.box.speaker && !dragging.moved) {
      dragging.box.playing = !dragging.box.playing;
      say(dragging.box.playing ? "the speaker is playing" : "the speaker is off", "say");
    }
  }
  dragging = null;
  draw();
});

function paint(a, b) {
  fctx.globalCompositeOperation = tool === "erase" ? "destination-out" : "source-over";
  fctx.strokeStyle = "rgba(10,10,12,1)";
  fctx.lineWidth = (tool === "erase" ? 90 : 24) / MM_PER_FLOORPX;
  fctx.lineCap = "round"; fctx.lineJoin = "round";
  fctx.beginPath();
  fctx.moveTo(a.x / MM_PER_FLOORPX, a.y / MM_PER_FLOORPX);
  fctx.lineTo(b.x / MM_PER_FLOORPX, b.y / MM_PER_FLOORPX);
  fctx.stroke();
  fctx.globalCompositeOperation = "source-over";
  refreshFloor();
  if (!running) draw();
}

/* the three sensor layers are switches, not a choice: any of them can be on
   together, because a robot is reading all three at once anyway */
function refreshViewButtons() {
  const any = world.show.light || world.show.magnetic || world.show.sonar;
  document.querySelectorAll("[data-view]").forEach(b => {
    const k = b.dataset.view;
    b.classList.toggle("on", k === "plain" ? !any : !!world.show[k]);
  });
}
document.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => {
  const k = btn.dataset.view;
  if (k === "plain") world.show = { light: false, magnetic: false, sonar: false };
  else world.show[k] = !world.show[k];
  refreshViewButtons();
  draw();
}));
document.querySelectorAll("[data-tool]").forEach(btn => btn.addEventListener("click", () => {
  tool = btn.dataset.tool;
  document.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("on", b === btn));
}));
el("clearLine").addEventListener("click", () => { fctx.clearRect(0, 0, FLOOR_N, FLOOR_N); refreshFloor(); draw(); });
/* put something down, then say what it is - the name decides its size,
   its height and how much light bounces off it */
function addObject() {
  const bx = { x: 0, y: 0, w: 10, h: 10 };
  nameObject(bx, "box");
  bx.unnamed = true;
  bx.name = "";
  bx.x = clamp(900 - bx.w / 2, 0, ROOM - bx.w);
  bx.y = clamp(1150 + (world.boxes.length % 3) * 90, 0, ROOM - bx.h);
  world.boxes.push(bx);
  draw();
  openNamer(bx);
}

let namingBox = null;
function openNamer(bx) {
  namingBox = bx;
  const inp = el("objName"), r = cv.getBoundingClientRect();
  inp.style.left = Math.round(clamp(r.left + (bx.x + bx.w / 2) / ROOM * r.width - 90, 8, innerWidth - 196)) + "px";
  inp.style.top = Math.round(clamp(r.top + (bx.y + bx.h / 2) / ROOM * r.height - 16, 8, innerHeight - 44)) + "px";
  inp.value = bx.unnamed ? "" : (bx.name || "");
  inp.hidden = false;
  inp.focus();
  inp.select();
}
function closeNamer(apply) {
  const inp = el("objName"), bx = namingBox;
  const typed = inp.value.trim();
  /* Forget what we are naming FIRST. Hiding the box takes the cursor out of it,
     which fires blur there and then, and blur calls this very function again -
     so anything done before this line gets done twice, and you got two lamps. */
  namingBox = null;
  inp.hidden = true;
  if (apply && bx) {
    if (!typed) {                                   // nothing typed: take it away again
      world.boxes = world.boxes.filter(o => o !== bx);
      shadowsStale = true;
      if (!bx.unnamed) say("taken out of the room", "say");
    } else {
      const kind = lightKind(typed);
      if (kind) {                                   // it is a light, not a thing
        world.boxes = world.boxes.filter(o => o !== bx);
        world.lamps.push({ x: bx.x + bx.w / 2, y: bx.y + bx.h / 2, on: false, kind: kind });
        shadowsStale = true;
        say("a " + kind + " light put in the room, switched off - tap the bulb to light it", "say");
      } else {
        nameObject(bx, typed);
        bx.unnamed = false;
        say(bx.name + " put in the room - it bounces back " +
            Math.round(bx.reflect * 100) + "% of the light that lands on it", "say");
      }
    }
  }
  draw(); instruments();
}
el("objName").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); closeNamer(true); }
  if (e.key === "Escape") { e.preventDefault(); closeNamer(false); }
});
el("objName").addEventListener("blur", () => { if (namingBox) closeNamer(true); });
el("addBox").addEventListener("click", addObject);

// double click anything in the room to rename it, and change what it is made of
cv.addEventListener("dblclick", ev => {
  const p = canvasToMm(ev);
  for (let i = world.boxes.length - 1; i >= 0; i--) {
    if (objContains(world.boxes[i], p)) { openNamer(world.boxes[i]); return; }
  }
});

(function fillObjectList() {
  const dl = el("objList");
  for (const k in CATALOGUE) {
    const o = document.createElement("option");
    o.value = k;
    dl.appendChild(o);
  }
})();
el("furnish").addEventListener("click", () => { furnish(); draw(); instruments(); });
el("clearBoxes").addEventListener("click", () => { world.boxes.length = 0; draw(); instruments(); });
el("trailBtn").addEventListener("click", e => {
  world.showTrail = !world.showTrail;
  for (const b of world.bots) b.trail.length = 0;
  e.target.classList.toggle("on", world.showTrail); draw();
});
el("resetBot").addEventListener("click", () => { placeEveryone(); draw(); instruments(); });
el("s-top").addEventListener("input", e => { cfg.top = +e.target.value; el("v-top").textContent = cfg.top; });
el("s-dead").addEventListener("input", e => { cfg.dead = +e.target.value; el("v-dead").textContent = cfg.dead; });
el("s-torch").addEventListener("input", e => { cfg.torch = +e.target.value; el("v-torch").textContent = cfg.torch; if (!running) { draw(); instruments(); } });
el("s-grip").addEventListener("input", e => { PHYS.tyreGrip = +e.target.value; el("v-grip").textContent = (+e.target.value).toFixed(2); });
el("s-mis").addEventListener("input", e => { PHYS.mismatch = +e.target.value; el("v-mis").textContent = e.target.value; });
el("s-batt").addEventListener("input", e => {
  const b = botOf(mbit());
  if (b) b.batt = +e.target.value;
  el("v-batt").textContent = e.target.value;
});
el("air").addEventListener("change", e => { PHYS.airOn = e.target.checked; });
document.querySelectorAll("[data-floor]").forEach(btn => btn.addEventListener("click", () => {
  const f = FLOORS[btn.dataset.floor];
  PHYS.floor = f.name; PHYS.tyreGrip = f.mu; PHYS.roll = f.roll; cfg.dead = f.dead;
  el("s-grip").value = f.mu; el("v-grip").textContent = f.mu.toFixed(2);
  el("s-dead").value = f.dead; el("v-dead").textContent = f.dead;
  document.querySelectorAll("[data-floor]").forEach(b => b.classList.toggle("on", b === btn));
  say("floor: " + f.name + " - grip " + f.mu + ", it takes " + f.dead + "% before the wheels bite");
}));
el("invert").addEventListener("click", e => {
  cfg.invert = !cfg.invert;
  e.target.textContent = "Light sensors: higher = " + (cfg.invert ? "darker" : "brighter");
  e.target.classList.toggle("on", cfg.invert);
  if (!running) instruments();
});
el("wide").addEventListener("click", e => {
  document.body.classList.toggle("wide");
  const big = document.body.classList.contains("wide");
  e.target.classList.toggle("on", big);
  e.target.textContent = big ? "Small blocks" : "Big blocks";
});
el("stopBtn").addEventListener("click", () => stopAll(false));

