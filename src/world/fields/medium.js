/* The medium field: the air itself.

   Indoors this is dull and constant. Outdoors it is the reason a scene feels
   different: colder air carries sound more slowly, so a sonar that assumes
   room temperature reads a little long, and a breeze pushes a light robot
   about. Both are small, both are real, and both come from the scene file
   rather than from any robot. */

const T_REF = 20;                                   // what a sonar is calibrated at

export function createMedium(scene) {
  const m = scene.medium;

  /* The textbook line: 331.3 m/s at freezing, and 0.606 m/s per degree. */
  const speedOfSound = t => 331.3 + 0.606 * (t == null ? m.airTemp : t);

  /* What a sonar's reading is multiplied by when it still believes it is in a
     20 degree room. Cold air -> sound is slower -> the echo takes longer ->
     the robot thinks the wall is further away. */
  const sonarScale = () => speedOfSound(T_REF) / speedOfSound();

  function at() {
    return {
      airTemp: m.airTemp,
      speedOfSound: speedOfSound(),
      sonarScale: sonarScale(),
      wind: { x: m.wind[0], y: m.wind[1] }
    };
  }

  return { at, speedOfSound, sonarScale, wind: () => ({ x: m.wind[0], y: m.wind[1] }) };
}
