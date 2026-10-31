/* The gym.

   Three tabs and a room. The whole of the state React owns is which tab is
   showing, which board the editor is pointed at, and the last snapshot -
   and the snapshot is not really state, it is the latest photograph of
   something that lives elsewhere.

   Everything a hand does becomes a posted message. Nothing here writes to
   the world. That is the one rule, and it is the reason a bug in this file
   can make the gym look wrong but never make it BE wrong. */

import React, { useState, useCallback } from "react";
import { useRoom } from "./useRoom.js";
import RoomView from "./RoomView.jsx";
import Card from "./Card.jsx";
import BlocksTab from "./BlocksTab.jsx";
import CodeTab from "./CodeTab.jsx";

export default function App() {
  const { snap, lines, post, ask, speed, setSpeed, running, setRunning, clearLines } = useRoom();
  const [tab, setTab] = useState("room");
  const [chosen, setChosen] = useState(1);
  const [projects, setProjects] = useState({});
  const [code, setCode] = useState("");
  /* Which crowded cards the teacher has opened up. This is view state and
     nothing else - the gym does not know or care, and losing it on reload
     costs nobody anything. */
  const [open, setOpen] = useState(() => new Set());

  const boards = snap.bodies || [];
  /* Past four robots a wall of full cards stops being readable, so they
     fold down to a line each and open on a click. Four is where two
     columns of full cards stop fitting a laptop screen. */
  const crowd = boards.length > 4;
  const toggle = useCallback(id => setOpen(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  }), []);
  const setProject = useCallback((id, project) => {
    setProjects(old => ({ ...old, [id]: project }));
  }, []);

  /* Transfer is the gym's version of dragging a .hex onto the board: the
     code lands, the card goes back to "ready", and nothing starts until
     somebody presses Play. */
  const transfer = useCallback((id, src) => {
    if (!src || !src.trim()) return;
    ask({ cmd: "load", id, code: src });
    setTab("room");
  }, [ask]);

  return (
    <div className="gym">
      <header>
        <span className="title">Bit:Bot <span>Gym</span></span>
        <nav>
          {["room", "blocks", "code"].map(t => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
        <span className="spacer" />
        <span className="clock">{(snap.t / 1000).toFixed(1)} s</span>
        <label className="inline">
          speed
          <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>
            {[1, 2, 4, 8].map(v => <option key={v} value={v}>{v}x</option>)}
          </select>
        </label>
        <button onClick={() => setRunning(!running)}>{running ? "pause the clock" : "start the clock"}</button>
        <button onClick={() => { boards.forEach(b => post({ cmd: "reset", id: b.id })); clearLines(); }}>
          Reset all
        </button>
      </header>

      <main className={"tab-" + tab}>
        {tab === "room" && (
          <>
            <div className="left">
              <RoomView snap={snap} post={post} ask={ask} />
              <div className="log">
                {lines.length === 0 &&
                  <div className="empty">the robots will say what they are doing here</div>}
                {lines.slice(-60).map(l => (
                  <div key={l.k} className={l.cls}>
                    {l.device ? "[" + (l.device.name || l.device.id) + "] " : ""}{l.msg}
                  </div>
                ))}
              </div>
            </div>
            <div className={"cards" + (crowd ? " crowded" : "")}>
              {boards.length === 0 && <p className="hint">no robots yet - add one under the room</p>}
              {boards.map(b => (
                <Card key={b.id} body={b} post={post}
                      compact={crowd && !open.has(b.id)}
                      onToggle={crowd ? () => toggle(b.id) : undefined} />
              ))}
            </div>
          </>
        )}

        {tab === "blocks" && (
          <BlocksTab boards={boards} chosen={chosen} onChoose={setChosen}
                     onTransfer={transfer} projects={projects} setProject={setProject} />
        )}

        {tab === "code" && (
          <CodeTab boards={boards} chosen={chosen} onChoose={setChosen}
                   onTransfer={transfer} code={code} setCode={setCode} />
        )}
      </main>
    </div>
  );
}
