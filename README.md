# Bit:Bot Gym

A simulator for the [4tronix Bit:Bot XL](https://shop.4tronix.co.uk/products/bitbotxl) with the
real MakeCode block editor inside it, built for a Grade 4 micro:bit club where there is one robot
and ten children.

**Open it:** https://durgesh93.github.io/bitbot-gym/

**Install it as an app:** open the link in Chrome, then

- **Chromebook / Windows / Linux:** the ⋮ menu → *Cast, save and share* → *Install page as app…*
- **Mac:** the ⋮ menu → *Cast, save and share* → *Install page as app…*, then find it in Launchpad

It gets its own icon and window, and opens without an address bar.

## What it does

- The genuine `makecode.microbit.org` editor, with the Bit:Bot extension already added, so the
  micro:bit and Bitbot drawers are both there. Press **Code** on a robot's card, build blocks,
  press **Transfer**, then **Play** and watch it go.
- **Open a .hex** loads a lesson you have already built and flashed. A MakeCode hex carries its
  own project inside it, so it comes back as the blocks that made it - and lands on a robot ready
  to run at the same time.
- All 103 blocks of the Bit:Bot extension at `v2.1.9` are simulated, taken from the extension's
  own source. Blocks that only work on a Bit:Bot PRO say so instead of pretending.
- Ten robots at once in one room, each with its own card, program and name, so a class with one
  real Bit:Bot still gets one each.

## The room is simulated, not drawn

Every sensor reads something that was worked out, not something that was decided:

- **Motion** is a force model: inertia, grip, rolling and gearbox drag, battery sag and the motor
  mismatch that makes a real robot curve.
- **Light** is inverse-square with Lambert's cosine law and real projected shadows from the
  furniture.
- **Sound** is a 3-D wave simulation of the air in the room. The quiet far corner, the soft-edged
  shadow behind a cupboard and the ring of a bare room are not three rules - they all fall out of
  the one simulation.
- **Magnetism** is the Earth's field plus any bar magnets you put down, each a real dipole. It
  falls off as the inverse *cube*, so the compass barely notices one across the room and goes mad
  next to it.

The MakeCode panel needs the internet. Everything else runs in the page.
