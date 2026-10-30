/* The playground: grass inside a fence, under an overcast sky.

   Why the sun is only 3 gym units (about 300 lux): that is roughly a dull
   overcast afternoon, and it is the brightest an outdoor scene can be while
   the Bit:Bot's light sensors still tell one direction from another. Turn it
   up to a sunny 600 and the eyes saturate and a light-seeking program drives
   straight past the torch - which is true to the hardware, and makes a good
   lesson, but is not what you want by default.

   Grass also rolls much harder than lino, so the same "go forward at 30"
   covers less ground. Nothing in the robot changed; the floor did. */
export default {
  name: "Playground",
  size: 3000,
  walls: true,                           // a fence, so nobody drives to Sweden
  ground: { material: "grass" },
  sun: { azimuth: 140, elevation: 28, I: 3, sky: 0.9 },
  medium: { airTemp: 12, wind: [0, 0] },
  furniture: [
    { name: "hedge", x: 1800, y: 300 },
    { name: "tree", x: 500, y: 1900 },
    { name: "bench", x: 2100, y: 2300 },
    { name: "cone", x: 1400, y: 1400 }
  ],
  start: [{ x: 500, y: 2500, heading: 0 }]
};
