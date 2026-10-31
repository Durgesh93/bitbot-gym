/* The room, drawn the way the gym has always drawn it.

   The floor is flat grey, the light is MULTIPLIED over it so a corner no lamp
   reaches goes properly dark, and then the furniture sits on top with its own
   little piece of art. That multiply is the whole trick: shadows are not
   painted, they are places the light map never lit.

   This file draws and nothing else. It is handed a snapshot and a square of
   light samples, both plain data, and it never reaches into the world - so it
   can be pointed at a recorded snapshot, or at one that arrived from a Worker,
   and it cannot be the thing that corrupts the model.

   The art for each kind of thing is lifted straight out of the single-file
   gym, because the teacher liked how the room looked and it should not
   change just because the code moved house. */

/* Magnetic north over southern Norway: up the screen, tilted 3 degrees east.
   It lives here only until the compass arrives and brings a magnetic field
   with it. */
import { clamp } from "../core/util.js";

const MAG_NORTH = -Math.PI / 2 + 3 * Math.PI / 180;
const FLOOR = 0.1;             // how dark the PICTURE may get; see paintLight

let ctx = null;                // the canvas being drawn on, and mm -> px
let S = 1;                     // (module-level so the ported art can see them)

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function shade(hex, amount) {
  const n = parseInt(String(hex).slice(1), 16);
  const f = c => clamp(Math.round(c + amount * 255), 0, 255);
  return "rgb(" + f((n >> 16) & 255) + "," + f((n >> 8) & 255) + "," + f(n & 255) + ")";
}

function drawThingDetail(b) {
  const w = b.w * S, h = b.h * S, x = -w / 2, y = -h / 2;
  const name = (b.name || "").toLowerCase();
  const fill = b.fill || "#50596b";
  const dark = shade(fill, -0.14), light = shade(fill, 0.16);
  const tall = h >= w;                                    // which way it is facing
  ctx.save();

  if (b.speaker || name.includes("speaker")) {
    ctx.fillStyle = dark;                                 // the cabinet
    roundRect(x + w * 0.06, y + h * 0.06, w * 0.88, h * 0.88, 5 * S); ctx.fill();
    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.26;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7);            // the big cone
    ctx.fillStyle = b.playing ? "#7a6a3a" : "#3a3e48"; ctx.fill();
    ctx.strokeStyle = light; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.35, 0, 7);     // and the dome in the middle
    ctx.fillStyle = b.playing ? "#ffe9a3" : "#555a66"; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, y + h * 0.17, Math.min(w, h) * 0.09, 0, 7);   // the tweeter
    ctx.fillStyle = "#3a3e48"; ctx.fill();
    if (b.playing) {                                      // sound coming out of it
      ctx.strokeStyle = "rgba(255,233,163,0.75)"; ctx.lineWidth = 1.6;
      for (let k = 1; k <= 3; k++) {
        ctx.beginPath(); ctx.arc(cx, cy, r + k * 7 * S, -0.9, 0.9); ctx.stroke();
      }
    }

  } else if (name.includes("sofa")) {
    ctx.fillStyle = dark;                                 // the back
    if (tall) roundRect(x, y, w * 0.3, h, 6 * S); else roundRect(x, y, w, h * 0.3, 6 * S);
    ctx.fill();
    ctx.fillStyle = light;                                // two arms
    if (tall) { ctx.fillRect(x + w * 0.3, y, w * 0.7, h * 0.16); ctx.fillRect(x + w * 0.3, y + h * 0.84, w * 0.7, h * 0.16); }
    else { ctx.fillRect(x, y + h * 0.3, w * 0.16, h * 0.7); ctx.fillRect(x + w * 0.84, y + h * 0.3, w * 0.16, h * 0.7); }
    ctx.strokeStyle = dark; ctx.lineWidth = 1.2;          // the seat cushions
    ctx.beginPath();
    if (tall) { ctx.moveTo(x + w * 0.3, y + h / 2); ctx.lineTo(x + w, y + h / 2); }
    else { ctx.moveTo(x + w / 2, y + h * 0.3); ctx.lineTo(x + w / 2, y + h); }
    ctx.stroke();

  } else if (name.includes("table") || name.includes("desk")) {
    ctx.fillStyle = dark;                                 // four legs under the top
    const r = Math.max(2, 5 * S), i = 7 * S;
    for (const [lx, ly] of [[x + i, y + i], [x + w - i, y + i], [x + i, y + h - i], [x + w - i, y + h - i]]) {
      ctx.beginPath(); ctx.arc(lx, ly, r, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = light; ctx.lineWidth = 1.4;
    roundRect(x + w * 0.12, y + h * 0.16, w * 0.76, h * 0.68, 4 * S); ctx.stroke();

  } else if (name.includes("chair") || name.includes("stool")) {
    ctx.fillStyle = dark;
    if (tall) ctx.fillRect(x, y, w, h * 0.26); else ctx.fillRect(x, y, w * 0.26, h);
    ctx.strokeStyle = light; ctx.lineWidth = 1.2;
    roundRect(x + w * 0.18, y + h * 0.3, w * 0.64, h * 0.6, 4 * S); ctx.stroke();

  } else if (name.includes("whiteboard") || name.includes("screen") || name.includes("mirror")) {
    ctx.strokeStyle = shade(fill, -0.35); ctx.lineWidth = 3;   // a frame
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = "rgba(255,255,255,0.5)";                   // a gleam
    ctx.fillRect(x + w * 0.08, y + h * 0.3, w * 0.3, h * 0.18);

  } else if (name.includes("bookcase") || name.includes("shelf") || name.includes("cupboard")) {
    ctx.strokeStyle = dark; ctx.lineWidth = 1.5;
    for (let k = 1; k < 4; k++) {
      ctx.beginPath();
      if (tall) { ctx.moveTo(x, y + h * k / 4); ctx.lineTo(x + w, y + h * k / 4); }
      else { ctx.moveTo(x + w * k / 4, y); ctx.lineTo(x + w * k / 4, y + h); }
      ctx.stroke();
    }

  } else if (name.includes("plant")) {
    ctx.fillStyle = shade(fill, 0.2);
    for (const [ox, oy, rr] of [[0.3, 0.32, 0.22], [0.68, 0.36, 0.2], [0.5, 0.66, 0.24]]) {
      ctx.beginPath(); ctx.arc(x + w * ox, y + h * oy, Math.min(w, h) * rr, 0, 7); ctx.fill();
    }

  } else if (name.includes("bin")) {
    ctx.strokeStyle = light; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.34, 0, 7); ctx.stroke();

  } else if (name.includes("backpack") || name.includes("bag")) {
    ctx.fillStyle = light;                                 // the flap
    roundRect(x + w * 0.12, y + h * 0.08, w * 0.76, h * 0.42, 5 * S); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.6;           // two straps
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y + h * 0.55); ctx.lineTo(x + w * 0.3, y + h * 0.95);
    ctx.moveTo(x + w * 0.7, y + h * 0.55); ctx.lineTo(x + w * 0.7, y + h * 0.95);
    ctx.stroke();

  } else if (name.includes("notebook") || name.includes("book") || name.includes("paper")) {
    ctx.strokeStyle = shade(fill, -0.3); ctx.lineWidth = 1.6;
    ctx.beginPath();                                       // the spine
    if (tall) { ctx.moveTo(x + w * 0.22, y); ctx.lineTo(x + w * 0.22, y + h); }
    else { ctx.moveTo(x, y + h * 0.22); ctx.lineTo(x + w, y + h * 0.22); }
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1;
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      if (tall) { ctx.moveTo(x + w * 0.35, y + h * k / 4); ctx.lineTo(x + w * 0.9, y + h * k / 4); }
      else { ctx.moveTo(x + w * k / 4, y + h * 0.35); ctx.lineTo(x + w * k / 4, y + h * 0.9); }
      ctx.stroke();
    }

  } else if (name.includes("pen") && !name.includes("pencil box")) {
    ctx.fillStyle = "#d8dde6";                             // a nib at one end
    if (tall) ctx.fillRect(x, y, w, h * 0.18); else ctx.fillRect(x, y, w * 0.18, h);

  } else if (name.includes("pencil")) {
    ctx.strokeStyle = light; ctx.lineWidth = 1.6;          // a lid
    ctx.beginPath();
    if (tall) { ctx.moveTo(x, y + h * 0.35); ctx.lineTo(x + w, y + h * 0.35); }
    else { ctx.moveTo(x + w * 0.35, y); ctx.lineTo(x + w * 0.35, y + h); }
    ctx.stroke();

  } else if (name.includes("projector")) {
    ctx.fillStyle = shade(fill, -0.3);                     // the lens
    ctx.beginPath(); ctx.arc(x + w * 0.74, y + h / 2, Math.min(w, h) * 0.22, 0, 7); ctx.fill();
    ctx.fillStyle = light;
    ctx.fillRect(x + w * 0.1, y + h * 0.2, w * 0.3, h * 0.2);

  } else if (name.includes("toy box") || name.includes("chest")) {
    ctx.strokeStyle = light; ctx.lineWidth = 1.8;          // a lid and a latch
    ctx.beginPath();
    if (tall) { ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); }
    else { ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); }
    ctx.stroke();
    ctx.fillStyle = "#d8b24a";
    ctx.fillRect(x + w / 2 - 4 * S, y + h / 2 - 4 * S, 8 * S, 8 * S);

  } else if (name.includes("wall")) {
    ctx.strokeStyle = shade(fill, -0.2); ctx.lineWidth = 1;   // brickwork
    for (let k = 1; k < 6; k++) {
      ctx.beginPath();
      if (tall) { ctx.moveTo(x, y + h * k / 6); ctx.lineTo(x + w, y + h * k / 6); }
      else { ctx.moveTo(x + w * k / 6, y); ctx.lineTo(x + w * k / 6, y + h); }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawBulb(L) {
  const x = L.x * S, y = L.y * S, r = 15 * S;
  if (L.on) {
    ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, 7);
    ctx.fillStyle = "rgba(255,230,150,0.18)"; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(x, y - r * 0.18, r, 0, 7);               // the glass
  ctx.fillStyle = L.on ? "#ffe9a3" : "#4a4738";
  ctx.fill();
  ctx.strokeStyle = L.on ? "#8a6f2a" : "#5a5a4a"; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = L.on ? "#b99a46" : "#3c3c33";                      // the screw cap
  ctx.fillRect(x - r * 0.45, y + r * 0.62, r * 0.9, r * 0.6);
  if (L.kind === "ceiling") {                                        // a shade, to say it hangs
    ctx.beginPath();
    ctx.moveTo(x - r * 1.5, y - r * 0.95);
    ctx.lineTo(x + r * 1.5, y - r * 0.95);
    ctx.lineTo(x + r * 0.7, y - r * 1.7);
    ctx.lineTo(x - r * 0.7, y - r * 1.7);
    ctx.closePath();
    ctx.fillStyle = L.on ? "#d9c48a" : "#4e4e45"; ctx.fill();
  }
}

/* The sun does not sit in the room, so it is drawn as a bearing in the
   corner: which way the light comes from, and how high it is. */
function drawSun(sun, w) {
  const a = sun.azimuth * Math.PI / 180, r = 22 * (w / 620);
  const cx = w - 46 * (w / 620), cy = w - 46 * (w / 620);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = "rgba(255,225,150,0.75)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(a) * r, -Math.cos(a) * r); ctx.stroke();
  ctx.beginPath(); ctx.arc(Math.sin(a) * r, -Math.cos(a) * r, 5 * (w / 620), 0, 7);
  ctx.fillStyle = "#ffe9a3"; ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = Math.round(11 * (w / 620)) + "px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(Math.round(sun.elevation) + "\u00b0 up", cx, cy + r + 14 * (w / 620));
  ctx.textAlign = "left";
}

/* A Bit:Bot from above: the chassis, two wheels and a nose so you can see
   which way it is pointing. The full one, with its FireLeds and its screen,
   arrives with the hardware layer. */
function drawBody(b) {
  const x = b.x * S, y = b.y * S, r = b.r * S;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(b.h || 0);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 8 * S; ctx.shadowOffsetY = 2 * S;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7);
  ctx.fillStyle = b.held ? "#6b6a52" : "#39414f"; ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#1b1f27";                                   // two wheels, across the middle
  ctx.fillRect(-r * 0.25, -r * 1.02, r * 0.5, r * 0.22);
  ctx.fillRect(-r * 0.25, r * 0.8, r * 0.5, r * 0.22);
  ctx.beginPath();                                             // the nose
  ctx.moveTo(r * 0.95, 0); ctx.lineTo(r * 0.3, -r * 0.42); ctx.lineTo(r * 0.3, r * 0.42);
  ctx.closePath();
  ctx.fillStyle = b.held ? "#ffd166" : "#5bc0eb"; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "bold " + Math.round(11 * S * 8) + "px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(String(b.id), x, y - r - 6);
  ctx.textAlign = "left";
}

/* WHERE IT HAS JUST BEEN.

   A Bit:Bot turning on the spot and a Bit:Bot sitting still look identical
   in a still picture, and "is it actually moving?" is the first question
   anyone asks of a program that is not working. A fading tail answers it
   without a word, and it also draws the SHAPE of what the program did - an
   arc, a square, a wobble down a line - which is the thing the child was
   trying to make and the thing they can now see they did or did not make.

   It is drawn from the snapshots as they arrive and kept nowhere else, so
   it cannot be the thing that corrupts the model: if the tail is wrong the
   picture is wrong and every number is still right. */
const TAIL = 110;                 // frames kept, so about 1.8 seconds
const JUMP = 70;                  // mm in one frame that means "it teleported"

function drawTails(trails, bodies) {
  for (const b of bodies) {
    const t = trails.get(b.id);
    if (!t || t.length < 2) continue;
    /* Older points are both fainter and thinner, which reads as depth: the
       eye takes the fat bright end as "now" without being told. */
    for (let i = 1; i < t.length; i++) {
      const f = i / t.length;
      ctx.strokeStyle = "rgba(91,192,235," + (f * f * 0.5).toFixed(3) + ")";
      ctx.lineWidth = Math.max(1, f * 3.4 * S * 8);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(t[i - 1].x * S, t[i - 1].y * S);
      ctx.lineTo(t[i].x * S, t[i].y * S);
      ctx.stroke();
    }
  }
}

/* A MESSAGE, LEAVING.

   Radio is the only thing the gym does that the room cannot show: two
   boards talk and the floor looks exactly the same, so a child with the
   wrong group number sees what a child with the right one sees. A ring
   leaving the sender and a blink on whoever heard it turns the group
   number into something you watch. A ring that reaches nobody is the
   picture of a wrong group - and that is worth more than any error
   message, because nothing went wrong. */
const AIR = 900;                  // must match the room's own memory

function drawRadio(snap) {
  for (const a of snap.radio || []) {
    const src = snap.bodies.find(b => b.id === a.from);
    if (!src) continue;
    const f = clamp((snap.t - a.t) / AIR, 0, 1);
    const fade = (1 - f) * (1 - f);
    /* two rings, one chasing the other, so a single send still reads as a
       pulse rather than one lonely expanding circle */
    for (const lead of [0, 0.28]) {
      const g = f - lead;
      if (g <= 0) continue;
      ctx.beginPath();
      ctx.arc(src.x * S, src.y * S, (src.r + g * 820) * S, 0, 7);
      ctx.strokeStyle = "rgba(227,0,140," + (fade * 0.75).toFixed(3) + ")";
      ctx.lineWidth = Math.max(1, 2.4 * S * 8 * fade);
      ctx.stroke();
    }
    /* and a blink on each board that actually heard it */
    for (const id of a.to || []) {
      const h = snap.bodies.find(b => b.id === id);
      if (!h) continue;
      ctx.beginPath();
      ctx.arc(h.x * S, h.y * S, (h.r + 7 + f * 10) * S, 0, 7);
      ctx.strokeStyle = "rgba(255,255,255," + (fade * 0.85).toFixed(3) + ")";
      ctx.lineWidth = Math.max(1, 2 * S * 8);
      ctx.stroke();
    }
  }
}

export function createRoomRenderer(canvas) {
  const target = canvas.getContext("2d");
  const trails = new Map();                             // id -> recent positions
  const lit = document.createElement("canvas");         // all the light, added up
  const one = document.createElement("canvas");         // one source at a time
  const stage = document.createElement("canvas");       // the furniture, on its own
  const lctx = lit.getContext("2d");
  const octx = one.getContext("2d");
  const sctx = stage.getContext("2d");

  /* How much of the light a standing thing takes. Less than the floor does,
     and that is honest: a table top is 700 mm nearer the ceiling lamp than
     the lino is, so it really does catch more. It also keeps the furniture
     recognisable in a room where somebody has turned every lamp off. */
  const STANDING = 0.6;

  /* How bright a patch of floor LOOKS.

     Two things decide it: how bright the room is at all, and how this patch
     compares with the brightest patch in it. That second part is what makes
     a shadow show up under a lamp bright enough to wash everything out - the
     eye judges a shadow by what is beside it. It is the gym's own curve, and
     without it every lit room draws as one flat grey rectangle. */
  const look = (e, top) => Math.pow(clamp(e / (top || 1), 0, 1), 0.8) * (top / (top + 0.9));

  /* The brightest the room gets: right under whichever source is strongest.
     Everything else is drawn relative to it. */
  function peak(snap) {
    let top = snap.ambient;
    for (const r of snap.light) if (r.profile.e[0] > top) top = r.profile.e[0];
    return top;
  }

  /* A lamp's glow, straight off the curve the light field sampled for us -
     so it falls away at exactly the rate a light sensor would measure. */
  function glow(ctx, src, S, top, ambient, profile) {
    const base = look(ambient, top), n = profile.e.length - 1;
    const g = ctx.createRadialGradient(src.x * S, src.y * S, 0, src.x * S, src.y * S, profile.reach * S);
    for (let k = 0; k <= n; k++) {
      /* what this source ADDS over the ambient, so several of them can be
         laid on top of one another without the room turning white */
      const v = Math.round(255 * clamp(look(profile.e[k], top) - base, 0, 1));
      g.addColorStop(k / n, "rgba(" + v + "," + Math.round(v * 0.97) + "," + Math.round(v * 0.91) + ",1)");
    }
    return g;
  }

  /* One lamp, drawn from the very same polygons the sensors were given, so
     the picture and the numbers cannot drift apart:
       - the glow, by the same inverse-square law as light.at
       - clipped to what the lamp can SEE (the visibility polygon, which is
         how a tall thing's shadow runs on until it meets a wall)
       - minus the quads of the shorter things, whose shadows end. */
  function paintSource(region, S, W, snap, top) {
    const src = region.source;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, W, W);

    if (src.kind === "sun") {
      const base = look(snap.ambient, top);
      const v = Math.round(255 * clamp(look(region.profile.e[0], top) - base, 0, 1));
      octx.fillStyle = "rgba(" + v + "," + Math.round(v * 0.97) + "," + Math.round(v * 0.88) + ",1)";
      octx.fillRect(0, 0, W, W);
    } else {
      octx.fillStyle = glow(octx, src, S, top, snap.ambient, region.profile);
      octx.fillRect(0, 0, W, W);
      if (region.visible && region.visible.length > 2) {
        octx.save();                                    // keep only what the lamp can see
        octx.globalCompositeOperation = "destination-in";
        octx.beginPath();
        octx.moveTo(region.visible[0][0] * S, region.visible[0][1] * S);
        for (const p of region.visible.slice(1)) octx.lineTo(p[0] * S, p[1] * S);
        octx.closePath();
        octx.fillStyle = "#fff";
        octx.fill();
        octx.restore();
      }
    }

    octx.save();                                        // and punch out the ending shadows
    octx.globalCompositeOperation = "destination-out";
    octx.fillStyle = "#000";
    for (const poly of region.quads) {
      if (!poly || poly.length < 3) continue;
      octx.beginPath();
      octx.moveTo(poly[0].x * S, poly[0].y * S);
      for (const p of poly.slice(1)) octx.lineTo(p.x * S, p.y * S);
      octx.closePath();
      octx.fill();
    }
    octx.restore();

    lctx.globalCompositeOperation = "lighter";
    lctx.drawImage(one, 0, 0);
  }

  function paintLight(snap, S, W) {
    if (lit.width !== W) { lit.width = lit.height = W; one.width = one.height = W; }
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = "source-over";
    /* FLOOR is a drawing choice, not physics. With every lamp off the room
       really is pitch black and the sensors say so, but a child staring at a
       black square cannot tell where the furniture went, so the picture
       keeps a little moonlight in it. Nothing reads this but the canvas. */
    const top = peak(snap);
    const a = Math.round(255 * clamp(Math.max(FLOOR, look(snap.ambient, top)), 0, 1));
    lctx.fillStyle = "rgb(" + a + "," + Math.round(a * 0.97) + "," + Math.round(a * 0.91) + ")";
    lctx.fillRect(0, 0, W, W);
    for (const region of snap.light) paintSource(region, S, W, snap, top);
    return lit;
  }

  /* snap is the room's snapshot, and that is all: the light is drawn from
     the very polygons the sensors read, so the picture cannot say there is a
     shadow where the robot says there is light. */
  function draw(snap) {
    ctx = target;
    S = canvas.width / snap.size;
    const W = canvas.width;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);

    ctx.fillStyle = snap.ground === "grass" ? "#6f8a5c"
                  : snap.ground === "tarmac" ? "#6d7079"
                  : snap.ground === "sand" ? "#c6b089" : "#9aa0ac";
    ctx.fillRect(0, 0, W, W);

    for (const l of snap.lines) {                               // tape on the floor
      ctx.strokeStyle = "#15171c";
      ctx.lineWidth = Math.max(1, l.half * 2 * S);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(l.a.x * S, l.a.y * S); ctx.lineTo(l.b.x * S, l.b.y * S);
      ctx.stroke();
    }

    /* The light over the floor first, at full strength: a shadow is not
       painted, it is simply a place the light map never lit. */
    const light = paintLight(snap, S, W);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(light, 0, 0);
    ctx.restore();

    /* The furniture goes on its own layer so the same light can fall on it
       more gently - see STANDING. */
    if (stage.width !== W) stage.width = stage.height = W;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, W, W);
    ctx = sctx;

    for (const b of snap.furniture) {
      const ox = (b.x + b.w / 2) * S, oy = (b.y + b.h / 2) * S;
      const w = b.w * S, h = b.h * S;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(b.rot || 0);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 9 * S; ctx.shadowOffsetY = 2 * S;
      ctx.fillStyle = b.fill || "#3d4657";
      if (b.round) { ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, 7); ctx.fill(); }
      else { roundRect(-w / 2, -h / 2, w, h, 6 * S); ctx.fill(); }
      ctx.restore();
      drawThingDetail(b);
      ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1.5;
      if (!b.round) { roundRect(-w / 2, -h / 2, w, h, 6 * S); ctx.stroke(); }
      ctx.restore();
      if (b.name && w > 56) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = Math.round(11 * (W / 620)) + "px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(b.name, ox, oy + 4);
        ctx.textAlign = "left";
      }
    }

    /* The light, over the furniture. A multiply spreads past the shapes on
       to the empty parts of this layer, so the shapes are kept as a mask and
       put back afterwards - otherwise the whole room gets a second coat. */
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalCompositeOperation = "source-over";
    octx.clearRect(0, 0, W, W);
    octx.drawImage(stage, 0, 0);

    sctx.save();
    sctx.globalCompositeOperation = "multiply";
    sctx.globalAlpha = STANDING;
    sctx.drawImage(light, 0, 0);
    sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = "destination-in";
    sctx.drawImage(one, 0, 0);
    sctx.restore();

    ctx = target;
    ctx.drawImage(stage, 0, 0);

    /* The lamps and the robots come last, because a bulb and an LED are
       lights themselves - nothing dims them. */

    /* The tail is collected here, where the snapshots arrive, and a big
       step BREAKS it rather than being drawn: a dragged robot would
       otherwise leave a straight line across the room it never drove, and
       a tail that lies about where something has been is worse than no
       tail at all. */
    const seen = new Set();
    for (const b of snap.bodies) {
      seen.add(b.id);
      let t = trails.get(b.id);
      if (!t) { t = []; trails.set(b.id, t); }
      const last = t[t.length - 1];
      if (!last) t.push({ x: b.x, y: b.y });
      else {
        const d = Math.hypot(b.x - last.x, b.y - last.y);
        if (d > JUMP) { t.length = 0; t.push({ x: b.x, y: b.y }); }
        else if (d > 3) { t.push({ x: b.x, y: b.y }); if (t.length > TAIL) t.shift(); }
      }
    }
    for (const id of [...trails.keys()]) if (!seen.has(id)) trails.delete(id);

    drawTails(trails, snap.bodies);
    drawRadio(snap);

    for (const L of snap.lamps) drawBulb(L);
    for (const b of snap.bodies) drawBody(b);
    if (snap.sun) drawSun(snap.sun, W);

    const nr = 20 * (W / 620), nx = W - 46 * (W / 620), ny = 46 * (W / 620);
    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate(MAG_NORTH + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -nr); ctx.lineTo(nr * 0.42, nr * 0.5);
    ctx.lineTo(0, nr * 0.2); ctx.lineTo(-nr * 0.42, nr * 0.5);
    ctx.closePath();
    ctx.fillStyle = "rgba(232,87,90,0.85)"; ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "bold " + Math.round(12 * (W / 620)) + "px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", nx, ny - nr - 3);
    ctx.textAlign = "left";

    /* the walls, or a dashed edge when the scene has none */
    if (snap.walls) { ctx.strokeStyle = "#49536a"; ctx.lineWidth = 6; ctx.setLineDash([]); }
    else { ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2; ctx.setLineDash([8, 7]); }
    ctx.strokeRect(3, 3, W - 6, W - 6);
    ctx.setLineDash([]);
  }

  const toRoom = (sx, sy, size) => ({ x: sx / canvas.width * size, y: sy / canvas.height * size });
  return { draw, toRoom };
}
