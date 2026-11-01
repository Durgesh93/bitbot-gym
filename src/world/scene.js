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
/* `reflect` is how much LIGHT comes back off it, `absorb` is how much SOUND
   it swallows - the published mid-frequency absorption coefficients, where
   a hard floor keeps almost everything in the room and a carpet or a lawn
   takes a third of it away. The two are not related: lino is dark to look
   at and brilliant to a loudspeaker. */
export const MATERIALS = {
  lino:     { mu: 0.70, roll: 0.015, dead: 15, reflect: 0.25, absorb: 0.03 },
  carpet:   { mu: 0.90, roll: 0.045, dead: 24, reflect: 0.18, absorb: 0.35 },
  polished: { mu: 0.35, roll: 0.010, dead: 12, reflect: 0.45, absorb: 0.02 },
  grass:    { mu: 0.85, roll: 0.090, dead: 30, reflect: 0.12, absorb: 0.45 },
  tarmac:   { mu: 0.75, roll: 0.030, dead: 18, reflect: 0.08, absorb: 0.03 },
  sand:     { mu: 0.55, roll: 0.140, dead: 38, reflect: 0.30, absorb: 0.55 }
};

/* How big a thing is, how tall it stands and how much light bounces off it.
   A whiteboard throws light around a room; a black backpack swallows it. The
   fill is what it looks like from above, because the room is drawn from
   above - these are the gym's own colours and they should stay that way. */
export const CATALOGUE = {
  "table":      { w: 470, h: 330, z: 240, fill: "#8a5a32", reflect: 0.35, absorb: 0.08 },
  "chair":      { w: 190, h: 190, z: 450, fill: "#7a5230", reflect: 0.30, absorb: 0.12 },
  "sofa":       { w: 300, h: 640, z: 300, fill: "#3f5a7a", reflect: 0.20, absorb: 0.6 },
  "wall":       { w: 760, h: 90,  z: 900, fill: "#8d96a6", reflect: 0.55, absorb: 0.05 },
  "whiteboard": { w: 620, h: 70,  z: 900, fill: "#e8edf5", reflect: 0.85, absorb: 0.05 },
  "mirror":     { w: 320, h: 45,  z: 700, fill: "#cfe3f0", reflect: 0.95, absorb: 0.02 },
  "projector":  { w: 200, h: 150, z: 130, fill: "#d3d8e2", reflect: 0.60, absorb: 0.1 },
  "screen":     { w: 620, h: 60,  z: 950, fill: "#f2f4f8", reflect: 0.88, absorb: 0.1 },
  "bookcase":   { w: 230, h: 620, z: 420, fill: "#6b4b2e", reflect: 0.25, absorb: 0.3 },
  "cupboard":   { w: 300, h: 500, z: 800, fill: "#5d4733", reflect: 0.28, absorb: 0.1 },
  "toy box":    { w: 420, h: 200, z: 190, fill: "#4e6b45", reflect: 0.30, absorb: 0.25 },
  "plant":      { w: 260, h: 250, z: 520, fill: "#2f6b43", reflect: 0.18, round: true, absorb: 0.35 },
  "bin":        { w: 180, h: 180, z: 350, fill: "#3b4250", reflect: 0.15, round: true, absorb: 0.12 },
  "backpack":   { w: 180, h: 140, z: 230, fill: "#2d3b55", reflect: 0.12, absorb: 0.4 },
  "pencil box": { w: 120, h: 65,  z: 50,  fill: "#c0483a", reflect: 0.45, absorb: 0.08 },
  "notebook":   { w: 140, h: 100, z: 20,  fill: "#f0f2f6", reflect: 0.72, absorb: 0.12 },
  "paper":      { w: 150, h: 110, z: 8,   fill: "#fbfcfe", reflect: 0.80, absorb: 0.12 },
  "pen":        { w: 80,  h: 20,  z: 15,  fill: "#2b2f38", reflect: 0.25, absorb: 0.08 },
  "book":       { w: 150, h: 110, z: 35,  fill: "#8a3b52", reflect: 0.35, absorb: 0.15 },
  "box":        { w: 300, h: 150, z: 260, fill: "#50596b", reflect: 0.40, absorb: 0.14 },
  /* loud and reach live here and ONLY here, so a speaker put into a room
     by hand is as loud as one the scene stood there - without them it was
     a silent box that read NaN, and with them in two places one of the two
     went stale.

     `loud` IS IN MICROPHONE UNITS, which is what makes it a number that
     has to be measured rather than chosen. It was set at 430 when the only
     thing a microphone heard was the straight path; the room ringing
     doubles that over most of a small hard classroom, and at 430 the
     microphone pinned at 255 everywhere and the sound lesson had no
     gradient left to teach with. At 185 the far corner of the classroom
     reads about 90 and standing next to it about 245, which is a slope a
     child can walk a robot up. */
  "speaker":    { w: 170, h: 130, z: 280, fill: "#23262e", reflect: 0.14, speaker: true,
                  absorb: 0.2, loud: 70, reach: 500, playing: false },
  /* outdoors */
  "hedge":      { w: 900, h: 200, z: 700, fill: "#2f5a35", reflect: 0.10, absorb: 0.5 },
  "tree":       { w: 300, h: 300, z: 2200, fill: "#2b5e38", reflect: 0.12, round: true, absorb: 0.4 },
  "bench":      { w: 700, h: 200, z: 420, fill: "#6b4b2e", reflect: 0.22, absorb: 0.12 },
  "cone":       { w: 180, h: 180, z: 300, fill: "#d96a2b", reflect: 0.55, round: true, absorb: 0.08 },
  "goal":       { w: 900, h: 120, z: 800, fill: "#c9ced8", reflect: 0.60, absorb: 0.06 }
};

const DEFAULTS = {
  name: "Room",
  size: 2000,
  walls: true,
  ground: { material: "lino" },
  /* `walls` is how much light the walls and ceiling throw back and
     `wallsAbsorb` is how much sound they swallow. Both are what the room
     itself is made of; `light` and `bounce` are what comes in from
     outside it. The ceiling gets its own absorption because in a school it
     is the treated surface - acoustic tile, because the regulations ask
     for it.

     `wallsAbsorb` WAS 0.15, WHICH IS BARE PLASTER, AND IT WAS WRONG. Walk
     into a Grade 4 classroom and there is barely a square foot of plaster
     showing: it is corkboard, sugar paper, painting after painting,
     curtains along one side. All of that is soft, and soft walls swallow
     around half of what hits them rather than a seventh.

     It is not a decorating note, it is the number that decides whether
     this room is worth listening in. The walls are three quarters of the
     surface in here, so at 0.15 the sound bounced so freely that past
     about a foot from the speaker the room was simply the same loudness
     everywhere - the reading changed by a factor of three across the
     whole floor, a cupboard made no odds at all, and the corners came out
     LOUDER than the middle. Which is exactly how a tiled bathroom
     behaves, and exactly how a classroom does not. */
  sky: { light: 0.004, bounce: 0, walls: 0.5, wallsAbsorb: 0.55, ceilingAbsorb: 0.60 },
  sun: null,
  medium: { airTemp: 21, wind: [0, 0] },
  radioReach: 70000,                 // mm; what a real micro:bit manages in the open
  furniture: [],
  lamps: [],
  magnets: [],
  speakers: [],
  lines: [],
  start: [{ x: 400, y: 1600, heading: 0 }]
};

const fail = msg => { throw new Error("this scene will not load: " + msg); };

/* Fill in everything a scene left out and complain in plain words about
   anything it got wrong, so a broken scene file says so on load rather than
   three seconds into a lesson. */
export function loadScene(data) {
  nextUid = 1;
  /* A NAME IS NOT A SCENE. `loadScene("classroom")` spread the string's
     characters over the defaults and handed back a silently empty room -
     no lamps, no table - which then looks like a broken light field
     rather than a wrong argument. Scenes are looked up by name in
     scenes/index.js; this takes the data. */
  if (typeof data === "string")
    fail("loadScene wants the scene's data, not the name \"" + data + "\"" +
         " - look it up in SCENES first");
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
    furniture: (d.furniture || []).map(makeThing),
    lamps: (d.lamps || []).map(makeLamp),
    magnets: (d.magnets || []).map(makeMagnet),
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

/* A number each thing keeps for as long as it is in the room. The pointer
   needs it: a drag has to hold on to ONE chair for the length of the drag,
   and "whatever is under the mouse" stops being that chair the moment the
   mouse leaves it. Position cannot be the name of a thing you are moving.

   It counts from one again at every scene load, and that is not tidiness:
   the whole test suite rests on the same seed and the same scene giving the
   same room, and a counter that remembered the last scene would make the
   second open of the classroom differ from the first by nothing but these
   numbers. */
let nextUid = 1;

export function makeThing(f) {
  const base = CATALOGUE[f.name] || {};
  const o = { name: f.name || "box", rot: 0, ...base, ...f };
  if (o.uid == null) o.uid = nextUid++;
  if (!(o.w > 0 && o.h > 0)) fail("a \"" + o.name + "\" has no size");
  if (o.x == null || o.y == null) fail("a \"" + o.name + "\" has nowhere to stand");
  if (o.z == null) o.z = 240;
  if (o.reflect == null) o.reflect = 0.4;
  return o;
}

export function makeLamp(L) {
  const o = { kind: "ceiling", on: true, ...L };
  if (o.uid == null) o.uid = nextUid++;
  if (o.x == null || o.y == null) fail("a lamp has nowhere to hang");
  if (o.kind !== "ceiling" && o.kind !== "floor") fail("a lamp is \"" + o.kind + "\"; it must be ceiling or floor");
  return o;
}

/* A bar magnet lying flat on the floor. `moment` is how strong it is, in
   ampere metres squared - a classroom magnet is a few - and `rot` is the
   way its north pole points. Deliberately NOT furniture: it is a little
   block of steel, and it neither casts a sound shadow nor blocks a light. */
export function makeMagnet(M) {
  const o = { moment: 4, rot: 0, z: 20, on: true, ...M };
  if (o.uid == null) o.uid = nextUid++;
  if (o.x == null || o.y == null) fail("a magnet has nowhere to lie");
  if (!(o.moment > 0)) fail("a magnet with no strength is not a magnet");
  return o;
}

function speaker(S) {
  const o = { name: "speaker", ...CATALOGUE.speaker,
              playing: false, rot: 0, ...S, speaker: true };
  if (o.uid == null) o.uid = nextUid++;
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


/* FURNISHING A ROOM AT RUNTIME.

   The old gym had a "Furnish room" button and it earned its place: a bare
   square teaches nothing, and typing twelve pieces of furniture into a
   scene file is not something you do between two lessons. This scatters a
   believable classroom, keeping things off each other and off the middle
   of the floor so there is still somewhere to drive.

   It takes the random source as an argument rather than reaching for the
   global one, because a test that cannot pin the layout cannot assert
   anything about it. */
const SCATTER = ["table", "chair", "chair", "bookcase", "plant", "bin",
                 "backpack", "toy box", "notebook", "cupboard", "box", "pencil box"];

export function scatterThings(scene, rng, how_many) {
  const want = how_many == null ? 9 : how_many;
  const made = [];
  const taken = scene.furniture.slice();
  const clash = (o) => taken.some(t =>
    o.x < t.x + t.w + 90 && o.x + o.w + 90 > t.x &&
    o.y < t.y + t.h + 90 && o.y + o.h + 90 > t.y);

  for (let i = 0; i < want; i++) {
    const name = SCATTER[Math.floor(rng.next() * SCATTER.length)];
    const base = CATALOGUE[name];
    if (!base) continue;
    /* twenty tries, then give up on this one - a crowded room should get
       fewer things, never an infinite loop */
    for (let go = 0; go < 20; go++) {
      const o = makeThing({
        name: name,
        x: 180 + rng.next() * (scene.size - 360 - base.w),
        y: 180 + rng.next() * (scene.size - 360 - base.h),
        rot: rng.next() < 0.5 ? 0 : Math.PI / 2
      });
      if (clash(o)) continue;
      taken.push(o); made.push(o);
      break;
    }
  }
  return made;
}
