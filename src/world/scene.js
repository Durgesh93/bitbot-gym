/* A scene is DATA. It says what is in the world and what the world is made of;
   it never says how anything behaves. That is why a new scene cannot break a
   robot: the robot asks the same questions of every scene.

   Light is in gym units, where a lit classroom reads about 3. One gym unit is
   roughly 100 real lux, which is the conversion to keep in your head when you
   set `sky.light` for outdoors: an overcast noon is 10000 lux, so 100 units.

   Everything else is millimetres, milliseconds and degrees C. */

/* What the floor is made of decides how hard the tyres can push before they
   slip and how much the robot coasts. The first three are the ones the old
   gym had; grass and tarmac came with the outdoor scenes. */
export const MATERIALS = {
  lino:     { mu: 0.70, roll: 0.015, dead: 15, reflect: 0.25 },
  carpet:   { mu: 0.90, roll: 0.045, dead: 24, reflect: 0.18 },
  polished: { mu: 0.35, roll: 0.010, dead: 12, reflect: 0.45 },
  grass:    { mu: 0.85, roll: 0.090, dead: 30, reflect: 0.12 },
  tarmac:   { mu: 0.75, roll: 0.030, dead: 18, reflect: 0.08 },
  sand:     { mu: 0.55, roll: 0.140, dead: 38, reflect: 0.30 }
};

/* How big a thing is, how tall it stands and how much light bounces off it.
   A whiteboard throws light around a room; a black backpack swallows it. */
export const CATALOGUE = {
  table:      { w: 470, h: 330, z: 240, reflect: 0.35 },
  chair:      { w: 190, h: 190, z: 450, reflect: 0.30 },
  sofa:       { w: 300, h: 640, z: 300, reflect: 0.20 },
  box:        { w: 240, h: 240, z: 240, reflect: 0.40 },
  whiteboard: { w: 900, h: 60,  z: 900, reflect: 0.80 },
  backpack:   { w: 220, h: 160, z: 300, reflect: 0.05 },
  bin:        { w: 200, h: 200, z: 320, reflect: 0.25 },
  cone:       { w: 180, h: 180, z: 300, reflect: 0.55 },
  hedge:      { w: 900, h: 200, z: 700, reflect: 0.10 },
  tree:       { w: 300, h: 300, z: 2200, reflect: 0.12 },
  bench:      { w: 700, h: 200, z: 420, reflect: 0.22 },
  wall:       { w: 800, h: 100, z: 900, reflect: 0.50 }
};

const DEFAULTS = {
  name: "Room",
  size: 2000,
  walls: true,
  ground: { material: "lino" },
  sky: { light: 0.004, bounce: 0 },
  sun: null,
  medium: { airTemp: 21, wind: [0, 0] },
  radioReach: 70000,                 // mm; what a real micro:bit manages in the open
  furniture: [],
  lamps: [],
  speakers: [],
  lines: [],
  start: [{ x: 400, y: 1600, heading: 0 }]
};

const fail = msg => { throw new Error("this scene will not load: " + msg); };

/* Fill in everything a scene left out and complain in plain words about
   anything it got wrong, so a broken scene file says so on load rather than
   three seconds into a lesson. */
export function loadScene(data) {
  const d = data || {};
  const s = {
    name: d.name || DEFAULTS.name,
    size: d.size == null ? DEFAULTS.size : d.size,
    walls: d.walls == null ? true : !!d.walls,
    ground: { ...DEFAULTS.ground, ...(d.ground || {}) },
    sky: { ...DEFAULTS.sky, ...(d.sky || {}) },
    sun: d.sun ? { azimuth: 0, elevation: 45, I: 600, ...d.sun } : null,
    medium: { ...DEFAULTS.medium, ...(d.medium || {}) },
    radioReach: d.radioReach == null ? DEFAULTS.radioReach : d.radioReach,
    furniture: (d.furniture || []).map(furnish),
    lamps: (d.lamps || []).map(lamp),
    speakers: (d.speakers || []).map(speaker),
    lines: (d.lines || []).map(line),
    start: (d.start || DEFAULTS.start).map(start)
  };

  if (!(s.size > 200)) fail("the room is " + s.size + " mm across, which is smaller than the robot");
  if (!MATERIALS[s.ground.material]) {
    fail("the ground is \"" + s.ground.material + "\", which is not a material I know ("
         + Object.keys(MATERIALS).join(", ") + ")");
  }
  if (s.sun && !(s.sun.elevation > 0 && s.sun.elevation <= 90)) {
    fail("the sun is " + s.sun.elevation + " degrees up, and it has to be between 0 and 90");
  }
  const g = MATERIALS[s.ground.material];
  s.ground = { reflect: g.reflect, ...s.ground, ...g, material: s.ground.material };
  return s;
}

function furnish(f) {
  const base = CATALOGUE[f.name] || {};
  const o = { name: f.name || "box", rot: 0, ...base, ...f };
  if (!(o.w > 0 && o.h > 0)) fail("a \"" + o.name + "\" has no size");
  if (o.x == null || o.y == null) fail("a \"" + o.name + "\" has nowhere to stand");
  if (o.z == null) o.z = 240;
  if (o.reflect == null) o.reflect = 0.4;
  return o;
}

function lamp(L) {
  const o = { kind: "ceiling", on: true, ...L };
  if (o.x == null || o.y == null) fail("a lamp has nowhere to hang");
  if (o.kind !== "ceiling" && o.kind !== "floor") fail("a lamp is \"" + o.kind + "\"; it must be ceiling or floor");
  return o;
}

function speaker(S) {
  const o = { loud: 430, reach: 500, playing: false, ...S };
  if (o.x == null || o.y == null) fail("a speaker has nowhere to stand");
  return o;
}

/* A line on the floor is a stripe of a given width between two points: the
   line sensors look for it, and it is geometry rather than a drawn bitmap so
   a test can check it with no canvas anywhere. */
function line(l) {
  const o = { width: 30, ...l };
  if (!o.from || !o.to) fail("a line needs a from and a to");
  return o;
}

function start(p) {
  const o = { x: 400, y: 1600, heading: 0, ...p };
  return o;
}
