/* ========================================================================
   7. Drawing
   ======================================================================== */
const cv = document.getElementById("room"), ctx = cv.getContext("2d");
const S = cv.width / ROOM;

/* ---- three ways of looking at the room ---------------------------------
   Each one shows the numbers the program is actually reading, next to the
   thing that is reading them. A picture of the light is less use than the
   two values the robot is comparing. */

/* Each layer draws its own marks on the room and hands back a line of text
   per device. The lines are then stacked under whatever they belong to, so
   three layers at once read as three lines rather than three on top of
   each other. */
function drawOverlays() {
  const show = world.show;
  if (!show.light && !show.magnetic && !show.sonar) return;
  const lines = new Map();
  const add = (holder, text, colour) => {
    if (!lines.has(holder)) lines.set(holder, []);
    lines.get(holder).push({ text: text, colour: colour });
  };

  if (show.light) {
    for (const b of world.bots) {
      const L = readLightSensor(b, "L"), R = readLightSensor(b, "R");
      for (const [pt, v] of [[sensorPoint(b, BOT.senFwd, -BOT.senSide), L],
                             [sensorPoint(b, BOT.senFwd, BOT.senSide), R]]) {
        const t = clamp(v / 1023, 0, 1);
        ctx.beginPath(); ctx.arc(pt.x * S, pt.y * S, (7 + 9 * t) * S, 0, 7);
        ctx.fillStyle = "rgba(255," + Math.round(200 + 55 * t) + "," +
                        Math.round(80 + 120 * t) + "," + (0.25 + 0.6 * t) + ")";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,230,150,0.9)"; ctx.lineWidth = 1.2; ctx.stroke();
      }
      add(b, "eyes  L " + L + "   R " + R + "   " +
             (L === R ? "level" : L > R ? "left brighter" : "right brighter"), "#ffd76a");
    }
    for (const m of world.mbits) if (!m.bot) add(m, "light level " + readScreenLight(m), "#ffd76a");
  }

  if (show.magnetic) {
    const step = cv.width / 10, ang = MAG_NORTH;
    ctx.strokeStyle = "rgba(91,192,235,0.26)"; ctx.lineWidth = 1.3;
    for (let y = step / 2; y < cv.height; y += step) {
      for (let x = step / 2; x < cv.width; x += step) {
        const len = step * 0.26, dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
        ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
      }
    }
    for (const m of world.mbits) {
      add(m.bot || m, "compass " + compassHeadingDeg(m) + "\u00b0   " +
          magneticForce(m, "x").toFixed(1) + " / " + magneticForce(m, "y").toFixed(1) +
          " / " + magneticForce(m, "z").toFixed(0) + " \u00b5T", "#5bc0eb");
    }
  }

  if (show.sonar) {
    for (const b of world.bots) {
      const c = Math.cos(b.h), sn = Math.sin(b.h);
      const ox = b.x + c * BOT.sonarFwd, oy = b.y + sn * BOT.sonarFwd;
      for (let i = -3; i <= 3; i++) {
        const a = b.h + i * 0.044;
        const d = rayDistance(ox, oy, a);
        const far = isFinite(d) ? d : 2400;
        ctx.strokeStyle = isFinite(d) ? "rgba(91,192,235,0.5)" : "rgba(232,87,90,0.3)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ox * S, oy * S);
        ctx.lineTo((ox + Math.cos(a) * far) * S, (oy + Math.sin(a) * far) * S);
        ctx.stroke();
        if (isFinite(d)) {
          ctx.beginPath();
          ctx.arc((ox + Math.cos(a) * d) * S, (oy + Math.sin(a) * d) * S, 3 * S, 0, 7);
          ctx.fillStyle = "rgba(91,192,235,0.9)"; ctx.fill();
        }
      }
      const cm = readSonar(b);
      add(b, cm === 0 ? "sonar  nothing within 2 m" : "sonar  " + cm + " cm",
          cm === 0 ? "#e8575a" : "#5bc0eb");
    }
  }

  // and now the captions, stacked under whatever they describe
  const gap = Math.round(13 * (cv.width / 1100)) * 1.95;
  lines.forEach((items, holder) => {
    const isBot = world.bots.indexOf(holder) >= 0;
    let y = (holder.y + (isBot ? 150 : 95)) * S;
    for (const it of items) { nameBubble(it.text, holder.x * S, y, it.colour); y += gap; }
  });

  const on = [];
  if (show.light) on.push("light sensors, 0 to 1023");
  if (show.magnetic) on.push("compass and field, the same everywhere");
  if (show.sonar) on.push("a 15\u00b0 cone of pings, red found nothing");
  overlayNote("Showing: " + on.join("   \u00b7   "));
}


function overlayNote(text) {
  const f = Math.round(12 * (cv.width / 1100));
  ctx.font = "600 " + f + "px system-ui, sans-serif";
  const w = ctx.measureText(text).width + f * 1.4, h = f * 2.2;
  ctx.fillStyle = "rgba(13,16,23,0.9)";
  roundRect(10, cv.height - h - 10, w, h, h * 0.35); ctx.fill();
  ctx.fillStyle = "#dfe7f3";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 10 + f * 0.7, cv.height - h / 2 - 10);
  ctx.textBaseline = "alphabetic";
}

/* ---- the light map ----------------------------------------------------
   The floor is worked out square by square, and each square asks EVERY lamp
   how much light it is getting. That is the only honest way to do it: with
   two lamps, a spot hidden from one but lit by the other is still lit, and
   where two shadows overlap it really is dark. It is the same illuminance
   the robot's sensors read, so what a child sees and what the robot feels
   are the same thing. */
const LMAP_N = 64;
const lmap = document.createElement("canvas");
lmap.width = lmap.height = LMAP_N;
const lctx = lmap.getContext("2d");
let lmapAt = -1;
function buildLightMap() {
  const img = lctx.createImageData(LMAP_N, LMAP_N);
  const step = ROOM / LMAP_N, n = LMAP_N * LMAP_N;
  const e = new Float32Array(n);
  let top = 0;
  for (let j = 0; j < LMAP_N; j++) {
    for (let i = 0; i < LMAP_N; i++) {
      const v = illuminance((i + 0.5) * step, (j + 0.5) * step, null, null, true, 0);
      e[j * LMAP_N + i] = v;
      if (v > top) top = v;
    }
  }
  /* Two things decide how a square looks: how bright the room is at all,
     and how it compares with the brightest square in it. That second part
     is what makes a shadow show up under a lamp bright enough to wash
     everything out - the eye judges a shadow by what is beside it. */
  const lit = top / (top + 0.9);
  for (let k = 0; k < n; k++) {
    const v = Math.pow(e[k] / (top || 1), 0.8) * lit;
    const q = k * 4;
    img.data[q] = 255 * v; img.data[q + 1] = 248 * v; img.data[q + 2] = 232 * v;
    img.data[q + 3] = 255;
  }
  lctx.putImageData(img, 0, 0);
  lmapAt = Date.now();
}

function draw() {
  buildShadows(); shadowsStale = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);

  // the floor itself, and the line somebody drew on it
  ctx.fillStyle = "#9aa0ac";
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(floor, 0, 0, cv.width, cv.height);

  // then the light, multiplied over it: dark floor where no lamp can reach
  if (!running || Date.now() - lmapAt > 80) buildLightMap();
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lmap, 0, 0, cv.width, cv.height);
  ctx.restore();

  // the furniture, each turned however you left it
  for (const b of world.boxes) {
    const o = objCentre(b), w = b.w * S, h = b.h * S;
    ctx.save();
    ctx.translate(o.x * S, o.y * S);
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
    if (b.unnamed) {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "rgba(91,192,235,0.95)"; ctx.lineWidth = 2;
      roundRect(-w / 2, -h / 2, w, h, 6 * S); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    const label = b.unnamed ? "name it" : b.name;
    if (label && w > 56) {
      ctx.fillStyle = b.unnamed ? "rgba(91,192,235,0.95)" : "rgba(255,255,255,0.6)";
      ctx.font = (b.unnamed ? "bold " : "") + Math.round(11 * (cv.width / 1100)) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, o.x * S, o.y * S + 4);
      ctx.textAlign = "left";
    }

    // three handles: turn it, copy it, take it away
    const H = handlesOf(b);
    drawHandle(H.turn, "turn"); drawHandle(H.copy, "copy"); drawHandle(H.del, "del");
  }

  // where each robot has been, in the colour of the board driving it
  if (world.showTrail) {
    for (const b of world.bots) {
      if (b.trail.length < 2) continue;
      const host = hostOf(b);
      ctx.strokeStyle = (host ? host.colour : "#8d96a6") + "99";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.trail[0].x * S, b.trail[0].y * S);
      for (const pt of b.trail) ctx.lineTo(pt.x * S, pt.y * S);
      ctx.stroke();
    }
  }

  for (const L of world.lamps) { drawBulb(L); drawHandle(lampHandles(L).del, "del"); }
  for (const m of world.mbits) {
    const H = devHandles(m);
    drawHandle(H.turn, "turn"); drawHandle(H.del, "del");
  }

  for (const b of world.bots) drawBot(b);
  for (const m of world.mbits) if (!botOf(m)) drawBoard(m);
  drawOverlays();

  // which way is north
  const nx = cv.width - 46 * (cv.width / 1100), ny = 46 * (cv.width / 1100), nr = 20 * (cv.width / 1100);
  ctx.save();
  ctx.translate(nx, ny);
  ctx.rotate(MAG_NORTH + Math.PI / 2);          // the same north the arrows use
  ctx.beginPath(); ctx.moveTo(0, -nr); ctx.lineTo(nr * 0.42, nr * 0.5); ctx.lineTo(0, nr * 0.2);
  ctx.lineTo(-nr * 0.42, nr * 0.5); ctx.closePath();
  ctx.fillStyle = "rgba(232,87,90,0.85)"; ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "bold " + Math.round(12 * (cv.width / 1100)) + "px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("N", nx, ny - nr - 3);          // magnetic north, which is what a compass finds
  ctx.textAlign = "left";

  // the walls
  ctx.strokeStyle = "#49536a"; ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, cv.width - 6, cv.height - 6);

  if (slipping) {
    ctx.fillStyle = "rgba(242,177,52,0.9)";
    ctx.font = "bold " + Math.round(15 * (cv.width / 1100)) + "px system-ui, sans-serif";
    ctx.fillText("wheels slipping", 14, 24);
  }
}

// a micro:bit nobody has plugged in: a board on the floor, still listening
function drawBoard(m) {
  const w = 62 * S, h = 50 * S, x = m.x * S, y = m.y * S;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 8 * S; ctx.shadowOffsetY = 2 * S;
  ctx.fillStyle = "#1f6f4a";
  roundRect(x - w / 2, y - h / 2, w, h, 4 * S); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = m.colour; ctx.lineWidth = 2;
  roundRect(x - w / 2, y - h / 2, w, h, 4 * S); ctx.stroke();
  const cell = h * 0.17;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    ctx.fillStyle = m.screen[r * 5 + c] ? "#ff3b3b" : "#2b2f38";
    ctx.fillRect(x + (c - 2.5) * cell, y + (r - 2.5) * cell, cell * 0.72, cell * 0.72);
  }
  nameBubble(m.name, x, y - h / 2 - 8, m.colour);
}

// a small speech bubble, so a name reads as a label and not as part of the floor
function nameBubble(text, x, yBottom, colour) {
  const f = Math.round(11.5 * (cv.width / 1100));
  ctx.font = "bold " + f + "px system-ui, sans-serif";
  const padX = f * 0.55, h = f * 1.75, w = ctx.measureText(text).width + padX * 2;
  // keep the bubble inside the room, whichever edge the thing is standing near
  const top = clamp(yBottom - h - f * 0.45, 4, cv.height - h - 6);
  x = clamp(x, w / 2 + 4, cv.width - w / 2 - 4);
  ctx.fillStyle = "rgba(13,16,23,0.9)";
  ctx.strokeStyle = colour; ctx.lineWidth = 1.5;
  roundRect(x - w / 2, top, w, h, h * 0.42);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();                                   // the little tail
  ctx.moveTo(x - f * 0.34, top + h - 0.8);
  ctx.lineTo(x, top + h + f * 0.5);
  ctx.lineTo(x + f * 0.34, top + h - 0.8);
  ctx.closePath();
  ctx.fillStyle = "rgba(13,16,23,0.9)"; ctx.fill();
  ctx.fillStyle = colour;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, x, top + h / 2);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

function drawBot(b) {
  const host = hostOf(b);
  const accent = host ? host.colour : "#8d96a6";
  ctx.save();
  ctx.translate(b.x * S, b.y * S);
  ctx.rotate(b.h);

  const L = 120 * S, W = 125 * S;
  ctx.fillStyle = "#15181f";
  ctx.fillRect(-L * 0.18, -W / 2 - 4 * S, L * 0.42, 14 * S);
  ctx.fillRect(-L * 0.18, W / 2 - 10 * S, L * 0.42, 14 * S);

  ctx.fillStyle = "#c8ced9"; ctx.strokeStyle = accent; ctx.lineWidth = 2.5;
  roundRect(-L / 2, -W / 2, L, W, 9 * S); ctx.fill(); ctx.stroke();

  for (let i = 0; i < 12; i++) {
    const side = i < 6 ? -1 : 1, k = i % 6;
    const px = -L / 2 + 12 * S + k * (L - 26 * S) / 5;
    const py = side * (W / 2 - 9 * S);
    ctx.beginPath(); ctx.arc(px, py, 4.2 * S, 0, 7);
    const c = b.pixels[i];
    if (c && c !== "#000000") {
      ctx.fillStyle = c; ctx.globalAlpha = Math.max(0.25, b.pixelBright / 255); ctx.fill(); ctx.globalAlpha = 1;
      ctx.shadowColor = c; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
    } else { ctx.fillStyle = "#8d96a6"; ctx.fill(); }
  }

  // the micro:bit riding on top, if one is plugged in
  ctx.fillStyle = host ? "#1f6f4a" : "#49536a";
  roundRect(-L * 0.17, -W * 0.22, L * 0.34, W * 0.44, 3 * S); ctx.fill();
  if (host) {
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      ctx.fillStyle = host.screen[r * 5 + c] ? "#ff3b3b" : "#2b2f38";
      ctx.fillRect(L * 0.08 - r * L * 0.05, -W * 0.15 + c * W * 0.06, L * 0.032, W * 0.04);
    }
  }

  ctx.beginPath(); ctx.moveTo(L / 2, 0); ctx.lineTo(L / 2 - 9 * S, -7 * S); ctx.lineTo(L / 2 - 9 * S, 7 * S);
  ctx.closePath(); ctx.fillStyle = "#e8575a"; ctx.fill();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(BOT.senFwd * S, side * BOT.senSide * S, 3.4 * S, 0, 7);
    ctx.fillStyle = "#ffe08a"; ctx.fill();
  }
  ctx.restore();

  nameBubble(host ? host.name : b.name, b.x * S, (b.y - 70) * S, accent);
}

/* a little bulb: tap it to switch it, drag it to move it */
/* A sofa should look like a sofa from above. Nothing fancy: enough shape
   that a nine year old can tell the furniture apart at a glance. */
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

/* The three little handles. Everything you can put in the room wears them:
   blue turns it, green makes another one, red takes it away. */
const HANDLE = { turn: ["rgba(91,192,235,0.22)", "rgba(91,192,235,0.78)"],
                 copy: ["rgba(70,195,123,0.22)", "rgba(70,195,123,0.78)"],
                 del:  ["rgba(232,87,90,0.22)",  "rgba(232,87,90,0.82)"] };
function drawHandle(pt, kind) {
  const x = pt.x * S, y = pt.y * S, r = 9 * S, col = HANDLE[kind];
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
  ctx.fillStyle = col[0]; ctx.fill();
  ctx.strokeStyle = col[1]; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.strokeStyle = col[1].replace("0.78", "0.95").replace("0.82", "0.95");
  const d = 4.4 * S;
  ctx.beginPath();
  if (kind === "turn") { ctx.arc(x, y, 4.5 * S, 0.6, 5.1); ctx.lineWidth = 1.6; }
  else if (kind === "copy") {
    ctx.moveTo(x - d, y); ctx.lineTo(x + d, y);
    ctx.moveTo(x, y - d); ctx.lineTo(x, y + d); ctx.lineWidth = 1.8;
  } else {
    ctx.moveTo(x - d * 0.95, y - d * 0.95); ctx.lineTo(x + d * 0.95, y + d * 0.95);
    ctx.moveTo(x + d * 0.95, y - d * 0.95); ctx.lineTo(x - d * 0.95, y + d * 0.95); ctx.lineWidth = 1.9;
  }
  ctx.stroke();
}
// a lamp gets one handle, to take it out; a board gets two, to turn it and to take it away
function lampHandles(L) { return { del: { x: L.x + 105, y: L.y - 80 } }; }
function devHandles(m) {
  const p = placeOf(m), r = m.bot ? BOT.radius : 46;
  return { turn: { x: p.x + r + 52, y: p.y }, del: { x: p.x, y: p.y - (r + 52) } };
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

