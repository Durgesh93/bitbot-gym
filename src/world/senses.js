/* Probes: the only way a device is allowed to read the world.

   A device never looks anything up. It declares WHERE it wants to sample, in
   its own body's terms - so far forward, so far out to one side, this high
   off the floor, facing that way - and once a tick, after everything has
   stopped moving, the world fills those points in.

   Two things fall out of that, and they are the whole reason for doing it
   this way:

   A probe cannot cheat. It is handed whatever the field says at that point,
   with no idea what put the light there, so a robot chasing a torch and a
   robot chasing another robot's FireLeds are running the same program. Add a
   seventh kind of light next year and every eye in the room sees it on the
   day it is registered.

   And the numbers all arrive at one instant, from a world that has settled,
   so no two sensors on one robot can disagree about when "now" is. A robot
   whose left eye read before a lamp came on and whose right eye read after
   would chase a shadow that was never there.

   What comes back here is PHYSICAL: gym units of light, millimetres to the
   nearest thing, what the floor is made of. Turning that into the number a
   child's block returns - 0 to 1023, centimetres, dark or not dark - is the
   device's job and lives beside the device. That split is what lets one
   Bit:Bot work in a classroom and on a playground with nothing changed. */

/* Where a probe looks, as a unit vector. `tilt` is the angle off straight up,
   so 0 is a sensor lying on its back staring at the ceiling and Math.PI / 2
   is one looking level at the wall. The Bit:Bot's eyes sit at about 46
   degrees, which is why they see a ceiling lamp AND a torch. */
function facing(heading, tilt) {
  if (tilt == null) return undefined;             // undefined means straight up
  const s = Math.sin(tilt);
  return { x: Math.cos(heading) * s, y: Math.sin(heading) * s, z: Math.cos(tilt) };
}

/* Where a probe sits, in the room, given the body it is bolted to. */
export function placeOf(body, probe) {
  const c = Math.cos(body.h || 0), s = Math.sin(body.h || 0);
  const f = probe.fwd || 0, side = probe.side || 0;
  return { x: body.x + c * f - s * side, y: body.y + s * f + c * side };
}

/* Ask the world every question this body's probes want asking. One body, one
   tick, one object of plain numbers out. `self` is passed to every field so a
   robot is not blinded by its own chassis or shaded by its own lid. */
export function sample(env, body, probes) {
  const out = {};
  for (const p of probes) {
    const at = placeOf(body, p);
    const aim = (body.h || 0) + (p.yaw || 0);
    switch (p.kind) {
      case "light":
        out[p.name] = env.lightAt(at, { z: p.z || 0, normal: facing(aim, p.tilt), self: body.id });
        break;
      case "surface":
        out[p.name] = env.surfaceAt(at);
        break;
      case "range":
        out[p.name] = env.raycast(at, aim, { self: body.id });
        break;
      case "sound":
        out[p.name] = env.soundAt(at, { self: body.id });
        break;
      /* A VECTOR, not a number. Every other probe comes back as one
         quantity because that is all a light sensor or a microphone can
         tell you, but a magnetometer has three axes and the whole point
         of a compass is WHICH WAY the field points, so the field itself
         is what crosses over and the board resolves it onto its own
         axes. */
      case "magnetic":
        out[p.name] = env.magneticAt(at, { z: p.z || 0 });
        break;
      default:
        throw new Error("there is no such probe as a " + p.kind);
    }
  }
  return out;
}
