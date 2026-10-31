/* The room: one canvas, and the things a hand can do to it.

   The canvas is drawn by room/renderer.js, which is deliberately not a
   React component - it paints 620x620 pixels sixty times a second and
   React has nothing useful to add to that. React owns the element; the
   renderer owns what is inside it; the snapshot is all that passes between
   them.

   Every control here posts. None of them writes anything.

   THE TOOL IS A MODE, and the pointer means whatever the mode says. That
   is how the old gym worked and it is right for nine-year-olds: one thing
   selected at a time, on screen, with the pointer doing the obvious thing.
   The alternative - modifier keys, right-click menus - is a worse fit for
   a child and hopeless on a Chromebook trackpad. */

import React, { useEffect, useRef, useState } from "react";
import { createRoomRenderer } from "../room/renderer.js";
import { SCENE_NAMES } from "../world/scenes/index.js";

const TOOLS = [
  ["move",  "Drag things",   "pick a robot up and put it somewhere else"],
  ["place", "Add object",    "click the floor to put the chosen thing there"],
  ["take",  "Remove object", "click a thing to take it out of the room"],
  ["pen",   "Draw line",     "drag to lay black tape for a line-following robot"],
  ["erase", "Erase line",    "click or drag over tape to rub it out"]
];

const VIEWS = [
  ["plain",    "Plain",         "just the room"],
  ["light",    "Light sensors", "how bright the floor is to a robot's eyes"],
  ["magnetic", "Magnetic",      "which way the compass points, everywhere"],
  ["sonar",    "Sonar",         "what the front sensor can see from each robot"]
];

export default function RoomView({ snap, post, ask, lightMap }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const dragRef = useRef(null);
  const penRef = useRef(null);          // the line being dragged out right now

  const [tool, setTool] = useState("move");
  const [thing, setThing] = useState("chair");
  const [view, setView] = useState("plain");
  const [trail, setTrail] = useState(true);
  const [catalogue, setCatalogue] = useState([]);

  useEffect(() => {
    if (!rendererRef.current && canvasRef.current) {
      /* The renderer is handed the room's own light map rather than working
         one out: the "Light sensors" view has to be the same numbers the
         sensors read, or it teaches the wrong thing confidently. */
      rendererRef.current = createRoomRenderer(canvasRef.current, lightMap);
    }
    setCatalogue(ask({ cmd: "catalogue" }) || []);
  }, [ask, lightMap]);

  useEffect(() => {
    if (rendererRef.current && snap) {
      try { rendererRef.current.draw(snap, { trail, view, pen: penRef.current }); }
      catch (e) { console.error(e); }
    }
  }, [snap, trail, view]);

  const toRoom = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const S = snap.size / r.width;
    return { x: (e.clientX - r.left) * S, y: (e.clientY - r.top) * S };
  };

  const down = (e) => {
    const p = toRoom(e);
    canvasRef.current.setPointerCapture(e.pointerId);

    /* The click is where the MIDDLE of the thing should land, which is what
       a child means by pointing at the floor; the catalogue measures from a
       corner, so take half its size off. */
    if (tool === "place") { post({ cmd: "thing", name: thing, x: p.x, y: p.y, centred: true }); return; }
    if (tool === "take")  { post({ cmd: "unthing", x: p.x, y: p.y }); return; }
    if (tool === "erase") { post({ cmd: "erase", x: p.x, y: p.y }); return; }
    if (tool === "pen")   { penRef.current = { from: p, to: p }; return; }

    const hit = snap.bodies.find(b => Math.hypot(b.x - p.x, b.y - p.y) <= b.r + 20);
    if (!hit) return;
    dragRef.current = hit.id;
    post({ cmd: "hold", id: hit.id });
  };

  const move = (e) => {
    if (tool === "pen" && penRef.current) {
      /* drawn on the canvas as you drag and only sent to the room when you
         let go: a line half-drawn is not a line the sensors should see */
      penRef.current = { from: penRef.current.from, to: toRoom(e) };
      return;
    }
    if (tool === "erase" && e.buttons) {
      const p = toRoom(e); post({ cmd: "erase", x: p.x, y: p.y }); return;
    }

    const id = dragRef.current;
    if (id == null) return;
    const p = toRoom(e);
    /* Sixty mouse moves a second collapse to wherever the hand ended up,
       so the queue never grows and the robot never lags behind the finger. */
    post({ cmd: "place", id, x: p.x, y: p.y }, { coalesce: "place:" + id });
  };

  const up = () => {
    if (tool === "pen" && penRef.current) {
      const { from, to } = penRef.current;
      penRef.current = null;
      /* a tap is not a line, it is a child deciding not to draw one */
      if (Math.hypot(to.x - from.x, to.y - from.y) > 40) post({ cmd: "line", from, to });
      return;
    }
    const id = dragRef.current;
    if (id == null) return;
    dragRef.current = null;
    post({ cmd: "drop", id });
  };

  const cursor = tool === "move" ? "grab" : tool === "erase" ? "cell" : "crosshair";

  return (
    <div className="roomview">
      {/* The canvas sits in a box that owns the leftover height. Sized
          directly it measures itself against the whole panel and shoves the
          tool rows off the bottom, which is how the second row of tools
          ended up under the log. */}
      <div className="stage">
        <canvas ref={canvasRef} width={620} height={620} id="room"
                style={{ cursor }}
                onPointerDown={down} onPointerMove={move}
                onPointerUp={up} onPointerCancel={up} />
      </div>

      <div className="tools">
        {TOOLS.map(([id, label, why]) => (
          <button key={id} className={tool === id ? "on" : ""} title={why}
                  onClick={() => setTool(id)}>{label}</button>
        ))}
        {tool === "place" && (
          <select value={thing} onChange={e => setThing(e.target.value)}
                  title="what to put down next">
            {catalogue.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}

        <span className="sep" />

        <button onClick={() => post({ cmd: "furnish" })}
                title="scatter a classroom's worth of things">Furnish room</button>
        <button onClick={() => post({ cmd: "empty" })}
                title="take every object out, but leave the lights on">Empty room</button>
        <button onClick={() => post({ cmd: "clearFloor" })}
                title="rub out all the tape">Clear floor</button>

        <span className="sep" />

        <button className={trail ? "on" : ""} onClick={() => setTrail(!trail)}
                title="show where each robot has just been">Trail</button>
        <button onClick={() => post({ cmd: "home" })}
                title="put every robot back where this room starts them">Put robot back</button>
      </div>

      <div className="tools">
        {VIEWS.map(([id, label, why]) => (
          <button key={id} className={view === id ? "on" : ""} title={why}
                  onClick={() => setView(id)}>{label}</button>
        ))}

        <span className="sep" />

        <label className="inline">
          room
          <select value={snap.scene || ""} onChange={e => post({ cmd: "scene", name: e.target.value })}>
            {SCENE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>

        <button onClick={() => post({ cmd: "add" })}>add a robot</button>
        <span className="sep" />

        {(snap.lamps || []).map((L, i) => (
          <button key={i} className={L.on ? "on" : ""}
                  onClick={() => post({ cmd: "lamp", id: i })}>
            {L.kind === "ceiling" ? "ceiling light" : "lamp"} {i + 1}
          </button>
        ))}
        {(snap.speakers || []).map((S, i) => (
          <button key={i} className={S.playing ? "on" : ""}
                  onClick={() => post({ cmd: "speaker", id: i })}>
            speaker {i + 1}
          </button>
        ))}
        {snap.sun && <span className="hint">the sun is doing the lighting here</span>}
      </div>
    </div>
  );
}
