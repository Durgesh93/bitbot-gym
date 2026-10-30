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
const LMAP_N = 150;            // light samples across the room, for the look
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

export function createRoomRenderer(canvas) {
  const target = canvas.getContext("2d");
  const lmap = document.createElement("canvas");
  lmap.width = lmap.height = LMAP_N;
  const lctx = lmap.getContext("2d");
  let painted = "";

  /* Two things decide how a square of floor looks: how bright the room is at
     all, and how it compares with the brightest square in it. That second
     part is what makes a shadow show up under a lamp bright enough to wash
     everything out - the eye judges a shadow by what is beside it. */
  function paintLight(map, n, mark) {
    if (mark === painted) return;
    painted = mark;
    const img = lctx.createImageData(n, n);
    let top = 0;
    for (let k = 0; k < map.length; k++) if (map[k] > top) top = map[k];
    const lit = top / (top + 0.9);
    for (let k = 0; k < map.length; k++) {
      /* FLOOR is a drawing choice, not physics. With every lamp off the room
         really is pitch black, and the sensors say so - but a child staring
         at a black square cannot tell where the furniture went, so the
         picture keeps a little moonlight in it. Nothing reads this number
         except the canvas. */
      const v = Math.max(FLOOR, Math.pow(map[k] / (top || 1), 0.8) * lit);
      const q = k * 4;
      img.data[q] = 255 * v; img.data[q + 1] = 248 * v; img.data[q + 2] = 232 * v;
      img.data[q + 3] = 255;
    }
    lctx.putImageData(img, 0, 0);
  }

  /* snap is the room's snapshot; light is {map, n, mark} from room.lightMap(). */
  function draw(snap, light) {
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

    /* Now the light, multiplied over the floor AND over everything standing
       on it. That multiply is the whole trick: a shadow is not painted, it is
       simply a place the light map never lit. The lamps and the robots come
       after it, because a bulb and an LED are lights themselves. */
    if (light) {
      paintLight(light.map, light.n, light.mark);
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(lmap, 0, 0, W, W);
      ctx.restore();
    }

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
  return { draw, toRoom, LMAP_N };
}
