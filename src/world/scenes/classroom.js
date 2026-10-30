/* The room the gym has always opened in: a 2 m square of lino under one
   ceiling panel, with a table and a chair to bump into. */
export default {
  name: "Classroom",
  size: 2000,
  walls: true,
  ground: { material: "lino" },
  lamps: [{ x: 1000, y: 1000, kind: "ceiling", on: true }],
  furniture: [
    { name: "table", x: 1250, y: 420 },
    { name: "chair", x: 1500, y: 900 }
  ],
  speakers: [{ x: 120, y: 120, playing: false }],
  start: [{ x: 400, y: 1600, heading: 0 }]
};
