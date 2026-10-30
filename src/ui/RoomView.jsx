/* The room: one canvas, and the handful of things a hand can do to it.

   The canvas is drawn by room/renderer.js, which is deliberately not a
   React component - it paints 620x620 pixels sixty times a second and
   React has nothing useful to add to that. React owns the element; the
   renderer owns what is inside it; the snapshot is all that passes between
   them.

   Every control here posts. None of them writes anything. */

import React, { useEffect, useRef } from "react";
import { createRoomRenderer } from "../room/renderer.js";
import { SCENE_NAMES } from "../world/scenes/index.js";

export default function RoomView({ snap, post, ask }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    if (!rendererRef.current && canvasRef.current) {
      rendererRef.current = createRoomRenderer(canvasRef.current);
    }
  }, []);

  useEffect(() => {
    if (rendererRef.current && snap) {
      try { rendererRef.current.draw(snap); } catch (e) { console.error(e); }
    }
  }, [snap]);

  const toRoom = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const S = snap.size / r.width;
    return { x: (e.clientX - r.left) * S, y: (e.clientY - r.top) * S };
  };

  const down = (e) => {
    const p = toRoom(e);
    const hit = snap.bodies.find(b => Math.hypot(b.x - p.x, b.y - p.y) <= b.r + 20);
    if (!hit) return;
    dragRef.current = hit.id;
    canvasRef.current.setPointerCapture(e.pointerId);
    post({ cmd: "hold", id: hit.id });
  };

  const move = (e) => {
    const id = dragRef.current;
    if (id == null) return;
    const p = toRoom(e);
    /* Sixty mouse moves a second collapse to wherever the hand ended up,
       so the queue never grows and the robot never lags behind the finger. */
    post({ cmd: "place", id, x: p.x, y: p.y }, { coalesce: "place:" + id });
  };

  const up = () => {
    const id = dragRef.current;
    if (id == null) return;
    dragRef.current = null;
    post({ cmd: "drop", id });
  };

  return (
    <div className="roomview">
      <canvas ref={canvasRef} width={620} height={620} id="room"
              onPointerDown={down} onPointerMove={move}
              onPointerUp={up} onPointerCancel={up} />

      <div className="tools">
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
