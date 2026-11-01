# The self test

One program that touches every part of the gym once, in order, built as a
real `.hex` so it also exercises the way a lesson actually arrives:
**Open a .hex → blocks in the editor → program on the robot → Play**.

- `Gym Self Test.hex` — the thing to open. Built from the `.ts` beside it
  with the MakeCode CLI, so it carries its own source and reopens as
  blocks, exactly like a week folder's hex.
- `Gym Self Test.ts` — the same source, here to read. The test does not
  read this file; it reads the copy **inside the hex**, so the two cannot
  drift apart without the test noticing.

`test/app/selftest.test.js` runs it headlessly on every `npm test` and
insists it finishes with no errors and no unknown blocks or enums.
UI-CHECKS check 17 is the same program watched by eye, which is the part
a test cannot do: that the lights really go red then green, that the robot
really moves, that the numbers really appear on the screen.

## What it touches

screen (string, icon, number) · buzzer and a tone · the FireLed arms ·
both wheels forward · a spin · sonar · the Bit:Bot light sensors · a line
sensor · the micro:bit light sensor · the microphone · the compass ·
radio send · and the four things a sweep cannot do for itself, on button
A, button B, the logo and a shake.

## Rebuilding it

Only needed if the source changes. The toolchain is not in this repo - it
is rebuilt in a scratchpad each time, and the recipe (the two patches to
the stock MakeCode CLI that make it embed the project source, and the
decompile step that proves there are no grey blocks) is written down in
the lessons folder's CLAUDE.md under **Toolchain**.
