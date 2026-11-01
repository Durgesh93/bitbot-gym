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

/* EVERY LABEL IN THE ROOM, AS BOXES, FOR THE FRAME BEING DRAWN.

   The names are one pass and the sensor captions are another, and each
   used to lay itself out knowing only about its own kind - so at eight
   robots a tidy column of names sat squarely underneath a tidy column of
   readings, with "Bit:Bot 1" hidden behind somebody else's "sonar 154 cm".
   Both passes push into this one list, names first, and both step round
   what is already in it. */
let labelBoxes = [];

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

/* THE FLOOR IS A MATERIAL, NOT A COLOUR.

   A flat grey rectangle reads as a diagram; speckled lino reads as a
   room, and the difference costs one offscreen canvas. It matters more
   than it sounds: the whole point of the gym is that a child believes the
   room enough to reason about it, and a believable floor is most of that.

   Built once per material and reused, because a texture regenerated every
   frame would crawl and shimmer - and because sixty of these a second
   would be the most expensive thing in the renderer by a distance. */
const floors = new Map();

function floorOf(material, W) {
  const key = material + ":" + W;
  if (floors.has(key)) return floors.get(key);

  const px = 512;
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d");
  /* its own random, seeded by the material, so a floor looks the same
     every time the gym opens */
  let seed = 0;
  for (let i = 0; i < material.length; i++) seed = (seed * 31 + material.charCodeAt(i)) | 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  if (material === "grass") {
    g.fillStyle = "#6f8a5c"; g.fillRect(0, 0, px, px);
    for (let i = 0; i < 5200; i++) {                      // blades, two ways
      const x = rnd() * px, y = rnd() * px, l = 2 + rnd() * 5;
      g.strokeStyle = rnd() < 0.5 ? "rgba(120,150,96,0.55)" : "rgba(78,102,64,0.5)";
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 2, y - l); g.stroke();
    }
  } else if (material === "tarmac") {
    g.fillStyle = "#6d7079"; g.fillRect(0, 0, px, px);
    for (let i = 0; i < 9000; i++) {                      // chippings
      const v = rnd();
      g.fillStyle = v < 0.5 ? "rgba(90,94,103,0.55)" : "rgba(55,58,65,0.45)";
      g.fillRect(rnd() * px, rnd() * px, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  } else if (material === "sand") {
    g.fillStyle = "#c6b089"; g.fillRect(0, 0, px, px);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = rnd() < 0.5 ? "rgba(214,196,160,0.5)" : "rgba(170,148,112,0.45)";
      g.fillRect(rnd() * px, rnd() * px, 1 + rnd() * 1.6, 1 + rnd() * 1.6);
    }
  } else {
    /* lino, which is what a primary classroom floor really is: one
       continuous speckled sheet. NO TILE JOINTS - a grid of lines on the
       floor reads as graph paper, and a child who sees squares starts
       counting them and measuring the room in them. The speckle alone is
       enough to say "floor"; the squares were saying "diagram".

       Warm buff, chosen by the teacher over a pale grey, a blue-grey and
       a slate. It is the one that looks like a school hall rather than a
       diagram of one, which is the whole job of this texture. Keep it
       LIGHT if it is ever changed again: the light field is multiplied
       over the floor, so how dark a corner can get is whatever room the
       floor's own brightness leaves it, and a dark floor flattens every
       shadow the light sensors are there to find. */
    g.fillStyle = "#d6c3a4"; g.fillRect(0, 0, px, px);
    for (let i = 0; i < 14000; i++) {                     // the speckle
      const v = rnd();
      g.fillStyle = v < 0.45 ? "rgba(232,221,200,0.45)"
                  : v < 0.8  ? "rgba(199,184,158,0.4)"
                             : "rgba(172,155,127,0.35)";
      g.fillRect(rnd() * px, rnd() * px, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  }

  const pat = ctx.createPattern(c, "repeat");
  floors.set(key, pat);
  return pat;
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

/* A BAR MAGNET, red end north, pale end south, lying where it was put.
   Drawn small and flat because that is what it is - and drawn with its
   two ends obviously different, because which way round it lies is the
   whole of what it does to a compass. */
const MAG_LONG = 96, MAG_WIDE = 34;
function drawMagnet(M) {
  const L = MAG_LONG * S, W = MAG_WIDE * S;
  ctx.save();
  ctx.translate(M.x * S, M.y * S);
  ctx.rotate(M.rot || 0);

  ctx.save();                                   // it sits on the floor
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(2, 3, L * 0.55, W * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const r = Math.min(5 * S, W / 2);
  const round = (x, w, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, -W / 2, w, W, r)
                  : ctx.rect(x, -W / 2, w, W);
    ctx.fill();
  };
  round(-L / 2, L / 2 + 1, "#c9ced8");          // south, pale
  round(0, L / 2, "#d14b45");                   // north, red
  ctx.strokeStyle = "rgba(20,24,32,0.45)";
  ctx.lineWidth = Math.max(1, 1.2 * S);
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-L / 2, -W / 2, L, W, r)
                : ctx.rect(-L / 2, -W / 2, L, W);
  ctx.stroke();

  const f = Math.round(W * 0.62);
  ctx.font = "700 " + f + "px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText("N", L * 0.25, 0);
  ctx.fillStyle = "#3b4250";
  ctx.fillText("S", -L * 0.25, 0);
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

/* A MICRO:BIT LYING ON THE FLOOR, on its own, with no wheels under it.

   Drawn as the board really looks from above - the long edge, the two
   buttons either side of the screen and the gold teeth along the bottom -
   because a child has one of these in their hand and has to see that the
   thing on the screen is the same object. The nose still points the way it
   faces: a bare board has a compass, and which way it is lying is the
   whole of the compass lesson. */
function drawBoard(b) {
  const x = b.x * S, y = b.y * S, r = b.r * S;
  const w = r * 1.6, h = r * 1.25;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(b.h || 0);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 6 * S; ctx.shadowOffsetY = 2 * S;
  roundRectPath(-w / 2, -h / 2, w, h, r * 0.22);
  ctx.fillStyle = b.held ? "#7e7a3d" : "#1f6f4a";          // the green board
  ctx.fill();
  ctx.restore();
  /* the gold edge connector, along the leading edge */
  ctx.fillStyle = "#c9a227";
  for (let i = -2; i <= 2; i++) ctx.fillRect(w / 2 - r * 0.2, i * h * 0.17 - h * 0.05, r * 0.2, h * 0.09);
  /* the 5x5 window and the two buttons */
  ctx.fillStyle = "rgba(10,12,16,0.75)";
  ctx.fillRect(-w * 0.16, -h * 0.26, w * 0.32, h * 0.52);
  ctx.fillStyle = "#cfd6e4";
  ctx.beginPath(); ctx.arc(-w * 0.3, 0, r * 0.13, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(w * 0.3, 0, r * 0.13, 0, 7); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 1.2;
  roundRectPath(-w / 2, -h / 2, w, h, r * 0.22); ctx.stroke();
  ctx.restore();
}

function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);         ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* A Bit:Bot from above: the chassis, two wheels and a nose so you can see
   which way it is pointing. The full one, with its FireLeds and its screen,
   arrives with the hardware layer. */
function drawBody(b) {
  const bare = b.program && b.program.plugged === false;
  if (bare) return drawBoard(b);
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
}

/* THE NAMES, LAID OUT SO THEY CAN ALL BE READ.

   The name over each one, and not the number, because the name is what the
   teacher says out loud. Drawn in one pass at the end rather than by each
   body as it goes down, for the reason you find out with the fourth robot:
   a classroom start corner puts them close together, the labels are a fixed
   size however near the robots are, and two names on top of each other is
   worse than no name at all. So each one is nudged down until it is clear
   of the ones already placed. */
function drawNames(bodies, W) {
  ctx.font = "bold " + Math.round(11 * S * 8) + "px system-ui, sans-serif";
  ctx.textAlign = "center";
  labelBoxes = [];
  const placed = [];
  /* The pill is 14 high, so a nudge of 13 left the two of them touching -
     one step has to clear the whole label and leave a hairline. */
  const lift = 7, step = 20;
  /* The pills have rounded ends and the eye joins two that are only just
     apart, so the clash test is widened by one: labels that merely touch
     read as one long smear of grey, which is the thing this is for. */
  const BREATH = 10;
  /* Top to bottom, so a nudge is always downwards onto empty floor and the
     order does not change as the robots shuffle about. */
  for (const b of [...bodies].sort((p, q) => p.y - q.y)) {
    const name = (b.program && b.program.name) || String(b.id);
    const w = ctx.measureText(name).width + 8;
    /* HELD INSIDE THE GLASS. A robot near the left wall had its name drawn
       centred on it, so half of "Bit:Bot 4" was off the edge of the room
       and unreadable - which is the one thing a name is for. */
    const x = Math.max(w / 2 + 2, Math.min(b.x * S, W - w / 2 - 2));
    let y = (b.y - b.r) * S - lift;
    for (let tries = 0; tries < 20; tries++) {
      const clash = placed.some(q => Math.abs(q.x - x) < (q.w + w) / 2 + BREATH &&
                                     Math.abs(q.y - y) < step);
      if (!clash) break;
      y += step;                       // down the body rather than off the top of the room
    }
    placed.push({ x, y, w });
    labelBoxes.push({ x: x, y: y - 11, w: w, h: 14 });
    ctx.fillStyle = "rgba(10,13,20,0.5)";
    roundRectPath(x - w / 2, y - 11, w, 14, 4); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.fillText(name, x, y);
  }
  ctx.textAlign = "left";
}

/* THE TURN POINT.

   Two points to a thing and no more: the thing itself, which you drag to
   move it, and one dot out to its right, which you drag to turn it. Copy
   and delete used to be two more dots; they are on the right-click menu
   now, because four dots round every chair in a furnished room was more
   dots than room.

   Only drawn while the pointer is in drag mode - in any other mode the
   pointer means something else and a handle under it would be a trap. */
const TURN_OUT = 52;                   // how far beyond the edge the dot sits

export function turnPointOf(thing) {
  if (thing.body) {
    const b = thing.body;
    return { x: b.x + Math.cos(b.h || 0) * (b.r + TURN_OUT),
             y: b.y + Math.sin(b.h || 0) * (b.r + TURN_OUT) };
  }
  const f = thing.thing;
  const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
  const out = Math.max(f.w, 110) / 2 + TURN_OUT;
  return { x: cx + Math.cos(f.rot || 0) * out, y: cy + Math.sin(f.rot || 0) * out };
}

const TURN_DOT = 30;                   // the dot's own size, in room units
function drawTurnPoint(p) {
  const x = p.x * S, y = p.y * S, r = TURN_DOT * S;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
  ctx.fillStyle = "rgba(91,192,235,0.20)"; ctx.fill();
  ctx.strokeStyle = "rgba(91,192,235,0.85)"; ctx.lineWidth = 1.6; ctx.stroke();
  /* a little arrowed arc, so the dot says "turn" and not "press" */
  ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0.7, 5.0);
  ctx.lineWidth = 1.8; ctx.stroke();
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

/* THE SENSOR VIEWS.

   The room as a sensor reads it, rather than as an eye sees it. This is
   the most useful thing the gym does for teaching, because every hard
   question a child asks is about a quantity they cannot see: "why does it
   turn left here?", "why does it stop in front of nothing?", "why does my
   compass say east?".

   THEY COMBINE. Light and sonar are both toggles and either can be on at
   once, because a robot is reading both at once anyway; "Plain" is simply
   all of them off. Making them exclusive, as a
   row of radio buttons, quietly says they are alternatives, and they are
   not.

   Each one draws from THE SAME QUESTION THE SENSOR ASKED. The sonar view
   in particular casts real rays - it does not draw a cone from the number
   the sonar already returned. Drawing the answer instead of the question
   makes a picture that always agrees with itself and can therefore never
   show you the thing you are hunting: a ray that slipped past a chair leg,
   or a cone that is pointing somewhere other than you thought. */

const SONAR_RAYS = 3;          // this many either side of straight ahead
const SONAR_STEP = 0.044;      // radians between them: a 15-degree cone in all
const SONAR_FWD = 62;          // where the sonar sits, forward of the middle

function bubble(text, x, y, colour, W) {
  const f = Math.round(11 * (W / 620));
  ctx.font = "600 " + f + "px system-ui, sans-serif";
  const w = ctx.measureText(text).width + f * 1.1, h = f * 1.9;
  ctx.fillStyle = "rgba(10,13,20,0.82)";
  roundRect(x - w / 2, y, w, h, h * 0.36);
  ctx.fill();
  ctx.fillStyle = colour;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + h / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/* Every line a view wants to say about a robot is collected first and the
   lines are stacked underneath it, so three views at once read as three
   rows rather than three captions on top of each other. */
function drawOverlay(snap, show, W, probe) {
  if (!show.light && !show.sonar) return;
  const said = new Map();
  const add = (b, text, colour) => {
    if (!said.has(b)) said.set(b, []);
    said.get(b).push({ text: text, colour: colour });
  };

  if (show.light) {
    /* A blob at each eye, bigger and hotter the more light it is getting.
       At the eye, because that is where the reading is taken - a child who
       sees the left blob swell as the robot turns has understood the whole
       of a light-chasing program. */
    for (const b of snap.bodies) {
      const r = b.reads || {};
      if (r.lightL == null) continue;
      const c = Math.cos(b.h || 0), sn = Math.sin(b.h || 0);
      const eye = (side) => ({
        x: b.x + c * 55 - sn * side,
        y: b.y + sn * 55 + c * side
      });
      for (const [p, v] of [[eye(-34), r.lightL], [eye(34), r.lightR]]) {
        const t = clamp(v / 1023, 0, 1);
        ctx.beginPath();
        ctx.arc(p.x * S, p.y * S, (7 + 9 * t) * S, 0, 7);
        ctx.fillStyle = "rgba(255," + Math.round(200 + 55 * t) + ","
                      + Math.round(80 + 120 * t) + "," + (0.25 + 0.6 * t).toFixed(2) + ")";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,230,150,0.9)"; ctx.lineWidth = 1.2; ctx.stroke();
      }
      add(b, "eyes  L " + r.lightL + "   R " + r.lightR + "   "
           + (r.lightL === r.lightR ? "level" : r.lightL > r.lightR ? "left brighter"
                                                                   : "right brighter"),
          "#ffd76a");
    }
  }

  if (show.sonar && probe && probe.ray) {
    /* REAL RAYS, cast now, from where the sonar really sits. Seven of them
       across fifteen degrees, each drawn to whatever it hit with a dot on
       the spot - and red, running off into the distance, when it hit
       nothing at all.

       Not a wedge drawn from the number the sonar returned: that picture
       is the ANSWER, and it agrees with itself no matter what the room is
       doing, so it can never show you why a reading is wrong. This can. */
    for (const b of snap.bodies) {
      const c = Math.cos(b.h || 0), sn = Math.sin(b.h || 0);
      const ox = b.x + c * SONAR_FWD, oy = b.y + sn * SONAR_FWD;
      for (let i = -SONAR_RAYS; i <= SONAR_RAYS; i++) {
        const a = (b.h || 0) + i * SONAR_STEP;
        const d = probe.ray({ x: ox, y: oy }, a, { self: b.id });
        const hit = isFinite(d);
        const far = hit ? d : 2400;
        ctx.strokeStyle = hit ? "rgba(91,192,235,0.5)" : "rgba(232,87,90,0.3)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ox * S, oy * S);
        ctx.lineTo((ox + Math.cos(a) * far) * S, (oy + Math.sin(a) * far) * S);
        ctx.stroke();
        if (hit) {
          ctx.beginPath();
          ctx.arc((ox + Math.cos(a) * d) * S, (oy + Math.sin(a) * d) * S, 3 * S, 0, 7);
          ctx.fillStyle = "rgba(91,192,235,0.9)";
          ctx.fill();
        }
      }
      const cm = (b.reads || {}).sonar;
      add(b, cm == null ? "sonar -" : cm > 0 ? "sonar " + cm + " cm" : "sonar found nothing",
          "#8fd8ef");
    }
  }

  /* THE CAPTIONS, STACKED UNDER WHATEVER THEY BELONG TO - AND THE STACKS
     LAID OUT AGAINST EACH OTHER.

     Stacking the rows within one robot's stack was only half the job. Turn
     all three views on in a class of ten and each robot is carrying four
     lines of text that are a fixed size however close together the robots
     are; two robots a hand's breadth apart put eight lines in the same
     place and you can read none of them. So a whole stack is measured and
     pushed down past the stacks already placed, exactly the way the names
     are - top to bottom, so the push is always onto emptier floor. */
  const gap = 17 * (W / 620);
  const cf = Math.round(11 * (W / 620));            // the same size `bubble` uses
  ctx.font = "600 " + cf + "px system-ui, sans-serif";
  const stacks = [...said.entries()].map(([b, items]) => {
    const w = Math.max(...items.map(it => ctx.measureText(it.text).width)) + cf * 1.1;
    const h = (items.length - 1) * gap + cf * 1.9;
    return {
      items: items, w: w, h: h,
      /* held inside the glass, the same as the names: a stack centred on a
         robot by the wall hangs half of itself off the room */
      x: Math.max(w / 2 + 2, Math.min(b.x * S, W - w / 2 - 2)),
      y: (b.y + b.r + 14) * S,
      /* and if there is no floor left underneath - the legend lives along
         the bottom - it goes above the robot instead */
      roof: (b.y - b.r) * S - 6
    };
  });
  /* The flip is decided BEFORE the stacks are laid out against each other
     and not after: flipping one up at the end dropped it on top of
     whatever was already up there, which is the mess this pass exists to
     prevent. */
  for (const st of stacks) if (st.y + st.h > W - 34) st.y = Math.max(2, st.roof - st.h);
  stacks.sort((p, q) => p.y - q.y);
  /* starting from the names, which are already on the glass */
  const down = labelBoxes.slice();
  for (const st of stacks) {
    for (let tries = 0; tries < 40; tries++) {
      const clash = down.find(q => Math.abs(q.x - st.x) < (q.w + st.w) / 2 + 6 &&
                                   st.y < q.y + q.h + 4 && q.y < st.y + st.h + 4);
      if (!clash) break;
      st.y = clash.y + clash.h + 5;
    }
    down.push(st);
    let y = st.y;
    for (const it of st.items) { bubble(it.text, st.x, y, it.colour, W); y += gap; }
  }

  const on = [];
  if (show.light) on.push("light sensors, 0 to 1023");
  if (show.sonar) on.push("a 15\u00b0 cone of pings, red found nothing");
  const note = "Showing: " + on.join("   \u00b7   ");
  const f = Math.round(12 * (W / 620));
  ctx.save();
  ctx.font = "600 " + f + "px system-ui, sans-serif";
  const w = ctx.measureText(note).width + f * 1.4, h = f * 2.2;
  ctx.fillStyle = "rgba(13,16,23,0.9)";
  roundRect(10, W - h - 10, w, h, h * 0.35); ctx.fill();
  ctx.fillStyle = "#dfe7f3";
  ctx.textBaseline = "middle";
  ctx.fillText(note, 10 + f * 0.7, W - h / 2 - 10);
  ctx.restore();
  ctx.textBaseline = "alphabetic";
}

export function createRoomRenderer(canvas, probe) {
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
    const g = snap.indirect;
    if (g) for (let i = 0; i < g.s.length; i++) if (g.s[i] > top) top = g.s[i];
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

    /* AND PUNCH OUT THE ENDING SHADOWS, all the way through.

       This used to leave a tenth of the light in, because taking all of it
       out left a black polygon that read as a HOLE IN THE FLOOR rather than
       as a shadow. That tenth was a lie told to the eye: a shadow in a real
       room is not an absence of light, it is a place the lamp cannot reach
       that the walls and the floor still bounce light into - and the gym
       now works out how much, properly, and paints it underneath. So the
       hole can be a real hole: what shows through it is the room's own
       bounced light, the same grid a light sensor reads. */
    octx.save();
    octx.globalCompositeOperation = "destination-out";
    octx.fillStyle = "rgba(0,0,0,1)";
    for (const poly of region.quads) {
      if (!poly || poly.length < 3) continue;
      octx.beginPath();
      octx.moveTo(poly[0].x * S, poly[0].y * S);
      for (const p of poly.slice(1)) octx.lineTo(p.x * S, p.y * S);
      octx.closePath();
      octx.fill();
    }
    octx.restore();

    /* A HAIR OF BLUR ON THE WAY IN, and it is the single thing that stops
       the room looking like cut paper. A lamp is a bulb and not a point,
       so its shadow has a soft edge a few centimetres wide; the geometry
       we clip against is exact, so without this every shadow has the edge
       of a razor. Blurring the finished layer rather than each polygon
       costs one filtered draw a lamp and softens the lit edge too. */
    lctx.globalCompositeOperation = "lighter";
    lctx.filter = "blur(" + (2.6 * (W / 620)).toFixed(2) + "px)";
    lctx.drawImage(one, 0, 0);
    lctx.filter = "none";
  }

  /* THE ROOM'S OWN BOUNCED LIGHT, drawn from the grid the sensors read.

     This is what fills a shadow. It is a coarse grid on purpose - indirect
     light has no edges in it, every surface it touched averaged it - so it
     goes down as a tiny bitmap and the canvas smooths it up to size, which
     is the same bilinear read the field does for a sensor. The picture and
     the numbers come from one array, which is the only way they can never
     disagree. */
  const tiny = document.createElement("canvas");
  const tctx = tiny.getContext("2d");
  function paintIndirect(snap, W, top) {
    const g = snap.indirect;
    if (!g || !g.G) return;
    const G = g.G;
    if (tiny.width !== G) { tiny.width = tiny.height = G; }
    const img = tctx.createImageData(G, G);
    for (let i = 0; i < G * G; i++) {
      const v = Math.round(255 * clamp(look(g.s[i] / 2, top), 0, 1));
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = Math.round(v * 0.97);
      img.data[i * 4 + 2] = Math.round(v * 0.91);
      img.data[i * 4 + 3] = 255;
    }
    tctx.putImageData(img, 0, 0);
    lctx.save();
    lctx.globalCompositeOperation = "lighter";
    lctx.imageSmoothingEnabled = true;
    lctx.imageSmoothingQuality = "high";
    /* half a cell out on every side, so the outermost cell centres land on
       the edge of the room rather than half a cell inside it */
    const pad = W / (2 * G);
    lctx.drawImage(tiny, -pad, -pad, W + pad * 2, W + pad * 2);
    lctx.restore();
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
    paintIndirect(snap, W, top);
    for (const region of snap.light) paintSource(region, S, W, snap, top);
    return lit;
  }

  /* snap is the room's snapshot, and that is all: the light is drawn from
     the very polygons the sensors read, so the picture cannot say there is a
     shadow where the robot says there is light. */
  function draw(snap, opts) {
    const o = opts || {};
    ctx = target;
    S = canvas.width / snap.size;
    const W = canvas.width;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);

    ctx.fillStyle = floorOf(snap.ground || "lino", W);
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

    if (o.trail !== false) drawTails(trails, snap.bodies);
    drawRadio(snap);

    /* The tape being dragged out right now. It is drawn and not yet in the
       room, which is the honest picture: nothing has told the sensors about
       it, because a half-drawn line is not a line. */
    if (o.pen) {
      ctx.save();
      ctx.strokeStyle = "rgba(21,23,28,0.55)";
      ctx.lineWidth = Math.max(2, 30 * S);
      ctx.lineCap = "round";
      ctx.setLineDash([14 * S * 8, 10 * S * 8]);
      ctx.beginPath();
      ctx.moveTo(o.pen.from.x * S, o.pen.from.y * S);
      ctx.lineTo(o.pen.to.x * S, o.pen.to.y * S);
      ctx.stroke();
      ctx.restore();
    }

    /* under the lamps and the robots: a magnet is a thing on the floor
       and a robot can be standing on top of one */
    for (const M of (snap.magnets || [])) drawMagnet(M);
    for (const L of snap.lamps) drawBulb(L);
    for (const b of snap.bodies) drawBody(b);
    drawNames(snap.bodies, W);

    /* the turn points, over everything so they are never buried */
    if (o.handles) {
      for (const f of snap.furniture) drawTurnPoint(turnPointOf({ thing: f }));
      for (const b of snap.bodies) drawTurnPoint(turnPointOf({ body: b }));
    }
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

    if (o.show) drawOverlay(snap, o.show, W, probe);

    /* the walls, or a dashed edge when the scene has none */
    if (snap.walls) { ctx.strokeStyle = "#49536a"; ctx.lineWidth = 6; ctx.setLineDash([]); }
    else { ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2; ctx.setLineDash([8, 7]); }
    ctx.strokeRect(3, 3, W - 6, W - 6);
    ctx.setLineDash([]);
  }

  const toRoom = (sx, sy, size) => ({ x: sx / canvas.width * size, y: sy / canvas.height * size });
  return { draw, toRoom };
}
