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
  micro:bit and Bitbot drawers are both there. Build blocks, press **Run**, watch the robot.
- **Open a .hex** loads a program you have already built and flashed: the project is stored inside
  the hex, so it comes back as blocks.
- All 103 blocks of the Bit:Bot extension at `v2.1.9` are simulated, taken from the extension's
  own source. Blocks that only work on a Bit:Bot PRO say so instead of pretending.
- Motion is a force model: inertia, grip, rolling and gearbox drag, battery sag and the motor
  mismatch that makes a real robot curve. Light is inverse-square with Lambert's cosine law and
  real projected shadows from the furniture, which is what the light sensors actually read.

The MakeCode panel needs the internet. Everything else runs in the page.
