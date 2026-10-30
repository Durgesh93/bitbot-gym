/* ========================================================================
   2. Physics. A wheel does not jump to its speed: the motor pulls against
      the robot's inertia, the floor pushes back, and the tyres can only
      hold so hard before they slip. Everything below is in SI inside the
      sums and millimetres outside them.
   ======================================================================== */
const G = 9.81;

const FLOORS = {
  lino:     { name: "lino",     mu: 0.70, roll: 0.015, dead: 15 },
  carpet:   { name: "carpet",   mu: 0.90, roll: 0.045, dead: 24 },
  polished: { name: "polished", mu: 0.35, roll: 0.010, dead: 12 }
};

const PHYS = {
  mass: 0.25,          // kg, chassis + micro:bit + batteries
  k: 1.4,              // N per m/s of speed error - how hard the motor pulls
  kBrake: 2.2,         // N per m/s when the motor is shorted out (Brake)
  dragK: 0.5 * 1.225 * 1.0 * 0.010,   // 1/2 rho Cd A, in N per (m/s)^2
  tyreGrip: 0.70,
  roll: 0.015,
  gearDrag: 0.10,      // a geared motor is its own brake: cut the power and it stops quickly
  airOn: true,
  mismatch: 3,         // % the right motor runs faster than the left, as they always do
  floor: "lino"
};

// the commanded speed of a wheel, before the world has its say
// the commanded speed of a wheel, before the world has its say
function wheelSpeed(b, percent) {
  const a = Math.abs(percent);
  if (a <= cfg.dead) return 0;
  const batt = 0.6 + 0.4 * b.batt / 100;              // a tired battery is a slower robot
  const s = cfg.top * batt * (a - cfg.dead) / (100 - cfg.dead);
  return percent < 0 ? -s : s;
}

// how fast one wheel's speed is changing, in mm/s^2, and whether it is slipping
function wheelAccel(b, v, cmdPct, side) {
  const vS = v / 1000;
  let vT = wheelSpeed(b, cmdPct) / 1000;
  if (side === "R") vT *= 1 + PHYS.mismatch / 100;    // the two motors are never twins
  if (b.bias.dir === side) vT *= 1 - b.bias.amount / 100;

  const powered = cmdPct !== 0 && vT !== 0;
  let F = powered ? PHYS.k * (vT - vS)
        : b.brake ? -PHYS.kBrake * vS : 0;            // Brake fights the motion, Coast does not

  const moving = Math.abs(vS) > 1e-3;
  if (moving) {
    const rollC = PHYS.roll + (powered ? 0 : PHYS.gearDrag);
    F -= Math.sign(vS) * rollC * PHYS.mass * G;
    if (PHYS.airOn) F -= Math.sign(vS) * PHYS.dragK * vS * vS;
  }
  let a = F / PHYS.mass;
  const aMax = PHYS.tyreGrip * G;
  let slip = false;
  if (Math.abs(a) > aMax) { a = Math.sign(a) * aMax; slip = true; }
  if (!powered && !moving && Math.abs(F) < (PHYS.roll + PHYS.gearDrag) * PHYS.mass * G * 1.01)
    return { a: -v / (DT / 1000), slip: false };
  return { a: a * 1000, slip: slip };
}

let slipping = false;

function physics(dt) {
  const h = dt / 1000;
  slipping = false;
  for (const b of world.bots) {
    if (b.held) { b.vl = b.vr = 0; continue; }     // you have picked it up, so it waits
    const L = wheelAccel(b, b.vl, b.lm, "L");
    const R = wheelAccel(b, b.vr, b.rm, "R");
    if (L.slip || R.slip) slipping = true;
    b.vl += L.a * h;
    b.vr += R.a * h;
    b.batt = Math.max(0, b.batt - (Math.abs(b.lm) + Math.abs(b.rm)) / 200 * 0.12 * h);
    b.enc.l += b.vl * h;
    b.enc.r += b.vr * h;

    const v = (b.vl + b.vr) / 2;
    const w = (b.vl - b.vr) / BOT.axle;     // canvas y points down, so this is clockwise-positive
    // the board on top feels all of this: a shove along its nose, a push sideways
    // in a turn, and the gearboxes slowly warming the whole robot up
    b.afwd = h > 0 ? (v - b.pv) / h : 0;
    b.aside = v * w;
    b.pv = v;
    const effort = (Math.abs(b.lm) + Math.abs(b.rm)) / 200;
    b.warm = clamp(b.warm + (effort * 1.4 - b.warm * 0.1) * h, 0, 7);
    b.x += v * Math.cos(b.h) * h;
    b.y += v * Math.sin(b.h) * h;
    b.h += w * h;

    let bumped = false;
    const Rr = BOT.radius;
    if (b.x < Rr) { b.x = Rr; bumped = true; }
    if (b.y < Rr) { b.y = Rr; bumped = true; }
    if (b.x > ROOM - Rr) { b.x = ROOM - Rr; bumped = true; }
    if (b.y > ROOM - Rr) { b.y = ROOM - Rr; bumped = true; }

    for (const bx of world.boxes) {
      const l = toLocal(bx, b);
      const near = { x: clamp(l.x, -bx.w / 2, bx.w / 2), y: clamp(l.y, -bx.h / 2, bx.h / 2) };
      let dx = l.x - near.x, dy = l.y - near.y, d = Math.hypot(dx, dy);
      if (d < Rr) {
        if (d < 0.001) { dx = 0; dy = -1; d = 1; }
        const out = toWorld(bx, { x: near.x + dx / d * Rr, y: near.y + dy / d * Rr });
        b.x = out.x; b.y = out.y; bumped = true;
      }
    }
    // and into each other, which is half the fun of having more than one
    for (const o of world.bots) {
      if (o === b) continue;
      const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy);
      if (d < Rr * 2 && d > 0.001) {
        const push = (Rr * 2 - d) / 2;
        b.x += dx / d * push; b.y += dy / d * push;
        o.x -= dx / d * push; o.y -= dy / d * push;
        bumped = true;
      }
    }
    if (bumped) { b.vl *= 0.2; b.vr *= 0.2; }

    if (world.showTrail && Math.abs(v) + Math.abs(w) > 0.5) {
      const last = b.trail[b.trail.length - 1];
      if (!last || Math.hypot(last.x - b.x, last.y - b.y) > 8) {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 900) b.trail.shift();
      }
    }
  }
  shadowsStale = true;
}

/* What a thing is decides how big it is, how tall, and how much light
   bounces off it. A whiteboard throws light around a room; a black
   backpack swallows it. The children can see that in the sensor numbers. */
const CATALOGUE = {
  "table":      { w: 470, h: 330, z: 240, fill: "#8a5a32", reflect: 0.35 },
  "chair":      { w: 190, h: 190, z: 450, fill: "#7a5230", reflect: 0.30 },
  "sofa":       { w: 300, h: 640, z: 300, fill: "#3f5a7a", reflect: 0.20 },
  "wall":       { w: 760, h: 90,  z: 900, fill: "#8d96a6", reflect: 0.55 },
  "whiteboard": { w: 620, h: 70,  z: 900, fill: "#e8edf5", reflect: 0.85 },
  "mirror":     { w: 320, h: 45,  z: 700, fill: "#cfe3f0", reflect: 0.95 },
  "projector":  { w: 200, h: 150, z: 130, fill: "#d3d8e2", reflect: 0.60 },
  "screen":     { w: 620, h: 60,  z: 950, fill: "#f2f4f8", reflect: 0.88 },
  "bookcase":   { w: 230, h: 620, z: 420, fill: "#6b4b2e", reflect: 0.25 },
  "cupboard":   { w: 300, h: 500, z: 800, fill: "#5d4733", reflect: 0.28 },
  "toy box":    { w: 420, h: 200, z: 190, fill: "#4e6b45", reflect: 0.30 },
  "plant":      { w: 260, h: 250, z: 520, fill: "#2f6b43", reflect: 0.18, round: true },
  "bin":        { w: 180, h: 180, z: 350, fill: "#3b4250", reflect: 0.15, round: true },
  "backpack":   { w: 180, h: 140, z: 230, fill: "#2d3b55", reflect: 0.12 },
  "pencil box": { w: 120, h: 65,  z: 50,  fill: "#c0483a", reflect: 0.45 },
  "notebook":   { w: 140, h: 100, z: 20,  fill: "#f0f2f6", reflect: 0.72 },
  "paper":      { w: 150, h: 110, z: 8,   fill: "#fbfcfe", reflect: 0.80 },
  "pen":        { w: 80,  h: 20,  z: 15,  fill: "#2b2f38", reflect: 0.25 },
  "book":       { w: 150, h: 110, z: 35,  fill: "#8a3b52", reflect: 0.35 },
  "box":        { w: 300, h: 150, z: 260, fill: "#50596b", reflect: 0.40 },
  "speaker":    { w: 170, h: 130, z: 280, fill: "#23262e", reflect: 0.14, speaker: true },
  "ceiling light": { light: "ceiling" },
  "floor light":   { light: "floor" },
  "lamp":          { light: "floor" },
  "torch":         { light: "floor" }
};

// which names mean a light rather than a thing light falls on
function lightKind(name) {
  const spec = CATALOGUE[String(name || "").trim().toLowerCase()];
  if (spec && spec.light) return spec.light;
  const n = String(name || "").toLowerCase();
  if (/ceiling light|ceiling lamp/.test(n)) return "ceiling";
  if (/\blight\b|\blamp\b|torch|bulb/.test(n)) return "floor";
  return null;
}

// a name we have never heard of still gets a sensible guess
function lookUp(name) {
  const n = String(name || "").trim().toLowerCase();
  if (CATALOGUE[n]) return Object.assign({}, CATALOGUE[n]);
  for (const k in CATALOGUE) if (n && (n.includes(k) || k.includes(n))) return Object.assign({}, CATALOGUE[k]);
  const pale = /white|paper|mirror|silver|shiny|glass|screen|light/.test(n);
  const dark = /black|dark|navy|charcoal|cloth|fabric|felt|carpet/.test(n);
  return { w: 260, h: 160, z: 200, fill: dark ? "#2a2f3a" : pale ? "#dde3ec" : "#50596b",
           reflect: dark ? 0.12 : pale ? 0.78 : 0.40 };
}

function nameObject(bx, name) {
  const spec = lookUp(name);
  if (!spec.w) return;                     // a light has no body to resize
  const cx = bx.x + bx.w / 2, cy = bx.y + bx.h / 2;
  bx.name = String(name || "").trim() || "box";
  bx.w = spec.w; bx.h = spec.h; bx.z = spec.z;
  bx.fill = spec.fill; bx.reflect = spec.reflect; bx.round = !!spec.round;
  bx.speaker = !!spec.speaker;                     // a speaker can be switched on
  if (!bx.speaker) bx.playing = false;
  bx.x = clamp(cx - bx.w / 2, 0, ROOM - bx.w);
  bx.y = clamp(cy - bx.h / 2, 0, ROOM - bx.h);
  shadowsStale = true;
}

function furnish() {
  const place = [["bookcase", 120, 240], ["table", 620, 400], ["sofa", 1560, 980],
                 ["toy box", 1420, 180], ["plant", 430, 1640], ["whiteboard", 700, 70]];
  world.boxes = place.map(([name, x, y]) => {
    const bx = { x: x, y: y, w: 10, h: 10 };
    nameObject(bx, name);
    bx.x = x; bx.y = y;
    return bx;
  });
}

/* ---- light ------------------------------------------------------------
   Every lamp is a point source: brightness falls with the square of the
   distance, a surface facing away from it catches less (Lambert's cosine
   law), and anything solid in between casts a shadow.
   ---------------------------------------------------------------------- */
/* Things can be turned on the spot, so nothing may assume a box is square
   to the room any more: shadows, bumping into it and the sonar all ask for
   its real corners. */
const objC = bx => Math.cos(bx.rot || 0);
const objS = bx => Math.sin(bx.rot || 0);
function objCentre(bx) { return { x: bx.x + bx.w / 2, y: bx.y + bx.h / 2 }; }
function toLocal(bx, p) {
  const o = objCentre(bx), c = objC(bx), s = objS(bx);
  const dx = p.x - o.x, dy = p.y - o.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}
function toWorld(bx, p) {
  const o = objCentre(bx), c = objC(bx), s = objS(bx);
  return { x: o.x + p.x * c - p.y * s, y: o.y + p.x * s + p.y * c };
}
// turn it, copy it, take it away - kept clear of small things so they do not overlap
function handlesOf(bx) {
  const ox = Math.max(bx.w / 2, 60) + 55, oy = Math.max(bx.h / 2, 60) + 55;
  return {
    turn: toWorld(bx, { x: ox, y: 0 }),
    copy: toWorld(bx, { x: -ox, y: 0 }),
    del: toWorld(bx, { x: 0, y: -oy })
  };
}

function objContains(bx, p) {
  const l = toLocal(bx, p);
  return Math.abs(l.x) <= bx.w / 2 && Math.abs(l.y) <= bx.h / 2;
}
function cornersOf(bx) {
  const hw = bx.w / 2, hh = bx.h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(c => toWorld(bx, { x: c[0], y: c[1] }));
}
/* How long a shadow is, is just similar triangles: a lamp at height H, an
   object of height z standing d away, throws its shadow d*z/(H-z) further on.
   The shadow itself is the whole area the object hides: its own footprint and
   everything behind it, which is the hull of the corners and their shadows. */
function hull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}
function shadowQuad(bx, lamp) {
  const corners = cornersOf(bx);
  const z = Math.min(bx.z || 200, lamp.H - 40);
  const stretch = z / Math.max(1, lamp.H - z);
  const far = corners.map(c => {
    const dx = c.x - lamp.x, dy = c.y - lamp.y, d = Math.hypot(dx, dy) || 1;
    const len = Math.min(d * stretch, 3000);
    return { x: c.x + dx / d * len, y: c.y + dy / d * len };
  });
  return hull(corners.concat(far));
}
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
/* Worked out once a frame and used twice: the full set is what you see, and
   the furniture-only set is what the sensors read. The robot is in the first
   but not the second - its own shadow must not fall on its own eyes. */
let shadowsStale = true;
let SEEN = { lamps: [] };                     // for sensing: the same, tagged with who cast it
function buildShadows() {
  const casters = world.boxes.map(bx => ({ box: bx, owner: bx })).concat(
    world.bots.map(b => ({
      box: { x: b.x - BOT.radius, y: b.y - BOT.radius, w: BOT.radius * 2, h: BOT.radius * 2, z: 95 },
      owner: b
    })));
  SEEN.lamps = world.lamps.map(L => L.on
    ? casters.map(c => ({ poly: shadowQuad(c.box, { x: L.x, y: L.y, H: lampH(L) }), owner: c.owner })) : []);
  shadowsStale = false;        // before the bounce, or it asks for shadows again
  buildBounce();
}
function inShadow(x, y, which, self) {
  const set = SEEN.lamps[which] || [];
  for (const e of set) {
    if (e.owner && e.owner === self) continue;    // your own shadow is not on your own sensors
    if (pointInPoly(x, y, e.poly)) return true;
  }
  return false;
}
/* A classroom ceiling is about 2.5 m up; a lamp standing on the floor has its
   bulb barely above the robot, which is why its light comes in sideways.
   Both are bright: a modern LED panel floods the whole room. */
const lampH = L => (L.kind === "ceiling" ? 2500 : 300);
const lampI = L => (L.kind === "ceiling" ? 18 : cfg.torch / 1000 * 1.6);
const anyCeiling = () => world.lamps.some(L => L.on && L.kind === "ceiling");

function lampsOn() {
  const out = [];
  world.lamps.forEach((L, i) => {
    if (L.on) out.push({ key: i, x: L.x, y: L.y, I: lampI(L), H: lampH(L) });
  });
  return out;
}
// illuminance in arbitrary but consistent units; facing is a heading, or null for "pointing at the ceiling"
let BOUNCE = [];
// each lit object throws a little of that light back into the room
function buildBounce() {
  BOUNCE = [];
  for (const bx of world.boxes) {
    const r = bx.reflect == null ? 0.4 : bx.reflect;
    if (r < 0.05) continue;
    const o = objCentre(bx), cx = o.x, cy = o.y;
    const e = illuminance(cx, cy, undefined, bx, false);
    if (e < 0.02) continue;
    // the lit face is what throws light back: the top, or the sides if it stands tall
    const face = Math.max(bx.w * bx.h, 2 * (bx.w + bx.h) * (bx.z || 100));
    const area = Math.min(1.6, face / 3e5);
    BOUNCE.push({ x: cx, y: cy, I: r * e * 0.35 * area });
  }
}

/* How much light falls on one spot, in three dimensions - because HEIGHT is
   the whole story here. A ceiling light is 2.4 m up, so its light comes almost
   straight DOWN the sensor's z axis and turning the robot on the spot barely
   changes the reading. A torch sits at 110 mm, level with the sensors, so its
   light comes in sideways and the two eyes disagree - which is what makes
   chasing a torch work at all.
     facing a number -> a Bit:Bot eye, which looks up and forward
     facing null     -> the LED screen, lying flat and looking straight up
     facing left out -> no direction at all, for working out room bounce      */
function illuminance(x, y, facing, self, withBounce, sz) {
  if (shadowsStale) { buildShadows(); shadowsStale = false; }
  const z = sz === undefined ? 0 : sz;               // how high the sensor itself is
  let e = anyCeiling() ? 0.28 : 0.004;               // light bouncing round the room
  for (const L of lampsOn()) {
    const dx = L.x - x, dy = L.y - y, dz = L.H - z;
    const d2 = (dx * dx + dy * dy + dz * dz) / 1e6;  // m^2, all three axes
    const d = Math.sqrt(d2) * 1000 || 1;
    let aim = 1;
    if (facing === null) {
      aim = Math.max(dz / d, 0);                     // flat on its back: only what is above counts
      if (aim <= 0) continue;
    } else if (facing !== undefined) {
      const nh = Math.sin(BOT.senTilt), nz = Math.cos(BOT.senTilt);
      const cos = (Math.cos(facing) * nh * dx + Math.sin(facing) * nh * dy + nz * dz) / d;
      if (cos <= 0) continue;                        // the board itself is in the way
      aim = cos;                                     // Lambert, and nothing but Lambert
    }
    if (inShadow(x, y, L.key, self)) continue;       // this spot is in that lamp's shadow
    e += L.I * aim / (d2 + 0.09);                    // inverse square, softened close up
  }
  if (withBounce !== false) {
    for (const B of BOUNCE) {
      const dx = B.x - x, dy = B.y - y;
      e += B.I / ((dx * dx + dy * dy) / 1e6 + 0.3);
    }
  }
  return e;
}
/* A light-dependent resistor saturates: twice the light is nowhere near twice
   the number. HALF is the illuminance at which it reads about half way, so it
   has to sit in the middle of what a lit classroom gives - otherwise every
   reading piles up at the top of the scale and the two eyes look identical. */
const LDR_HALF = 3.0;
function ldr(e, full) {
  const r = e / (e + LDR_HALF);
  return clamp(Math.round(full * Math.pow(r, 0.85)), 0, full);
}
function sensorPoint(b, fwd, side) {
  const c = Math.cos(b.h), s = Math.sin(b.h);
  return { x: b.x + c * fwd - s * side, y: b.y + s * fwd + c * side };
}
function readLightSensor(b, which) {
  const side = which === "L" ? -BOT.senSide : BOT.senSide;
  const p = sensorPoint(b, BOT.senFwd, side);
  const facing = b.h + (which === "L" ? -BOT.senAngle : BOT.senAngle);
  // a moving robot's sensors jitter by a unit or two, which is also what breaks
  // a dead heat between two eyes reading exactly the same thing
  let v = ldr(illuminance(p.x, p.y, facing, b, true, BOT.senZ), 1023)
          + Math.round((Math.random() * 6 - 3) * stirBot(b))
          + (which === "L" ? (b.eyeTrim || 0) : -(b.eyeTrim || 0));
  if (cfg.invert) v = 1023 - v;
  return clamp(v, 0, 1023);
}
// the micro:bit's own screen doubles as a light meter, wherever the board is
function readScreenLight(m) {
  const p = placeOf(m);
  const b = botOf(m);
  return ldr(illuminance(p.x, p.y, null, b, true, b ? BOT.senZ : 5), 255);
}
function readLineSensor(b, which) {
  const side = which === "L" ? -BOT.lineSide : which === "R" ? BOT.lineSide : 0;   // C is the PRO's middle one
  const p = sensorPoint(b, BOT.lineFwd, side);
  return isDark(p.x, p.y) ? 1 : 0;
}

/* ---- the Earth's magnetic field -------------------------------------------
   Over southern Norway the field is about 50 uT but it points steeply DOWN:
   roughly 72 degrees below horizontal. Only the small horizontal part, some
   15 uT, is any use for finding north - which is why a compass is so easily
   upset. North is up the screen; declination tilts true north a little east. */
const FIELD = { total: 50.5, inclination: 72, declination: 3 };
// which way magnetic north lies on the screen, in canvas angles
const MAG_NORTH = -Math.PI / 2 + FIELD.declination * Math.PI / 180;

function compassHeadingDeg(m) {
  const h = (placeOf(m).h * 180 / Math.PI + 90 - FIELD.declination) % 360;
  return Math.round((h + 360) % 360);
}
// what the three axes read, in microtesla, for a board lying flat
function magneticForce(m, axis) {
  const incl = FIELD.inclination * Math.PI / 180;
  const H = FIELD.total * Math.cos(incl);          // the horizontal part, about 15 uT
  const Z = FIELD.total * Math.sin(incl);          // the vertical part, about 48 uT, downwards
  const t = compassHeadingDeg(m) * Math.PI / 180;
  const jit = astir(m) * 0.8;
  const noise = () => (Math.random() - 0.5) * jit;
  if (axis === "x") return Math.round((-H * Math.sin(t) + noise()) * 10) / 10;
  if (axis === "y") return Math.round((H * Math.cos(t) + noise()) * 10) / 10;
  if (axis === "z") return Math.round((Z + noise()) * 10) / 10;
  return Math.round((FIELD.total + noise()) * 10) / 10;
}

/* ---- what the board itself feels ------------------------------------------
   A micro:bit in a child's hand lies flat and still. One bolted to a Bit:Bot
   is shaken by its own gearboxes, warmed by them, shoved along its nose when
   it starts and pushed sideways when it turns. All of that is what the
   microphone, the thermometer and the accelerometer actually read. */
// nothing is perfectly steady while it is being shaken about; sitting still, it is
function stirBot(b) {
  if (!b) return 0;
  return Math.min(1, (Math.abs(b.lm) + Math.abs(b.rm)) / 200 + Math.abs(b.vl + b.vr) / 400);
}
function astir(m) { return stirBot(botOf(m)); }
/* How loud it is at one spot in the room. An empty room is silent - zero -
   and every noise falls away with distance, so walking the robot towards the
   speaker makes the number climb. The noises are: a speaker someone switched
   on, the buzzer on any board that is playing a sound (a board hears its own
   loud and clear, and its neighbour's faintly), and the robot's own gearboxes,
   which sit right under the microphone. */
function soundAt(x, y, me) {
  let v = 0;
  const from = (sx, sy, loud, r0) => {
    const d2 = (sx - x) * (sx - x) + (sy - y) * (sy - y);
    v += loud * (r0 * r0) / (r0 * r0 + d2);
  };
  for (const bx of world.boxes) {
    if (!bx.speaker || !bx.playing) continue;
    const o = objCentre(bx);
    from(o.x, o.y, 430, 500);
  }
  for (const o of world.mbits) {
    if (simTime >= o.beeping) continue;
    if (o === me) { v += 255; continue; }           // the buzzer is right beside the microphone
    const q = placeOf(o);
    from(q.x, q.y, 250, 260);
  }
  return v;
}
function readSoundLevel(m) {
  const p = placeOf(m);
  let v = soundAt(p.x, p.y, m);
  v += stirBot(botOf(m)) * 130;                     // its own motors, and it cannot move away from them
  return clamp(Math.round(v), 0, 255);
}
/* "on loud sound" and "on quiet sound", the way the real board does it: it
   fires once on the way up past loud, and again on the way back down. */
function soundWatch() {
  for (const m of world.mbits) {
    const lvl = readSoundLevel(m);
    const was = !!m.loudState;
    const now = lvl > 150 ? true : lvl < 120 ? false : was;
    if (now === was) continue;
    m.loudState = now;
    const cb = m.handlers[now ? "soundloud" : "soundquiet"];
    if (!cb) continue;
    say("heard it go " + (now ? "loud" : "quiet") + " (" + lvl + ")", "say", m);
    Promise.resolve(cb()).catch(e => { if (!(e instanceof Stopped)) say(e.message, "err", m); });
  }
}
function readTemperature(m) {
  const b = botOf(m);
  return Math.round(21 + 1 + (b ? b.warm : 0));    // the chip always reads a bit above the room
}
/* Milli-g on each axis, and it is the SHOVE the board feels, with gravity
   left out: a board sitting still reads 0, 0, 0, and a number only appears
   when something actually pushes it. (A real micro:bit also feels the 1024
   of gravity pulling down its z axis; leaving it out is what makes these
   three numbers readable for a nine year old.) */
function accelMg(m, axis) {
  const b = botOf(m);
  const shake = astir(m) * 30;
  const n = () => (Math.random() - 0.5) * shake;    // still means still
  const fx = (b ? b.aside : 0) / 9.81, fy = (b ? b.afwd : 0) / 9.81;   // mm/s^2 -> milli-g
  if (axis === "x") return Math.round(fx + n());
  if (axis === "y") return Math.round(fy + n());
  if (axis === "z") return Math.round(n());
  return Math.round(Math.sqrt(fx * fx + fy * fy));
}
function rotationDeg(m, which) {
  const a = accelMg(m, which === "pitch" ? "y" : "x");
  return Math.round(Math.atan2(a, 1024) * 180 / Math.PI);
}

/* ---- sonar: a cone, not a laser, and a wall at a slant sends the ping away --- */
function rayDistance(ox, oy, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let d = 0; d < 2400; d += 4) {
    const x = ox + c * d, y = oy + s * d;
    if (x < 0 || y < 0 || x > ROOM || y > ROOM) {
      const nx = x < 0 ? 1 : x > ROOM ? -1 : 0, ny = y < 0 ? 1 : y > ROOM ? -1 : 0;
      /* A wall is painted plaster, not a mirror: it scatters the ping about, so
         an echo comes back even from a fair slant. Only a really glancing hit,
         past about 75 degrees, loses it altogether - which is also how the
         furniture behaves, since a box echoes whatever angle it is hit at. */
      return Math.abs(c * nx + s * ny) < 0.25 ? Infinity : d;
    }
    for (const bx of world.boxes) if (objContains(bx, { x: x, y: y })) return d;
  }
  return Infinity;
}
function readSonar(b) {
  const c = Math.cos(b.h), s = Math.sin(b.h);
  const ox = b.x + c * BOT.sonarFwd, oy = b.y + s * BOT.sonarFwd;
  let best = Infinity;
  for (let i = -3; i <= 3; i++) best = Math.min(best, rayDistance(ox, oy, b.h + i * 0.044));  // a 15 degree cone
  const cm = Math.round(best / 10);
  return (!isFinite(cm) || cm > 200) ? 0 : Math.max(2, cm);        // past 2 m the real one returns 0
}

