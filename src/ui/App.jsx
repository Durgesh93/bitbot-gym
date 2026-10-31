/* The gym.

   TWO PAGES, turned by an arrow at the edge of the screen or by one finger
   across it: the blocks on one, the room and the boards on the other. Not
   a row of tabs. A tab bar invites a third tab and then a fourth, and the
   gym is two things - you build, then you watch - so the navigation should
   be able to say only that. It is also the one gesture that works the same
   on a trackpad, a touchscreen and a projector remote.

   The whole of the state React owns is which page is showing, which board
   the editor is pointed at, and the last snapshot - and the snapshot is
   not really state, it is the latest photograph of something that lives
   elsewhere.

   Everything a hand does becomes a posted message. Nothing here writes to
   the world. That is the one rule, and it is the reason a bug in this file
   can make the gym look wrong but never make it BE wrong. */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useRoom } from "./useRoom.js";
import { say } from "../core/log.js";
import RoomView from "./RoomView.jsx";
import Card from "./Card.jsx";
import BlocksTab from "./BlocksTab.jsx";

export default function App() {
  const { snap, lines, post, ask, speed, setSpeed, running, setRunning, clearLines } = useRoom();
  const [page, setPage] = useState("room");
  const [chosen, setChosen] = useState(1);
  const [projects, setProjects] = useState({});
  /* Which crowded cards the teacher has opened up. This is view state and
     nothing else - the gym does not know or care, and losing it on reload
     costs nobody anything. */
  const [open, setOpen] = useState(() => new Set());

  /* LIGHT OR DARK, and the choice is remembered.

     Not read from the operating system: ten children on ten school
     accounts would get two different-looking gyms, and a teacher pointing
     at a screen saying "the green card" needs every screen to agree.
     Light is the default because the MakeCode drawer colours were drawn
     for white; dark is there for a laptop on a dark afternoon. */
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("gym-theme") || "light"; } catch (e) { return "light"; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0a0913" : "#f4f6fb");
    try { localStorage.setItem("gym-theme", theme); } catch (e) { /* a locked-down Chromebook */ }
  }, [theme]);

  /* EVERY ROBOT SAYS ITS OWN PIECE, ON ITS OWN CARD.

     One shared stream is fine with one robot and useless with ten: the
     thing a child wants is "what is MY robot doing", and finding that in a
     column where nine others are talking is not a thing a nine-year-old
     will do. So the lines are split by who said them. The room log stays as
     well, because the teacher's question is the opposite one - "who just
     said something?" - and that one needs the single stream. */
  const byBoard = useMemo(() => {
    const m = new Map();
    for (const l of lines) {
      const id = l.device && l.device.id;
      if (id == null) continue;
      let a = m.get(id);
      if (!a) { a = []; m.set(id, a); }
      a.push(l);
    }
    return m;
  }, [lines]);

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
    /* Never silently. A Transfer that does nothing and says nothing is how
       a child ends up pressing Play at a board with no program on it. */
    if (!src || !src.trim()) { say("there was no code to transfer", "err"); return; }
    ask({ cmd: "load", id, code: src });
    setPage("room");
  }, [ask]);

  /* ONE FINGER ACROSS THE PAGE TURNS IT - unless the finger started on
     something that does its own dragging. Dragging a robot across the room
     is the commonest thing anyone does here, and having that throw you
     into the block editor would be unbearable; so would losing a drag
     inside the MakeCode iframe. The list is the old gym's, which was
     arrived at by being annoyed by each of them in turn. */
  useEffect(() => {
    let from = null;
    const busy = (t) => !!(t && t.closest && (
      t.closest("#room") || t.closest("iframe") || t.closest(".cards") ||
      t.closest(".log") || t.closest(".cardlog") || t.closest("input") ||
      t.closest("select") || t.closest("textarea") || t.closest("button")));
    const down = e => { from = busy(e.target) ? null : { x: e.clientX, y: e.clientY }; };
    const up = e => {
      if (!from) return;
      const dx = e.clientX - from.x, dy = e.clientY - from.y;
      from = null;
      /* far enough, and more sideways than up: a lazy diagonal is somebody
         scrolling, not somebody turning the page */
      if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      setPage(dx < 0 ? "room" : "blocks");
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
    };
  }, []);

  return (
    <div className="gym">
      <header>
        <span className="title">Bit:Bot <span>Gym</span></span>
        <span className="where">{page === "room" ? "the room" : "the blocks"}</span>
        <span className="spacer" />
        <span className="clock">{(snap.t / 1000).toFixed(1)} s</span>
        <label className="inline">
          speed
          <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>
            {[1, 2, 4, 8].map(v => <option key={v} value={v}>{v}x</option>)}
          </select>
        </label>
        <button onClick={() => setRunning(!running)}>{running ? "pause the clock" : "start the clock"}</button>
        <button className="theme" title="light or dark"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "\u2600 light" : "\u263e dark"}
        </button>
        <button onClick={() => { boards.forEach(b => post({ cmd: "reset", id: b.id })); clearLines(); }}>
          Reset all
        </button>
      </header>

      <main className={"tab-" + page}>
        {page === "room" && (
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
                <Card key={b.id} body={b} post={post} log={byBoard.get(b.id)}
                      compact={crowd && !open.has(b.id)}
                      onToggle={crowd ? () => toggle(b.id) : undefined} />
              ))}
            </div>
          </>
        )}

        {page === "blocks" && (
          <BlocksTab boards={boards} chosen={chosen} onChoose={setChosen}
                     onTransfer={transfer} projects={projects} setProject={setProject} />
        )}
      </main>

      {/* The page turners. Fixed to the edges of the window rather than
          placed in the layout, so they are in the same spot whatever is on
          screen and never move about as a page gets taller. */}
      {page === "blocks" && (
        <button className="pager right" title="the room and the boards"
                onClick={() => setPage("room")}>{"\u203a"}</button>
      )}
      {page === "room" && (
        <button className="pager left" title="back to the blocks"
                onClick={() => setPage("blocks")}>{"\u2039"}</button>
      )}
    </div>
  );
}
