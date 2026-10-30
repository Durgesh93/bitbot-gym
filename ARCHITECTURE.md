# Bit:Bot Gym - how it is put together

A simulator of a micro:bit and a 4tronix Bit:Bot XL, for a class with one real
robot and ten children. It runs in a browser and installs as an offline app.

## The idea in one picture

A child's blocks do not touch the robot. They send it messages, exactly as a
real micro:bit sends messages to a real Bit:Bot over the I2C wire between them.
Everything in the gym is arranged around that one honest fact.

    blocks the child wrote
            |
            v
    api/microbit.js  api/bitbot.js        the blocks, and nothing else
            |  "go forward at 30"
            v
    core/bus.js                           the orchestrator: every message
            |                             in the gym goes through here
            +--> hardware/microbit.js     a board: screen, buttons, compass
            +--> hardware/bitbot.js       a body: motors, encoders, sensors
                        |
                        v
                world/physics.js          one 5 ms step of the world
                        |
            +-----------+-----------+
            v                       v
    ui/ (React)              room/ (p5)   cards and panels, and the room
                                          drawn on a canvas

Sensor readings come back the same way: the hardware answers a message, so a
test can ask "what does the left eye see here?" without a browser anywhere.

## Two verbs, one bus

| verb | when | who uses it | the real hardware |
|------|------|-------------|-------------------|
| `send(addr, msg)` | now, and hands back the reply | a sensor block that has to give the child a number | a read or write down the I2C wire |
| `post(addr, msg)` | queued, delivered at one point in the tick | the mouse, a key, a button, a radio packet, a Worker | an interrupt: sets a flag, serviced at the next chance |

A human is part of the world too: dragging a robot across the room is a
`post`, not a reach into its variables. There is deliberately **no second
bus**. Two buses would mean two orderings, and the moment an outside event can
land halfway through a physics step the same program stops producing the same
run - which is the one property the whole test suite is built on.

A drag passes `coalesce: "place:3"`, so sixty mouse moves a second collapse to
wherever the hand ended up and the queue never grows.

## The tick, in order

    0. drain the posted queue      the mouse drop lands HERE, between ticks
    1. programs run                they only queue intents
    2. devices -> forces, emitters
    3. world rebuilds its fields
    4. integrate bodies, resolve contacts
    5. devices sample their probes     from the SETTLED world, never during
    6. one snapshot goes out          to the cards and to the room

Sensors read after physics, never during. That is what makes two runs of the
same hex file land in the same place, which is what makes the regression a
real test rather than a vibe. Randomness goes through `core/random.js`, seeded,
for the same reason: a failing run can be replayed instead of wondered about.

## How virtual things interact

Nothing in the gym touches anything else. A device hands the world three
things - a **body** (shape, mass, pose, wheel forces), its **emitters**
(FireLeds, buzzer, radio, the sonar ping) and its **probes** (where it wants
to sample) - and the world has the laws. The laws live in six fields, each one
file with one question to answer.

So every interaction falls out without a line of code that knows about pairs:

| what the child sees | what actually happens |
|---------------------|-----------------------|
| B's light sensor spots A's red FireLeds | A registers a light source; B samples the light field |
| A's sonar detects B | B's body is in the geometry index; A's ray hits it |
| they bump and both get pushed | both bodies are in one contact solver |
| B's microphone hears A's buzzer | A registers a point source; B samples the sound field |
| B gets A's radio message, weaker when far | one radio field, strength from the distance between bodies |
| A casts a shadow that B drives into | A's body is an occluder in the light field |

Add a seventh device next year and it interacts with all of them on the day it
is registered.

### Probes, and what a card is drawn from

A probe is a named point a device wants sampled, given in its own body's
terms: so far forward, so far to one side, this high, facing that way.
`world/senses.js` turns those into room coordinates once the world has
settled and asks the right field. The Bit:Bot's six live in
`hardware/bitbot.js`: two light eyes 55 mm forward and 34 mm apart, tilted
46 degrees off vertical, two line sensors underneath, the sonar at the nose,
the microphone in the middle.

**What comes back is physical** - gym units, millimetres, a surface. The
device turns that into the number a block returns: the LDR curve, the
sonar's 2 m ceiling and its `0` for nothing there, dark or not dark. One
Bit:Bot then works in a classroom and on a playground with nothing changed.

Both go in the snapshot, beside the body, as `senses` and `reads`. **A
robot's card is drawn from `reads` and nothing else** - never from where the
robot is, how fast it is going, or which scene is open. It does not need
them: the robot moved, so its probes landed somewhere new, so the numbers
changed. Somebody flicked a lamp off and the robot did not move at all - the
numbers still changed. One path in, one path out, and nothing to keep in
sync. `test/app/room.test.js` holds that promise from both ends.

## The layers, and the rule that keeps them honest

| folder      | may import            | never imports        |
|-------------|-----------------------|----------------------|
| `core/`     | nothing of ours       | everything           |
| `hardware/` | `core/`               | world, ui, room      |
| `world/`    | `core/`, `hardware/`  | ui, room             |
| `api/`      | `core/`, `hardware/`  | world, ui, room      |
| `app/`      | all of the above      | -                    |
| `ui/`       | `core/`, `app/`       | hardware, world      |
| `room/`     | `core/`, `app/`       | hardware, world      |

A test enforces this, so the layering cannot quietly rot. It is also the fix
for the bug we kept hitting: when the blocks could reach straight into the
robot's variables, a parameter named `b` silently became the robot, and three
separate blocks were broken that way before anyone noticed.

## What each library is for

- **React** - the cards and the panels. These are a list of boards, each
  showing values that change; that is what React is good at.
- **p5** - the room. Instance mode, used as a *renderer only*: our loop tells
  it when to draw. p5 must not own the animation loop, because the simulation
  steps in fixed 5 ms slices and that is what makes it repeatable.
- **Vite** - dev server and build. `vite-plugin-singlefile` inlines everything
  into one `index.html`, so the gym still opens by double-clicking and still
  installs on a school Chromebook with no network.
- **Vitest** - tests. The model has no DOM in it, so they run in node in
  milliseconds.

Nothing else. No state library, no router, no component kit.

## Environments: the six questions

An `Environment` is a scene with its fields built on top, and it is the only
thing a robot may ask about the world. Every scene answers all six, and no
scene answers anything else:

    raycast(from, angle)     how far to the first solid thing, in mm
    lightAt(point, opts)     how much light falls there, in gym units
    soundAt(point, opts)     how loud it is there, 0 upwards
    surfaceAt(point)         what the floor is like underneath
    mediumAt()               the air: temperature, speed of sound, wind
    radioBetween(a, b)       how well two boards hear each other

**The field reports physical quantities; the device turns them into the number
a child reads.** The light field returns gym units, and the Bit:Bot's LDR owns
the saturation curve. The geometry field returns millimetres, and the sonar
owns the 2 m ceiling and the rule that it reports 0 beyond it. That one split
is what lets the same robot work in a classroom and on grass with no change at
all.

`test/contract/environment.contract.js` is the promise every scene makes, and
`scenes.contract.test.js` holds all of them to it - a new scene joins the
moment it is named in the index, and nobody has to remember.

### A scene is data

    export default {
      name: "Playground",
      size: 3000,                       // mm square
      walls: true,                      // a fence, so nobody drives to Sweden
      ground: { material: "grass" },    // lino carpet polished grass tarmac sand
      sky:    { light: 0.004, bounce: 0 },
      sun:    { azimuth: 140, elevation: 28, I: 3, sky: 0.9 },
      medium: { airTemp: 12, wind: [0, 0] },
      radioReach: 70000,
      furniture: [ { name: "hedge", x: 1800, y: 300 } ],
      lamps:     [ { x, y, kind: "ceiling" | "floor", on: true } ],
      speakers:  [ { x, y, loud: 430, reach: 500, playing: false } ],
      lines:     [ { from: [x, y], to: [x, y], width: 30 } ],
      start:     [ { x: 500, y: 2500, heading: 0 } ]
    }

Light is in gym units, where a lit classroom reads about 3. **One unit is
roughly 100 real lux**, which is the conversion to keep in your head when
setting a sky: an overcast noon is 10,000 lux, so 100 units - and at 100 units
the light sensors saturate and a light-seeking program drives straight past the
torch. That is true to the hardware, which is why the shipped `outdoor.js` is a
dull overcast 3 units instead. Turn it up for the lesson, not by default.

Adding a scene is its own file plus one line in `src/world/scenes/index.js`.
Nothing else, anywhere.

### What we deliberately did NOT use

No physics engine and no lighting library. matter.js is not deterministic
enough to bet the regression on, and a differential drive with wheel slip,
encoder counts and gearbox drag is not the rigid-body problem it solves;
planck.js is, but it is 200 KB against a file that has to open offline on a
Chromebook. The lighting libraries produce pixels, and we need values a sensor
can read at a point with a normal. The physics here is about 80 lines of real
Newtonian maths, and the light field matches the published gym to seven
decimal places - there is a test that says so. Replacing tested lines with a
dependency and an adapter is more to debug, not less.

## Devices

A device is a small object with `step(dt)`, `read(what)` and `handle(message)`.
`hardware/microbit.js` and `hardware/bitbot.js` are two of them. A different
robot, or a new sensor, is a new file implementing the same three methods - no
change anywhere else.

## Tests

Four kinds, and `npm test` runs the lot. 161 of them today, in about two
seconds, with no browser anywhere.

- **unit** - each field and each piece of geometry on its own.
  `test/core/`, `test/world/`.
- **contract** - the six questions, asked of every scene the gym ships.
  `test/contract/`. This is the one that pays: on its first run it found two
  real bugs, both silent - a body with no owner was invisible to every ray,
  and two such bodies never collided, because `===` on two `undefined`s says
  they are the same body.
- **parity** - the light field is pinned to the numbers the published gym
  gives, to the last digit. A physics change now has to be a decision.
- **layering** - the import rule in the table above, enforced per file.
- **blocks** - every block in the API called at least once. *Still to write;*
  it alone would have caught all three shadowing bugs.
- **regression** - every finished `.hex` in the course folder loaded and run
  headless. *Still to write.* Eighteen of them. This is the gate the new gym
  has to pass before it replaces the published one.

## Migrating from the single file

The old `BitBot Gym.html` stays the published app until the new one passes the
regression. Work moves one layer at a time, newest first, so there is never a
day when the gym does not run.
