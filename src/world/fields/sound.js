/* The sound field: how loud it is at one spot.

   An empty room is silent, and every noise falls away with distance, so
   walking a robot towards a speaker makes the number climb. Sources are the
   scene's speakers and, handed in fresh every tick, whatever is beeping: a
   board hears its own buzzer loud and clear and its neighbour's faintly,
   which is exactly how a classroom full of micro:bits sounds.

   The robot's own gearboxes are NOT in here. They sit under the microphone
   on the board itself, so they belong to the device, not the room. */

export function createSound(scene) {
  let emitters = [];        // {owner, x, y, loud, reach}

  const speakers = () => scene.speakers.filter(s => s.playing);

  function at(p, opts) {
    const o = opts || {};
    let v = 0;
    const from = (sx, sy, loud, r0) => {
      const d2 = (sx - p.x) * (sx - p.x) + (sy - p.y) * (sy - p.y);
      v += loud * (r0 * r0) / (r0 * r0 + d2);
    };
    for (const s of speakers()) from(s.x, s.y, s.loud, s.reach);
    for (const e of emitters) {
      if (o.self != null && e.owner === o.self) { v += 255; continue; }   // right beside the microphone
      from(e.x, e.y, e.loud == null ? 250 : e.loud, e.reach == null ? 260 : e.reach);
    }
    return v;
  }

  return {
    at,
    setEmitters(list) { emitters = list || []; },
    emitters: () => emitters,
    speakers
  };
}
