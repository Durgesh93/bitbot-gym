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
   A whiteboard throws light around a room; a black backpack swallows it. The
   fill is what it looks like from above, because the room is drawn from
   above - these are the gym's own colours and they should stay that way. */
export const CATALOGUE = {
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
  /* outdoors */
  "hedge":      { w: 900, h: 200, z: 700, fill: "#2f5a35", reflect: 0.10 },
  "tree":       { w: 300, h: 300, z: 2200, fill: "#2b5e38", reflect: 0.12, round: true },
  "bench":      { w: 700, h: 200, z: 420, fill: "#6b4b2e", reflect: 0.22 },
  "cone":       { w: 180, h: 180, z: 300, fill: "#d96a2b", reflect: 0.55, round: true },
  "goal":       { w: 900, h: 120, z: 800, fill: "#c9ced8", reflect: 0.60 }
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
    speakers: [],                     // filled in below, from the furniture
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

  /* A speaker is a box you can bump into AND a noise. It goes in the
     furniture, which is where every solid thing lives, and `speakers` holds
     the very same objects so the sound field does not have to go looking.
     One object, two lists, so the two can never disagree. */
  for (const sp of (d.speakers || []).map(speaker)) s.furniture.push(sp);
  s.speakers = s.furniture.filter(f => f.speaker);
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
  const o = { name: "speaker", ...CATALOGUE.speaker, loud: 430, reach: 500,
              playing: false, rot: 0, ...S, speaker: true };
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
