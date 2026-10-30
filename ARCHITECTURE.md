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

## Environments

A room is data, not code. An environment file says what is in the world:

    export default {
      name: "Obstacle course",
      size: 2000,                       // mm square
      floor: "lino",
      walls: true,
      furniture: [ { x, y, w, h, name: "sofa", reflect: 0.4 } ],
      lamps:     [ { x, y, kind: "floor", on: true } ],
      speakers:  [ { x, y, loud: 430 } ],
      lines:     [ { from: [x, y], to: [x, y] } ],
      start:     [ { x: 400, y: 1600, heading: 0 } ]
    }

Dropping a new file into `environments/` and naming it in the index is the
whole job: a maze, a line-following track, a dark room for the light lesson,
a football pitch. The physics does not change; only the furniture does.

## Devices

A device is a small object with `step(dt)`, `read(what)` and `handle(message)`.
`hardware/microbit.js` and `hardware/bitbot.js` are two of them. A different
robot, or a new sensor, is a new file implementing the same three methods - no
change anywhere else.

## Tests

- **unit** - each hardware part and each piece of physics on its own.
- **blocks** - every block in the API is called at least once. This alone would
  have caught all three of the shadowing bugs.
- **layering** - the import rule in the table above.
- **regression** - every finished `.hex` in the course folder is loaded and run
  headless, and must produce no errors. Eighteen of them today.

`npm test` runs the lot.

## Migrating from the single file

The old `BitBot Gym.html` stays the published app until the new one passes the
regression. Work moves one layer at a time, newest first, so there is never a
day when the gym does not run.
