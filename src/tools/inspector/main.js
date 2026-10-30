/* The field inspector: a dev tool, not the gym.

   It exists because "the robot behaved oddly over there" is impossible to
   chase without seeing what the world actually says at that spot. So: pick a
   scene, see the light field as a heat map, drag a robot about and watch its
   shadow move, and click anywhere to read all six answers at that point.

   It is not the room renderer. The room gets drawn with p5 when the cards
   arrive; this is a ruler, and a ruler should be plain. */

import { bus } from "../../core/bus.js";
import { createRoom, ROOM } from "../../app/room.js";
import { SCENE_NAMES } from "../../world/scenes/index.js";
import { normalFrom, UP } from "../../world/fields/light.js";

const EYE_TILT = 0.80, EYE_Z = 42, SONAR_FWD = 62;
const GRID = 110;                       // heat map samples across the room

const room = createRoom({ bus });
const el = id => document.getElementById(id);
const canvas = el("room"), ctx = canvas.getContext("2d");
const heat = document.createElement("canvas");
heat.width = heat.height = GRID;
const hctx = heat.getContext("2d");

let field = "light";
let probe = null;
let dragging = null;
let heatDirty = true;
let snap = room.snapshot();

/* ---- the heat map ------------------------------------------------------- */

/* Light spans decades, so a linear ramp is all white in the middle of the
   room and black everywhere else. Log it. */
function paintHeat() {
  const env = room.env();
  const n = GRID, img = hctx.createImageData(n, n);
  const step = snap.size / n;
  const vals = new Float64Array(n * n);
  let max = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const p = { x: (i + 0.5) * step, y: (j + 0.5) * step };
      const v = field === "light" ? env.lightAt(p, { z: EYE_Z, normal: UP })
              : field === "sound" ? env.soundAt(p)
              : 0;
      vals[j * n + i] = v;
      if (v > max) max = v;
    }
  }
  const top = Math.log1p(max) || 1;
  for (let k = 0; k < n * n; k++) {
    const t = Math.min(1, Math.log1p(vals[k]) / top);
    const c = ramp(t);
    img.data[k * 4] = c[0]; img.data[k * 4 + 1] = c[1];
    img.data[k * 4 + 2] = c[2]; img.data[k * 4 + 3] = 255;
  }
  hctx.putImageData(img, 0, 0);
  el("scale").textContent = max.toFixed(2);
  heatDirty = false;
}

/* dark blue -> teal -> amber -> near white */
function ramp(t) {
  const stops = [[12, 18, 40], [20, 70, 110], [30, 150, 140], [230, 170, 50], [255, 245, 220]];
  const x = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  return stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
}

/* ---- drawing ------------------------------------------------------------ */

const toScreen = p => ({ x: p.x / snap.size * canvas.width, y: p.y / snap.size * canvas.height });
const toRoom = (sx, sy) => ({ x: sx / canvas.width * snap.size, y: sy / canvas.height * snap.size });

function draw() {
  const S = canvas.width;
  ctx.clearRect(0, 0, S, S);

  if (field === "none") { ctx.fillStyle = "#11141c"; ctx.fillRect(0, 0, S, S); }
  else { ctx.imageSmoothingEnabled = true; ctx.drawImage(heat, 0, 0, S, S); }

  const k = S / snap.size;

  /* lines on the floor */
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  for (const l of snap.lines) {
    ctx.lineWidth = Math.max(1, l.half * 2 * k);
    ctx.beginPath();
    ctx.moveTo(l.a.x * k, l.a.y * k);
    ctx.lineTo(l.b.x * k, l.b.y * k);
    ctx.stroke();
  }

  /* furniture, with its name */
  ctx.lineWidth = 1;
  for (const bx of snap.furniture) {
    ctx.save();
    ctx.translate((bx.x + bx.w / 2) * k, (bx.y + bx.h / 2) * k);
    ctx.rotate(bx.rot || 0);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(-bx.w / 2 * k, -bx.h / 2 * k, bx.w * k, bx.h * k);
    ctx.strokeRect(-bx.w / 2 * k, -bx.h / 2 * k, bx.w * k, bx.h * k);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(bx.name, 0, 4);
    ctx.restore();
  }

  /* lamps and speakers */
  for (const L of snap.lamps) {
    const p = toScreen(L);
    ctx.beginPath(); ctx.arc(p.x, p.y, L.kind === "ceiling" ? 9 : 6, 0, 7);
    ctx.fillStyle = L.on ? "#ffd166" : "#555b6e"; ctx.fill();
    ctx.strokeStyle = "#1b1e28"; ctx.stroke();
  }
  for (const S2 of snap.speakers) {
    const p = toScreen(S2);
    ctx.fillStyle = S2.playing ? "#4cc9f0" : "#555b6e";
    ctx.fillRect(p.x - 6, p.y - 6, 12, 12);
  }

  /* which way the sun lies */
  if (snap.sun) {
    const a = snap.sun.azimuth * Math.PI / 180;
    ctx.save();
    ctx.translate(S - 42, 42);
    ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(Math.sin(a) * 22, -Math.cos(a) * 22); ctx.stroke();
    ctx.beginPath(); ctx.arc(Math.sin(a) * 22, -Math.cos(a) * 22, 5, 0, 7);
    ctx.fillStyle = "#ffd166"; ctx.fill();
    ctx.restore();
  }

  /* robots, their sonar cone and their nose */
  for (const b of snap.bodies) {
    const p = toScreen(b);
    const nose = { x: b.x + Math.cos(b.h) * SONAR_FWD, y: b.y + Math.sin(b.h) * SONAR_FWD };
    const d = room.env().raycast(nose, b.h, { self: b.id });
    if (isFinite(d)) {
      const hit = toScreen({ x: nose.x + Math.cos(b.h) * d, y: nose.y + Math.sin(b.h) * d });
      const n = toScreen(nose);
      ctx.strokeStyle = "rgba(255,90,90,0.9)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(hit.x, hit.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(hit.x, hit.y, 3, 0, 7); ctx.fillStyle = "#ff5a5a"; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, b.r * k, 0, 7);
    ctx.fillStyle = b.held ? "rgba(255,209,102,0.55)" : "rgba(91,192,235,0.55)";
    ctx.fill();
    ctx.strokeStyle = "#e8eaf0"; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(b.h) * b.r * k, p.y + Math.sin(b.h) * b.r * k);
    ctx.stroke();
    ctx.fillStyle = "#e8eaf0"; ctx.font = "bold 11px system-ui"; ctx.textAlign = "center";
    ctx.fillText(String(b.id), p.x, p.y - b.r * k - 5);
  }

  /* the probe */
  if (probe) {
    const p = toScreen(probe);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x - 9, p.y); ctx.lineTo(p.x + 9, p.y);
    ctx.moveTo(p.x, p.y - 9); ctx.lineTo(p.x, p.y + 9); ctx.stroke();
  }
}

/* ---- the readout -------------------------------------------------------- */

function readout() {
  if (!probe) { el("probe").textContent = "click the room to read the six questions there"; return; }
  const env = room.env();
  const at = { x: Math.round(probe.x), y: Math.round(probe.y) };
  const m = env.mediumAt();
  const s = env.surfaceAt(at);
  const ray = env.raycast(at, 0);
  const lightUp = env.lightAt(at, { z: EYE_Z, normal: UP });
  const lightL = env.lightAt(at, { z: EYE_Z, normal: normalFrom(-0.44, EYE_TILT) });
  const lightR = env.lightAt(at, { z: EYE_Z, normal: normalFrom(0.44, EYE_TILT) });
  const ldr = v => Math.round(1023 * Math.pow(v / (v + 3), 0.85));
  const radio = env.radioBetween(at, { x: 0, y: 0 });
  el("probe").innerHTML = [
    ["at", at.x + ", " + at.y + " mm"],
    ["raycast east", isFinite(ray) ? Math.round(ray) + " mm" : "nothing (glancing or open)"],
    ["light, facing up", lightUp.toFixed(3) + " units"],
    ["light, two eyes", lightL.toFixed(3) + " / " + lightR.toFixed(3)],
    ["an LDR would read", ldr(lightL) + " / " + ldr(lightR)],
    ["sound", env.soundAt(at).toFixed(1)],
    ["surface", s.material + (s.dark ? ", on the line" : "") + ", mu " + s.mu],
    ["air", m.airTemp + " C, sound " + m.speedOfSound.toFixed(1) + " m/s, sonar x" + m.sonarScale.toFixed(4)],
    ["radio to the corner", radio.strength + " dBm"]
  ].map(([k, v]) => "<b>" + k + "</b><span>" + v + "</span>").join("");
}

/* ---- controls ----------------------------------------------------------- */

function buildControls() {
  const box = el("switches");
  box.innerHTML = "";
  snap.lamps.forEach((L, i) => {
    const b = document.createElement("button");
    b.textContent = (L.kind === "ceiling" ? "ceiling" : "lamp") + " " + (i + 1);
    b.className = L.on ? "on" : "";
    /* A click is an INTENT. It holds no state and changes nothing itself: the
       room changes, and the button redraws from the next snapshot. */
    b.onclick = () => bus.post(ROOM, { cmd: "lamp", id: i });
    box.appendChild(b);
  });
  snap.speakers.forEach((S, i) => {
    const b = document.createElement("button");
    b.textContent = "speaker " + (i + 1);
    b.className = S.playing ? "on" : "";
    b.onclick = () => bus.post(ROOM, { cmd: "speaker", id: i });
    box.appendChild(b);
  });
}

el("scene").innerHTML = SCENE_NAMES.map(n => '<option value="' + n + '">' + n + "</option>").join("");
el("scene").onchange = e => {
  bus.post(ROOM, { cmd: "scene", name: e.target.value });
  probe = null;
};
el("field").onchange = e => { field = e.target.value; heatDirty = true; };
el("addbot").onclick = () => bus.post(ROOM, { cmd: "add" });

/* dragging a robot: hold, then one coalesced place per frame, then drop */
const bodyUnder = p => snap.bodies.find(b => Math.hypot(b.x - p.x, b.y - p.y) <= b.r * 1.4);
canvas.addEventListener("pointerdown", e => {
  const r = canvas.getBoundingClientRect();
  const p = toRoom(e.clientX - r.left, e.clientY - r.top);
  const b = bodyUnder(p);
  if (b) { dragging = b.id; bus.post(ROOM, { cmd: "hold", id: b.id }); canvas.setPointerCapture(e.pointerId); }
  else { probe = p; }
});
canvas.addEventListener("pointermove", e => {
  if (dragging == null) return;
  const r = canvas.getBoundingClientRect();
  const p = toRoom(e.clientX - r.left, e.clientY - r.top);
  bus.post(ROOM, { cmd: "place", id: dragging, x: p.x, y: p.y }, { coalesce: "place:" + dragging });
});
canvas.addEventListener("pointerup", () => {
  if (dragging == null) return;
  bus.post(ROOM, { cmd: "drop", id: dragging });
  dragging = null;
});
addEventListener("keydown", e => {
  if (!snap.bodies.length) return;
  const b = snap.bodies[snap.bodies.length - 1];
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    bus.post(ROOM, { cmd: "place", id: b.id, x: b.x, y: b.y,
                     heading: b.h + (e.key === "ArrowLeft" ? -0.15 : 0.15) });
  }
});

/* ---- the loop ----------------------------------------------------------- */

let lastSig = "";
function frame() {
  room.tick();
  snap = room.snapshot();

  /* Repaint the heat map only when something that makes light or sound has
     actually moved - it is 12,000 samples, and a frame is 16 ms. */
  const sig = JSON.stringify([field, snap.scene, snap.lamps.map(l => l.on),
                              snap.speakers.map(s => s.playing),
                              snap.bodies.map(b => [Math.round(b.x), Math.round(b.y)])]);
  if (heatDirty || sig !== lastSig) { lastSig = sig; if (field !== "none") paintHeat(); }

  buildControls();
  draw();
  readout();
  el("status").textContent = snap.name + "  -  " + snap.size + " mm  -  " + snap.bodies.length +
    " robot(s)  -  t " + (snap.t / 1000).toFixed(1) + " s  -  seed " + snap.seed;
  const p = room.problems();
  el("problems").textContent = p.length ? p.length + " message problem(s): " + p[p.length - 1].what : "";
  requestAnimationFrame(frame);
}
bus.post(ROOM, { cmd: "add" });
frame();
