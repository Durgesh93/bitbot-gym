/* A loop of black tape for the line-following lessons. Dimmer overhead, so
   the light sensors are not pinned at the top of their scale. */
export default {
  name: "Line track",
  size: 2000,
  walls: true,
  ground: { material: "lino" },
  lamps: [{ x: 1000, y: 1000, kind: "ceiling", on: true }],
  lines: [
    { from: [400, 400], to: [1600, 400], width: 30 },
    { from: [1600, 400], to: [1600, 1600], width: 30 },
    { from: [1600, 1600], to: [400, 1600], width: 30 },
    { from: [400, 1600], to: [400, 400], width: 30 }
  ],
  start: [{ x: 400, y: 1000, heading: -Math.PI / 2 }]
};
