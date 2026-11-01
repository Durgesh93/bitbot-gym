/* A project: a whole lesson's room, saved and opened again.

   WHAT THIS IS FOR. Setting the room up is most of the lesson's setup
   cost, and almost none of it is the code. Line Tracker wants a line
   drawn on the floor; Pocket Compass wants a magnet put down; Dice Duel
   and Emoji Messenger want TWO boards on the same radio group with a
   different program on each. Doing that by hand costs five minutes of a
   forty minute lesson and goes wrong in front of the class. A project is
   that setup, saved once and opened in a second next week.

   WHAT IS IN ONE. Everything a teacher arranged and nothing the gym can
   work out for itself: the furniture, the lamps and whether they are on,
   the speakers and whether they are playing, the magnets and which way
   round, the lines on the floor, the robot tuning, and each board - its
   name, where it stands, which way it faces, its radio group, the code
   on it, and the MakeCode project behind that code so the BLOCKS come
   back too, not just the text.

   WHAT IS NOT IN ONE. Anything the gym recomputes: the light field, the
   sound field, sensor readings, the clock. Those are all consequences of
   the above, and saving a consequence is how a file starts disagreeing
   with the thing it describes.

   The two halves here are deliberately pure - they take a snapshot and
   give back data, or take data and give back a list of commands. Nothing
   in here touches localStorage or the DOM, which is what lets the whole
   round trip be tested in node. The shelf it all sits on is shelf.js. */

export const FORMAT = 1;

/* However a point is written, out as {x, y}. */
const point = p => (Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y });

/* ---- saving ------------------------------------------------------- */

/* snap: what the room says about itself. saved: one entry per board id,
   as the room's `saved` command gives it - name, kind, group and the code
   on it. editors: the MakeCode project for each board id, which the gym
   keeps outside the room because the room has no idea the editor exists. */
export function capture(snap, saved, editors, name) {
  const code = saved || {};
  const byId = editors || {};
  return {
    gym: FORMAT,
    name: String(name || "").trim() || "a room",
    saved: new Date().toISOString(),
    room: {
      scene: snap.scene,
      /* Furniture goes back by NAME, because the catalogue owns a thing's
         size, height and how much sound it drinks. Saving those too would
         mean a project opened after the catalogue changed quietly brought
         the old table back with it. */
      furniture: (snap.furniture || [])
        .filter(f => !f.speaker)
        .map(f => ({ name: f.name, x: f.x, y: f.y, rot: f.rot || 0 })),
      speakers: (snap.speakers || [])
        .map(S => ({ x: S.x, y: S.y, rot: S.rot || 0, playing: !!S.playing })),
      lamps: (snap.lamps || [])
        .map(L => ({ kind: L.kind, x: L.x, y: L.y, on: L.on !== false })),
      magnets: (snap.magnets || [])
        .map(M => ({ x: M.x, y: M.y, rot: M.rot || 0 })),
      /* A LINE WEARS THREE DIFFERENT SHAPES on its way through the gym,
         and this is the join between them. It is DRAWN as
         {from:{x,y}, to:{x,y}, width}; the room KEEPS it as
         {from:[x,y], to:[x,y]}; and what a snapshot shows is the surface
         field's own working copy, {a, b, half, reflect} - half being
         half the width, because that is what the field measures against.
         Copying a line out of a snapshot and handing it straight back
         therefore puts undefined into addLine. The file uses the drawn
         form, which is the one a person could read. */
      lines: (snap.lines || []).map(l => ({
        from: point(l.a || l.from), to: point(l.b || l.to),
        width: l.width != null ? l.width : (l.half || 15) * 2
      }))
    },
    tuning: snap.tuning ? { ...snap.tuning } : null,
    /* A BOARD IS ONE THE ROOM OWNED UP TO, not one the snapshot happens
       to have dressed. A snapshot only hangs a `program` on a body once
       the senses have run, so in a room that has been set up but not yet
       ticked - which is exactly a room somebody just arranged and is
       about to save - every board looked like a plain body and the file
       came out with none in it. */
    boards: (snap.bodies || []).filter(b => code[b.id]).map(b => {
      const k = code[b.id];
      return {
        name: k.name,
        kind: k.kind,
        x: Math.round(b.x), y: Math.round(b.y), h: b.h || 0,
        group: k.group || 0,
        code: k.code || "",
        editor: byId[b.id] || null
      };
    })
  };
}

/* ---- opening ------------------------------------------------------ */

/* A project file is the one thing in the gym that can arrive from outside
   it - off a USB stick, out of an email - so it is checked rather than
   trusted. It says what is wrong in words a teacher can act on. */
export function check(p) {
  if (!p || typeof p !== "object") return "that file is not a saved project";
  if (p.gym !== FORMAT)
    return p.gym > FORMAT
      ? "that project was saved by a newer gym than this one"
      : "that file is not a saved project, or is too old to open";
  if (!p.room || typeof p.room !== "object") return "that project has no room in it";
  if (!Array.isArray(p.boards)) return "that project has no boards in it";
  return null;
}

/* THE PLAN FOR REBUILDING IT. Not posted from in here: this stays pure so
   the whole round trip can be tested in node, and so the caller decides
   what a half-finished open means.

   It comes back in two parts because the second needs the first to have
   run. A board is added and the room hands back its id; only then can the
   radio group and the code be sent to it. The caller must also take the
   robots that are already in the room out first - a project says exactly
   what is in the room, and anything left over is somebody else's lesson. */
export function restore(p) {
  const bad = check(p);
  if (bad) throw new Error(bad);
  const r = p.room || {};
  const room = [];

  /* Start from the bare room and build up. `scene` reopens it, `empty`
     takes out the furniture it came with and `clearFloor` the lines. */
  room.push({ cmd: "scene", name: r.scene || "classroom" });
  room.push({ cmd: "bare" });

  for (const f of r.furniture || [])
    room.push({ cmd: "thing", name: f.name, x: f.x, y: f.y, rot: f.rot || 0 });

  /* A SPEAKER GOES BACK IN THROUGH THE FURNITURE DOOR, not through
     `addSpeaker`, and both halves of that matter. `addSpeaker` is the
     Room menu's door: it looks for a clear spot, because a child
     pressing "Speaker" means "put one somewhere sensible", and it
     switches the new one ON, because nobody adds a silent speaker. A
     project means the opposite - put it back EXACTLY there, playing or
     silent exactly as it was - and the plain `thing` command does that.
     It still lands in both lists, because a speaker is listed as a
     source by what it IS, not by which door it came through.

     Speakers and lamps are then switched by their place in the room's
     own list, so they are counted as they go in rather than trusting
     the index they were saved under. The switch is always sent, never
     only for the on case: a speaker that was saved silent has to be
     TOLD it is silent. */
  let speakers = 0, lamps = 0;
  for (const S of r.speakers || []) {
    room.push({ cmd: "thing", name: "speaker", x: S.x, y: S.y, rot: S.rot || 0 });
    room.push({ cmd: "speaker", id: speakers, playing: !!S.playing });
    speakers++;
  }

  /* Lamps and magnets DO come back through their own door, because a
     lamp knows how to be a floor lamp or a ceiling lamp and a magnet
     has to be made - but both of those doors look for a clear spot too,
     so each one is then moved onto the exact spot it was saved at. A
     room that opens a few centimetres off is a room whose readings
     disagree with the lesson. */
  for (const L of r.lamps || []) {
    room.push({ cmd: "addLamp", x: L.x, y: L.y, kind: L.kind });
    room.push({ cmd: "moveLamp", id: lamps, x: L.x, y: L.y });
    if (L.on === false) room.push({ cmd: "lamp", id: lamps, on: false });
    lamps++;
  }

  let magnets = 0;
  for (const M of r.magnets || []) {
    room.push({ cmd: "addMagnet", x: M.x, y: M.y, rot: M.rot || 0 });
    room.push({ cmd: "moveMagnet", id: magnets, x: M.x, y: M.y });
    magnets++;
  }

  for (const l of r.lines || [])
    room.push({ cmd: "line", from: point(l.from), to: point(l.to), width: l.width });

  if (p.tuning) room.push({ cmd: "tune", ...p.tuning });

  /* The boards last, so they arrive into a finished room rather than
     standing where a table is about to be put. */
  const boards = p.boards.map(b => ({
    add: { cmd: "add", kind: b.kind === "microbit" ? "microbit" : "bitbot",
           name: b.name, x: b.x, y: b.y, heading: b.h || 0 },
    group: b.group || 0,
    code: b.code || "",
    editor: b.editor || null
  }));

  return { room, boards };
}
