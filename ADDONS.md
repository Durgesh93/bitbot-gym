# Add-ons

What the Bit:Bot can have bolted on, what the gym already pretends to have,
and what is left to build. Kept here so the question "could the gym do the
matrix?" has one answer instead of being re-derived every term.

Three different things get muddled in this conversation, so the list keeps
them apart:

- **on the board** - soldered on, every Bit:Bot has it
- **a real add-on** - a separate 4tronix board you buy and bolt on
- **in the gym** - whether the simulator models it, or just says it cannot

A thing can be an add-on on the real robot and still be fully simulated here.
The sonar is exactly that, which is why "is sonar an add-on?" has two right
answers depending on which robot you mean.

---

## On the board, and modelled

Nothing to build. These are the gym's bread and butter.

| | What the gym does |
|---|---|
| Motors and wheels | Real physics: mass, friction, a motor deadband, a wheel mismatch, and a battery that slows the robot as it tires |
| 12 arm neopixels | `Pixels` in `src/ui/parts.jsx` - six per arm, colour, brightness |
| Line sensors (L, R) | Read the tape on the floor |
| Light sensors (L, R) | Read the room's light, including lamps and shadows |
| Buzzer | Beeps, and the sound carries across the room to other robots |
| Battery | Drains, and drains faster under load |
| Model: Classic / XL / PRO | Picked per robot; PRO-only blocks say so instead of lying |

## On the board, not modelled

| | Why not | Build |
|---|---|---|
| EEROM | The gym has nowhere to keep a number between runs. Says so once. | Small, if anyone ever wants it |
| PRO motion blocks (`go cm`, `spin degrees`, `arc`, PID, encoders) | Only the PRO has them, and the class has an XL. Each says so. | Already correct - do not "fix" |

---

## Real add-ons

### Simulated already

| Add-on | What it is | Gym |
|---|---|---|
| **Ultrasonic (sonar)** | A bolt-on breakout with the HC-SR04 eyes on the front. On the real Bit:Bot you buy and fit it. | **Fully modelled.** Raycast to 2.4 m, returns 0 when nothing is in range (the gym warns about `if sonar < 15` once). Wall Dodger is built on it. |

**Open question for the classroom:** is the ultrasonic actually fitted to our
one Bit:Bot XL? Wall Dodger needs it. Worth checking before a lesson leans on
a hex the real robot cannot run.

### Fittable - the gym has sockets now

Every one of these is a real board you bolt on, and the gym models the
bolting. A robot carries a set of fitted add-ons; a block whose board is
not fitted says so once and does nothing, exactly as the real one does.
The catalogue is `src/hardware/addons.js` and nothing else decides these
facts.

| Add-on | What it is | Blocks | Built |
|---|---|---|---|
| **Ultrasonic eyes** | Measures the distance to what is in front | `sonar` | **yes** - and now gated: unfit it and the sonar returns 0 |
| **IR receiver** | Lets a remote control drive the robot. Built into the PRO (P14); an add-on on every other model (P15) | `onIREventAddon` `irKeyAddon` `lastIRCodeAddon` `irKeyCodeAddon`, and the PRO's plain `onIREvent` family | **yes** - delivery, aim, range and blocking all work |
| **5x5 matrix** | 25 colour LEDs - the micro:bit screen, in colour | `matClear` `setMatrix` `setPixel` `setArrayPixel` `matRainbow` `matRectangle` `matShowEyeball` `matShowImage` `matShow` `matBrightness` | **yes** - state only, no picture in the card yet |
| **BitFace** | Two eyes, a nose and a mouth, in colour. *A different board from the matrix* | `setBitface` `setBitEye` `setBitNose` `setBitMouth` `bitBrightness` | **yes** - state only |
| **OLED screen** | 128x64, for words and numbers that stay put | `oledText` `oledNumber` `oledSet` `oledInvert` `oledZOOM` `oledPlotPixel` `oledLine` `oledRectangle` `oledCircle` `oledUpdate` | **yes** - state only |
| **Talon claw** | A servo-driven jaw on the front | `setTalon` | **yes** - angle only; it cannot pick anything up yet |
| **Servo** | A horn that turns, or a wheel that spins. *The Talon is one particular servo with a jaw on it - this is the plain block* | `bbSetServo` `bb360Servo` `bbServoTrim` `bbServoDeadband` `bbStopServos` | **yes** - state only |

---

## Where this got to

Done, and checked by running it:

- **`src/hardware/addons.js`** - the catalogue. Which models take what,
  what collides with what, what a new robot arrives with, and the
  seventeen real 4tronix remote keys with their real codes (`Up` is 24,
  and a child who looks it up in MakeCode must see 24).
- **`src/hardware/bitbot.js`** - the chassis carries `fit` (what is
  bolted on) and `show` (what each board is displaying). `fit()` refuses
  what the model cannot take and what clashes, and says which. Changing
  the model drops whatever no longer fits, keeping the earlier entry in
  the catalogue, so the eyes beat the claw rather than whichever was
  fitted first.
- **`src/api/bitbot.js`** - every add-on block implemented and gated on
  `needs(id)`. The sonar returns 0 with the eyes off.
- **`src/app/room.js`** - commands `fit`, `fitting`, `model` and `ir`;
  the snapshot carries `fit` and `show` so the card can draw them.

Checked: an XL arrives with the eyes only; the matrix refuses until
fitted and then lights; a Classic refuses the claw while the eyes are on
and names the clash; a PRO refuses an IR module because it has one;
`irKeyCodeAddon("Up")` is 24; a remote pointed at a robot is heard,
pointed away is not, out of reach is not, bounced is heard anyway, and
with the receiver off nothing is.

## What is left

1. **The remote as a thing in the room.** Decided: an object you take
   from the floor menu like a lamp, pick up and point. Clicking it opens
   a keypad. A `beam` setting - "pointed" (a cone out of its nose,
   default) or "bounced" (the whole room). The physics is already
   written and tested in the `ir` command; what is missing is the object
   itself - scene state, `addRemote`/`moveRemote`/`turnRemote` in
   `environment.js`, drawing it in `renderer.js`, and the keypad in the
   UI. The keypad sends `{ cmd: "ir", key, x, y, h, beam }`.
2. **Every fitted board draws itself in the card** - `src/ui/parts.jsx`
   for the pictures, `src/ui/Card.jsx` to place them. Matrix: a colour
   `Screen`. BitFace: four lights in a face. OLED: the `lines` list laid
   out at its coordinates. Talon: a jaw at an angle. Servo: a horn, or
   an arrow spinning. IR: the last key.
   **Nothing shows for a board that is not fitted**, so a plain robot's
   card looks exactly as it does today - the cards were deliberately
   made small and folded and that must not be undone.
3. **Fit and unfit from the robot's menu**, which already opens on a
   click. One row per add-on with a tick, greyed with the reason when
   the model refuses it or something clashes.
4. **Review the Setup menu** and cut what the fitting menu makes
   redundant.
5. **Save and restore `fit`** in `.gym.json` (`src/app/project.js`), and
   decide what an old file without it means - the answer is almost
   certainly "the eyes, and nothing else", which is what `defaultFit`
   already gives.
6. **Tests** for the lot, then a browser pass on the built gym.

## Decisions already taken, so they are not re-argued

- **The ultrasonic arrives fitted.** Everything else starts off. Wall
  Dodger went home as homework and every saved project assumes the
  sonar; a robot without it would break all of that. Taking it off is a
  deliberate act, and then the sonar really does go quiet.
- **Nothing is buffered.** The real extension has a manual update mode,
  but a child whose drawing never appears because they forgot "show
  changes" has learnt only that the gym is broken. `matShow` and
  `oledUpdate` are kept as the harmless blocks they look like.
- **IR is light you cannot see**, so it is simulated as light: straight
  line, blocked by a chair, fading with distance - using the same
  raycast as the sonar. That is the only interesting physics in IR and
  it is nearly free.
- **The remote is the real 4tronix handset**, seventeen keys, real
  codes, so the numbers match the MakeCode drawer.
- **BitFace and the matrix are two different boards.** Fit both and both
  are drawn.
- **The Talon and a plain servo are separate.** The Talon is a servo
  with a jaw; `set servo P1 to 90` is the plain one. A robot can have
  both, on different pins.
