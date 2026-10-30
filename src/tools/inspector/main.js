/* The room, plus a ruler.

   The canvas is the gym's own room renderer - the same floor, the same light
   multiplied over it, the same furniture art. The panel beside it is the dev
   part: switch a lamp, drop a robot in, and click anywhere to read all six
   questions the world can answer at that spot.

   Every control here posts an intent and holds no state of its own. The
   buttons redraw from the next snapshot, which is the rule the whole UI is
   going to follow. */

import { bus } from "../../core/bus.js";
import { createRoom, ROOM } from "../../app/room.js";
import { SCENE_NAMES } from "../../world/scenes/index.js";
import { createRoomRenderer } from "../../room/renderer.js";
import { normalFrom, UP } from "../../world/fields/light.js";

const EYE_TILT = 0.80, EYE_Z = 42, SONAR_FWD = 62;

const room = createRoom({ bus });
const el = id => document.getElementById(id);
const canvas = el("room");
const renderer = createRoomRenderer(canvas);

let probe = null;
let dragging = null;
let showRays = true;
let snap = room.snapshot();

/* ---- the extras the renderer does not draw ------------------------------ */

function overlay() {
  const ctx = canvas.getContext("2d");
  const S = canvas.width / snap.size;

  if (showRays) {
    for (const b of snap.bodies) {
      const nose = { x: b.x + Math.cos(b.h) * SONAR_FWD, y: b.y + Math.sin(b.h) * SONAR_FWD };
      const d = room.env().raycast(nose, b.h, { self: b.id });
      if (!isFinite(d)) continue;
      ctx.strokeStyle = "rgba(255,120,110,0.85)"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(nose.x * S, nose.y * S);
      ctx.lineTo((nose.x + Math.cos(b.h) * d) * S, (nose.y + Math.sin(b.h) * d) * S);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc((nose.x + Math.cos(b.h) * d) * S, (nose.y + Math.sin(b.h) * d) * S, 3, 0, 7);
      ctx.fillStyle = "#ff786e"; ctx.fill();
      ctx.fillStyle = "rgba(255,180,170,0.95)";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(Math.round(d / 10) + " cm", (nose.x + Math.cos(b.h) * d / 2) * S + 6,
                   (nose.y + Math.sin(b.h) * d / 2) * S - 4);
    }
  }

  if (probe) {
    const p = { x: probe.x * S, y: probe.y * S };
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x - 10, p.y); ctx.lineTo(p.x + 10, p.y);
    ctx.moveTo(p.x, p.y - 10); ctx.lineTo(p.x, p.y + 10);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.stroke();
  }
}

/* ---- the readout -------------------------------------------------------- */

function readout() {
  if (!probe) { el("probe").innerHTML = "<span>click the room to read the six questions there</span>"; return; }
  const env = room.env();
  const at = { x: Math.round(probe.x), y: Math.round(probe.y) };
  const m = env.mediumAt(), s = env.surfaceAt(at);
  const ray = env.raycast(at, 0);
  const up = env.lightAt(at, { z: EYE_Z, normal: UP });
  const L = env.lightAt(at, { z: EYE_Z, normal: normalFrom(-0.44, EYE_TILT) });
  const R = env.lightAt(at, { z: EYE_Z, normal: normalFrom(0.44, EYE_TILT) });
  const ldr = v => Math.round(1023 * Math.pow(v / (v + 3), 0.85));
  el("probe").innerHTML = [
    ["at", at.x + ", " + at.y + " mm"],
    ["east to a wall", isFinite(ray) ? Math.round(ray) + " mm" : "nothing: glancing or open"],
    ["light, lying flat", up.toFixed(3) + " units"],
    ["two Bit:Bot eyes", L.toFixed(3) + " / " + R.toFixed(3)],
    ["an LDR would read", ldr(L) + " / " + ldr(R)],
    ["sound", env.soundAt(at).toFixed(1)],
    ["floor", s.material + (s.dark ? ", on the line" : "") + ", grip " + s.mu],
    ["air", m.airTemp + " C, " + m.speedOfSound.toFixed(1) + " m/s, sonar x" + m.sonarScale.toFixed(4)],
    ["radio to the corner", env.radioBetween(at, { x: 0, y: 0 }).strength + " dBm"]
  ].map(([k, v]) => "<b>" + k + "</b><span>" + v + "</span>").join("");
}

/* ---- controls: each one posts an intent and remembers nothing ----------- */

let switchSig = "";
function buildSwitches() {
  const sig = JSON.stringify([snap.scene, snap.lamps.map(l => l.on), snap.speakers.map(s => s.playing)]);
  if (sig === switchSig) return;
  switchSig = sig;
  const box = el("switches");
  box.innerHTML = "";
  snap.lamps.forEach((L, i) => {
    const b = document.createElement("button");
    b.textContent = (L.kind === "ceiling" ? "ceiling light " : "lamp ") + (i + 1);
    b.className = L.on ? "on" : "";
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
  if (!snap.lamps.length && !snap.speakers.length) {
    box.innerHTML = '<span class="hint">nothing to switch in this scene' +
                    (snap.sun ? " - the sun is doing the lighting" : "") + "</span>";
  }
}

el("scene").innerHTML = SCENE_NAMES.map(n => '<option value="' + n + '">' + n + "</option>").join("");
el("scene").onchange = e => { bus.post(ROOM, { cmd: "scene", name: e.target.value }); probe = null; };
el("addbot").onclick = () => bus.post(ROOM, { cmd: "add" });
el("rays").onchange = e => { showRays = e.target.checked; };

const bodyUnder = p => snap.bodies.find(b => Math.hypot(b.x - p.x, b.y - p.y) <= b.r * 1.4);
const where = e => {
  const r = canvas.getBoundingClientRect();
  return renderer.toRoom((e.clientX - r.left) / r.width * canvas.width,
                         (e.clientY - r.top) / r.height * canvas.height, snap.size);
};
canvas.addEventListener("pointerdown", e => {
  const p = where(e), b = bodyUnder(p);
  if (b) { dragging = b.id; bus.post(ROOM, { cmd: "hold", id: b.id }); canvas.setPointerCapture(e.pointerId); }
  else probe = p;
});
canvas.addEventListener("pointermove", e => {
  if (dragging == null) return;
  const p = where(e);
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
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  bus.post(ROOM, { cmd: "place", id: b.id, x: b.x, y: b.y,
                   heading: b.h + (e.key === "ArrowLeft" ? -0.15 : 0.15) });
});

/* ---- the loop ----------------------------------------------------------- */

/* One bad frame must not end the loop. The old gym had no try here: a single
   throw killed the animation for good while everything still claimed to be
   running, and the only symptom was that Play quietly did nothing. */
let moaned = false;
function frame() {
  try {
    room.tick();
    snap = room.snapshot();
    renderer.draw(snap, room.lightMap(renderer.LMAP_N));
    overlay();
    buildSwitches();
    readout();
    el("status").textContent = snap.name + "  -  " + snap.size + " mm  -  " +
      snap.bodies.length + " robot(s)  -  t " + (snap.t / 1000).toFixed(1) + " s  -  seed " + snap.seed;
    const p = room.problems();
    el("problems").textContent = p.length ? p.length + " message problem(s), last: " + p[p.length - 1].what : "";
  } catch (e) {
    if (!moaned) { moaned = true; el("problems").textContent = "something went wrong drawing: " + e.message; }
    console.error(e);
  }
  requestAnimationFrame(frame);
}
bus.post(ROOM, { cmd: "add" });
frame();
