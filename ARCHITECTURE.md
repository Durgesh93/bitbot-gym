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
    app/program.js                        turns the source into something
            |                             that can be paused mid-sentence
            v
    api/microbit.js  api/bitbot.js        the blocks, and nothing else
            |  "go forward at 30"
            v
    app/machine.js                        one robot: a board, a chassis,
            |                             and a program waiting on the clock
            v
    hardware/microbit.js                  a board: screen, buttons, compass
    hardware/bitbot.js                    a body: motors, encoders, probes
            |  forces, emitters, probes
            v
    world/environment.js                  the laws, in six fields
            |  one snapshot
            v
    app/room.js                           the only thing that writes
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
| `ui/`       | `core/`, `app/`, `room/`, `world/scenes/` | hardware, the fields |
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
- **Vite** - dev server and build. `gym.html` is the source entry;
  `npm run build:ship` inlines everything into `index.html`, which is an
  artifact and not a file to edit. One file, no requests, so the gym still
  opens by double-clicking and still installs on a school Chromebook with
  no network. `tools/ship.mjs` undoes Vite's fingerprinting of the manifest
  and the icon - sw.js caches those by their plain names - and refuses to
  ship a build whose markup asks for anything else.
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

### Which engine does what

**matter.js** owns where bodies are and what happens when they collide
(`world/motion.js`). It does not know what a differential drive is, so that
stays ours: two wheel speeds give a forward speed and a turn rate, handed to
Matter as a velocity each step. The trap, which cost an afternoon: 
`Body.setVelocity` takes units per Matter's own base delta of 1000/60 ms, not
per the step you are about to take - so mm/s goes in divided by 60.

**@flatten-js/core** does the exact ray arithmetic. Matter's `Query.ray` says
which bodies a line passes but not how far along, and the sonar is entirely
about how far along, so Matter narrows the field and flatten measures. Its
`Ray` takes a normal rather than a direction, so a `Segment` is used, which is
also the honest shape for a sensor with a 2 m reach.

**visibility-polygon** gives the light field the lit region of a source, which
is what makes a tall thing's shadow run on until it meets a wall. Things
shorter than the lamp get a shadow that ENDS, and that is similar triangles
rather than a visibility problem, so it stays ours.

**No lighting library.** They produce pixels and a sensor needs a value at a
point with a normal. The renderer draws from the profile the field samples for
it, so the picture and the readings come from one place.

The cost of the engines is that a run is no longer bit-identical. That was a
deliberate trade: the regression asserts that eighteen real hex files run
without error and end up somewhere sensible, not that they land on the same
millimetre.

## Devices

A device does not step itself and does not own a clock. It is a bag of state
with four things the rest of the gym uses:

    PROBES          where it wants the world sampled, in its own body's terms
    read(senses)    physical quantities in, the numbers a block returns out
    state()         what the snapshot should carry about it
    (accessors)     wheels(), press(), beep(), encoder() - the wire, in effect

`hardware/microbit.js` and `hardware/bitbot.js` are the two we ship. A
different robot, or a new sensor, is a new file of the same shape and no
change anywhere else. Notice what is *not* there: nothing that knows what
another device is, and nothing that knows what time it is.

## Running a child's program

A child's program is written as though it owns the world - `go forward, pause
one second, turn` - and the gym runs ten of them against a clock that only
moves when the room says so. Three files meet that problem.

`app/program.js` rewrites the source before running it. MakeCode's JavaScript
is synchronous, and the gym cannot block, so every function becomes `async`
and every blocking call gains an `await`. **The order matters and used to be
wrong**: the single file inserted the awaits first, so `function wiggle()`
came out as `function await wiggle()` and any program with a function of its
own died on a syntax error. Async pass first, await pass second, with a guard
so `function (` is never a call site.

`app/machine.js` is one robot that can run one program. `wait(ms)` hands back
a promise and writes down when it should be kept; the room ticks, the clock
moves, and `release()` keeps the promises that have come due. So a program
only ever runs in the gaps between ticks and can never see the world half way
through moving. Stop bumps a token, and everything still waiting on the old
token is rejected with `Stopped`, which unwinds the program wherever it had
got to. That is there because of a real bug: a stopped robot that carried on
driving, because its forever loop was still alive in the background.

`api/` is the blocks and nothing else - 104 of them for the Bit:Bot, the rest
for the board - wrapped in a forgiving proxy so an unknown block says so in
the log instead of killing the program mid-lesson. The proxy is also why
`test/api/blocks.test.js` exists: it would just as happily hide a block that
went missing.

## The single writer

`app/room.js` is the only thing in the gym that writes. Everything else asks
it to. A click is a `post`; it lands on the next drain, which is between
ticks, exactly where a child's hand lands. What comes back out is one
snapshot a tick - plain data, so it survives `JSON.parse(JSON.stringify())`
and would survive a Worker boundary if the gym ever needs one.

That gives the whole app one direction:

    a hand      ->  post     ->  room  ->  hardware  ->  world
    the screen  <-  snapshot <-  room  <-  hardware  <-  world

Each direction has one channel and one shape. The UI holds no state of the
gym at all: `ui/useRoom.js` keeps the room in a ref *outside* React, runs one
rAF loop, and drops each snapshot into a single piece of state. So a
component can do exactly two things - read the snapshot it was handed, and
post a message - and there is nothing for two components to disagree about.

A card is the clearest case. It has no state: the screen, the sensor numbers,
whether the program is running, all of it comes out of one snapshot entry. A
bug in the card can make the gym *look* wrong. It cannot make it *be* wrong.

## Tests

Six kinds, and `npm test` runs the lot. 285 of them today, in about three
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
- **blocks** - every block in the API called at least once, and the list of
  names checked against the API the gym actually builds. The forgiving proxy
  means a block that goes missing answers `undefined` instead of throwing, so
  without this gate it would vanish silently and only a child would find out.
- **regression** - whole programs, run the way a child's program runs:
  in as TEXT, out through `prepare()`, `compile()`, the machine, the chassis
  and the world, for several seconds of gym time. `test/app/samples.test.js`.
  The five programs the Code tab offers, plus one that touches every block in
  the Bit:Bot drawer; the examples live in `src/app/examples.js` so the menu a
  child picks from and the programs the suite runs are the same text.

  Running the text is the point, and it is why this is not the same test as
  **blocks** above. That one calls `api.bitbot.go()` straight off the object
  and never touches the source transform - and the transform is where the
  worst bug so far lived, turning `function wiggle()` into
  `function await wiggle()` and killing every program that defined a function
  of its own. No amount of calling blocks directly would have found it.

  It is deliberately loose about WHERE a robot ends up and strict about
  whether anything went wrong. matter.js is not bit-identical run to run, so
  pinning a millimetre buys a test that fails for the wrong reason every time
  the engine updates.

  (An earlier plan was to run all eighteen course `.hex` files headless. That
  was dropped: it tested the hex pipeline, which is the lessons folder's
  business, rather than the gym.)

## The single file, and what happened to it

**As of 31.10.2026 `index.html` is the OLD single-file gym again, on purpose.**
The React build was shipped over it and pulled back within the hour, because
the rebuild is not at feature parity: the old room has object editing (add,
furnish, empty, name), floor-tape drawing, a trail toggle, "put robot back",
the Plain / Light / Magnetic / Sonar sensor overlays, the robot-settings
sliders (top speed, deadband, torch, grip, motor mismatch, battery, air
resistance, light-sensor invert), "Open a .hex" and a stage mode - and the
rebuild has none of them. Shipping was agreed; the gap was not, because I had
not diffed the two toolbars before asking. **Parity first, then ship again**,
and the check before shipping is that toolbar diff, not the test suite.

The build pipeline below is real and works - `npm run build:ship` is what will
ship it - it just must not be run against the live page until the list above
is closed.

`index.html` was the whole gym - one 169 KB file, hand-maintained - and will
become the build artifact of everything under `src/`. The reason it stays one
file either way is the classroom: the gym has to survive a school
wifi dropping out mid-lesson, so it ships as one file with no requests and
installs as an offline app.

Which means **`index.html` is generated and must never be edited**. Change
`gym.html` or `src/`, run `npm run build:ship`, commit the result. The PWA
wiring - the manifest link, the theme colour, the icon, the service worker -
lives in `gym.html` and `src/ui/main.jsx` for that reason. The worker
registration is behind `import.meta.env.PROD`, because a worker registered
against the dev server caches the dev server, and then the edit you just made
is not the page you are looking at.

`sw.js` names its cache (`bitbot-gym-v35`). Bump it whenever the shell
changes, or a board that is offline keeps serving the gym it already has.
