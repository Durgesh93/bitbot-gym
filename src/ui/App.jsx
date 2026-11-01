/* The gym.

   TWO PAGES: the blocks on one, the room and the boards on the other.
   Not a row of tabs. A tab bar invites a third tab and then a fourth, and
   the gym is two things - you build, then you watch - so the navigation
   should be able to say only that. You go in by the Code button on the
   board you mean and come out by the labelled button inside the blocks;
   one finger across the page still turns it, for anyone who finds it.

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
import { capture, restore, check } from "../app/project.js";
import * as shelf from "../app/shelf.js";
import RoomView from "./RoomView.jsx";
import Card from "./Card.jsx";
import BlocksTab from "./BlocksTab.jsx";
import { MenuBar, Menu, Item, Row, Sep, Slider } from "./Menu.jsx";

export default function App() {
  const { snap, lines, post, ask, speed, setSpeed, running, setRunning, clearLines } = useRoom();
  /* Which robot's blocks are open over the room, or null for none. There is
     no second PAGE any more: the editor is a sheet over the whole window,
     opened from the robot it belongs to - which is the point, because the
     blocks you want are always some particular robot's. */
  const [coding, setCoding] = useState(null);

  /* THE ROOM'S CONTROLS LIVE UP HERE, because the menu bar does.

     Which pointer tool is live, what it would put down, which sensor
     views are showing and whether trails are on: all view state, none of
     it known to the gym. RoomView is then only a canvas and the hand on
     it, which is the right size for that file. */
  const [tune, setTune] = useState(() => ask({ cmd: "tuning" }));
  const set = (k, v) => setTune(ask({ cmd: "tune", [k]: v }));
  const [tool, setTool] = useState("move");
  const [thing, setThing] = useState("chair");
  const [show, setShow] = useState({ light: false, sonar: false });
  const [trail, setTrail] = useState(true);
  const [catalogue, setCatalogue] = useState([]);
  useEffect(() => { setCatalogue(ask({ cmd: "catalogue" }) || []); }, [ask]);
  const anyView = show.light || show.sonar;
  const flip = k => setShow(v => ({ ...v, [k]: !v[k] }));
  const TOOL_NAME = { move: "drag", place: "add " + thing, take: "remove",
                      pen: "draw line", erase: "erase line" };
  /* Put something new in the middle of the room. The world walks it out to
     a clear patch from there, so two of them never land on each other. */
  const put = (m) => post({ ...m, x: snap.size / 2, y: snap.size / 2 });
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
     will do. So the lines are split by who said them, and there is no
     shared stream any more: it said the same things twice and the room is
     worth more as height for the canvas. */
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

  /* AND THE LINES THAT ARE NOT ANY ROBOT'S. Splitting the log by board
     left these with nowhere to go: "opened Dice Duel", "saved Dice Duel",
     "that file is not a saved room" are all said by the GYM, not by a
     robot, so every one of them was collected and then quietly dropped.
     A teacher who opened the wrong file saw nothing happen at all, which
     reads as a broken button rather than a refused file.

     So they get a strip of their own under the header, newest only -
     there is never more than one thing worth saying here, and a growing
     column would be the shared stream coming back in. It fades after a
     few seconds because it is a receipt, not a record; an error stays
     until it is clicked away, because the one thing worse than no
     message is a message that leaves before it is read. */
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    const mine = lines.filter(l => !(l.device && l.device.id != null));
    if (!mine.length) return;
    const last = mine[mine.length - 1];
    setNotice(last);
    if (last.cls === "err") return;                 // errors wait to be dismissed
    const t = setTimeout(() => setNotice(n => (n === last ? null : n)), 6000);
    return () => clearTimeout(t);
  }, [lines]);

  const boards = snap.bodies || [];
  /* The editor points at a board, and a board can be taken out of the room
     while it is pointed at. Follow the room rather than remember a number
     that has stopped meaning anything. */
  const chosenId = boards.some(b => b.id === chosen) ? chosen : (boards[0] ? boards[0].id : null);
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
  }, [ask]);

  /* ---- saving the room, and opening it again ----------------------

     A project is the room as a teacher arranged it: the furniture, the
     lamps, the magnets, the line on the floor, and every board with its
     name, its spot, its radio group and its code. Setting that up is most
     of the cost of a lesson and almost none of it is the code - Dice Duel
     wants two boards on the same group with a different program on each,
     and doing that by hand in front of a class is five minutes and a
     mistake. Saved once, opened in a second next week. */
  const projectFile = React.useRef(null);
  const [rooms, setRooms] = useState(() => { try { return shelf.list(); } catch (e) { return []; } });

  /* Everything the room will not tell a snapshot. The code on a board is
     asked for by hand rather than read off the snapshot, because a
     snapshot is taken sixty times a second to draw the room. */
  const captureNow = useCallback((name) => {
    const snap = ask({ cmd: "snapshot" });
    const saved = {};
    for (const b of snap.bodies || []) {
      const got = ask({ cmd: "saved", id: b.id });
      if (got) saved[b.id] = got;
    }
    snap.tuning = ask({ cmd: "tuning" });
    return capture(snap, saved, projects, name);
  }, [ask, projects]);

  const openProject = useCallback((p) => {
    const bad = check(p);
    if (bad) { say(bad, "err"); return; }
    let plan;
    try { plan = restore(p); }
    catch (e) { say(e.message, "err"); return; }

    /* OUT WITH WHAT IS THERE FIRST. A project says exactly what is in the
       room, so anything left over is the last lesson's. The copy of the
       list matters: removing walks the same array the room keeps. */
    for (const b of [...(snap.bodies || [])]) post({ cmd: "remove", id: b.id });
    for (const c of plan.room) post(c);

    const fresh = {};
    let first = null;
    for (const b of plan.boards) {
      const id = ask(b.add);
      if (id == null) continue;
      if (first == null) first = id;
      if (b.group) post({ cmd: "group", id, group: b.group });
      if (b.code) post({ cmd: "load", id, code: b.code });
      /* and the blocks behind the code, so pressing Code shows the
         lesson rather than an empty workspace */
      if (b.editor) fresh[id] = b.editor;
    }
    setProjects(fresh);
    if (first != null) setChosen(first);
    say('opened "' + p.name + '"' + (plan.boards.length
          ? " - " + plan.boards.length + (plan.boards.length === 1 ? " board" : " boards") + ", press Play"
          : ""), "say");
  }, [ask, post, snap]);

  const saveToFile = useCallback(() => {
    const name = window.prompt("What shall this project be called?", "my project");
    if (name == null) return;
    const p = captureNow(name);
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = p.name.replace(/[^\w .-]+/g, " ").trim() + ".gym.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    /* and onto the shelf as well, so next week it is one press rather
       than a trip through a file picker. The file is the one that
       survives a reimaged laptop; this is the one that is quick. */
    if (shelf.put(p)) setRooms(shelf.list());
    say('saved "' + p.name + '"', "say");
  }, [captureNow]);

  const openFromFile = useCallback(async (file) => {
    if (!file) return;
    let p;
    try { p = JSON.parse(await file.text()); }
    catch (e) { say("that file is not a saved project", "err"); return; }
    openProject(p);
    if (check(p) === null && shelf.put(p)) setRooms(shelf.list());
  }, [openProject]);

  /* The swipe needs to know which board to open on, and it is set up once,
     so it reads the latest list through a ref rather than closing over a
     stale one. */
  const whichRef = React.useRef(null);
  whichRef.current = chosenId;

  /* ONE FINGER ACROSS THE PAGE TURNS IT - unless the finger started on
     something that does its own dragging. Dragging a robot across the room
     is the commonest thing anyone does here, and having that throw you
     into the block editor would be unbearable; so would losing a drag
     inside the MakeCode iframe. The list is the old gym's, which was
     arrived at by being annoyed by each of them in turn. Right opens the
     blocks for whichever board is chosen, left shuts them. */
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
      setCoding(dx < 0 ? null : whichRef.current);
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

        <MenuBar>
            <Menu label="Room">
              <Sep label="lights and sound" />
              {(snap.lamps || []).map((L, i) => (
                <Item key={"l" + i} on={L.on} onClick={() => post({ cmd: "lamp", id: i })}>
                  {L.kind === "ceiling" ? "Ceiling light " : "Lamp "}{i + 1}
                </Item>
              ))}
              {(snap.speakers || []).map((S, i) => (
                <Item key={"s" + i} on={S.playing} onClick={() => post({ cmd: "speaker", id: i })}>
                  Speaker {i + 1}
                </Item>
              ))}
              {snap.sun && <Row><span className="hint">the sun lights this one</span></Row>}
              {/* A lamp could be moved and taken away but never put in, so a
                  room was stuck with whatever its scene hung. It lands in the
                  middle and you drag it where you want it. */}
              {/* AND THE POINTER GOES BACK TO DRAGGING.

                  The hint here says "drag it", and it was a lie whenever
                  the Build menu had been used first: the pointer was still
                  in "add chair", so the next click - the obvious one,
                  straight at the new lamp, to move it somewhere useful -
                  put a chair on top of it and the room went dark. Anything
                  that lands in the middle and asks to be dragged has to
                  leave the hand able to drag it. */}
              <Sep />
              <Item onClick={() => { setTool("move"); put({ cmd: "addLamp" }); }}
                    hint="stands in the room - drag it">Add a lamp</Item>
              <Item onClick={() => { setTool("move"); put({ cmd: "addLamp", kind: "ceiling" }); }}
                    hint="shines straight down">Add a ceiling light</Item>
              <Item onClick={() => { setTool("move"); put({ cmd: "addSpeaker" }); }}
                    hint="the microphone can hear it">Add a speaker</Item>
              <Item onClick={() => { setTool("move"); put({ cmd: "addMagnet" }); }}
                    hint="upsets the compass near it">Add a magnet</Item>
            </Menu>

            {/* THE ROBOTS: what to put in, and what the hardware is like.

                The settings are one set for every robot on purpose. They
                describe the Bit:Bots and the floor the class actually has
                - measure one of them once and the gym stops lying to you -
                and ten robots that each drove differently would make every
                lesson unrepeatable. */}
            <Menu label="Robots" chip={boards.length || null}>
              <Sep label="two kinds, two lessons" />
              <Item onClick={() => post({ cmd: "add" })}
                    hint="wheels, eyes, sonar">Add a Bit:Bot</Item>
              <Item onClick={() => post({ cmd: "add", kind: "microbit" })}
                    hint="just the board">Add a micro:bit</Item>
              <Item onClick={() => post({ cmd: "home" })} hint="back to the start">
                Put them all back
              </Item>
              <Sep label="what your real robot is like" />
              <Slider label="top speed" hint="mm a second at 100%"
                      min={150} max={900} step={10} value={tune.top}
                      onChange={v => set("top", v)} />
              <Slider label="deadband" hint="under this it only buzzes"
                      min={0} max={40} step={1} value={tune.dead}
                      onChange={v => set("dead", v)} />
              <Slider label="motor mismatch" hint="why it curves when told to go straight"
                      min={-10} max={10} step={1} value={tune.mismatch} unit="%"
                      onChange={v => set("mismatch", v)} />
              <Slider label="grip" hint="how hard the tyres hold"
                      min={0.05} max={1.2} step={0.05} value={tune.grip} dp={2}
                      onChange={v => set("grip", v)} />
              <Slider label="battery" hint="a tired battery is slower"
                      min={10} max={100} step={1} value={tune.battery} unit="%"
                      onChange={v => set("battery", v)} />
              <Sep />
              <Item on={tune.lightUp} onClick={() => set("lightUp", !tune.lightUp)}
                    hint={tune.lightUp ? "as ours are wired" : "some boards read backwards"}>
                Light sensors: brighter reads higher
              </Item>
            </Menu>

            <Menu label="Build" chip={TOOL_NAME[tool]}>
              <Sep label="what the pointer does" />
              <Item on={tool === "move"} onClick={() => setTool("move")}
                    hint="pick a robot up">Drag things</Item>
              <Item on={tool === "place"} onClick={() => setTool("place")}
                    hint="click the floor">Add object</Item>
              <Item on={tool === "take"} onClick={() => setTool("take")}
                    hint="click a thing">Remove object</Item>
              <Item on={tool === "pen"} onClick={() => setTool("pen")}
                    hint="drag to lay tape">Draw line</Item>
              <Item on={tool === "erase"} onClick={() => setTool("erase")}
                    hint="drag over tape">Erase line</Item>
              <Row label="put down">
                <select value={thing}
                        onChange={e => { setThing(e.target.value); setTool("place"); }}>
                  {catalogue.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </Row>
              <Sep label="the whole room at once" />
              <Item onClick={() => post({ cmd: "furnish" })}>Furnish room</Item>
              <Item onClick={() => post({ cmd: "empty" })} hint="lights stay on">Empty room</Item>
              <Item onClick={() => post({ cmd: "clearFloor" })}>Clear floor</Item>
            </Menu>

            <Menu label="View" chip={anyView
              ? [show.light && "light", show.sonar && "sonar"]
                  .filter(Boolean).join(" ")
              : null}>
              <Sep label="what the sensors see" />
              <Item on={!anyView}
                    onClick={() => setShow({ light: false, sonar: false })}>
                Plain
              </Item>
              <Item on={show.light} onClick={() => flip("light")}
                    hint="a blob at each eye">Light sensors</Item>
              <Item on={show.sonar} onClick={() => flip("sonar")}
                    hint="the real pings">Sonar</Item>
              <Sep />
              <Item on={trail} onClick={() => setTrail(!trail)}
                    hint="where it has just been">Trail</Item>
            </Menu>

            {/* ROOMS, not "projects": what is saved is the room as it was
                set up, and a teacher looking for last week's two-board
                radio lesson is looking for a room. The file comes first
                because it is the one that survives a new laptop; the
                list under it is this browser's own copy, for speed. */}
            {/* PROJECTS, not "Rooms". It sat next to "Room" and the two
                were read as the same menu twice - and they are not even
                the same kind of thing: Room is the furniture you are
                standing in, this is the whole lesson saved to a file.
                The word "room" is out of the wording here for the same
                reason. */}
            <Menu label="Projects" chip={rooms.length ? String(rooms.length) : null}>
              <Item onClick={saveToFile} hint="a .gym.json you can keep or send on">
                Save this as a project
              </Item>
              <Item onClick={() => projectFile.current && projectFile.current.click()}
                    hint="sets the whole lesson up again">Open a project file</Item>
              {rooms.length > 0 && <Sep label="saved in this browser" />}
              {rooms.map(r => (
                <Item key={r.name} onClick={() => { const p = shelf.get(r.name); if (p) openProject(p); }}
                      hint={r.saved ? new Date(r.saved).toLocaleDateString() : null}>
                  {r.name}
                </Item>
              ))}
              {rooms.length > 0 && (
                <Item onClick={() => {
                        const name = window.prompt("Forget which project? (its file is not touched)");
                        if (name && shelf.remove(name)) setRooms(shelf.list());
                      }}
                      hint="only from this browser, never the file">Forget a saved project</Item>
              )}
            </Menu>

            <Menu label="Clock" chip={speed > 1 ? speed + "x" : (running ? null : "paused")}>
              <Row label="speed">
                <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>
                  {[1, 2, 4, 8].map(v => <option key={v} value={v}>{v}x</option>)}
                </select>
              </Row>
              <Item on={!running} onClick={() => setRunning(!running)}>
                {running ? "Pause the clock" : "Start the clock"}
              </Item>
            </Menu>
        </MenuBar>

        <input ref={projectFile} type="file" accept=".json,.gym.json,application/json" hidden
               onChange={e => { const f = e.target.files && e.target.files[0];
                                if (f) openFromFile(f);
                                e.target.value = ""; }} />

        <span className="spacer" />
        <span className="where">{coding == null ? "the room" : "the blocks"}</span>
        {/* IN THE OPEN, not in a menu. It was an item in View, where
            nobody found it: a thing you change for the room you are
            sitting in, at four o'clock on a dark afternoon, should be one
            press away and should show which way it is set. */}
        <button className="themebtn"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                title={theme === "dark" ? "switch to light" : "switch to dark"}>
          {theme === "dark" ? "\u2600" : "\u263d"}
        </button>
      </header>

      {notice && (
        <div className={"notice" + (notice.cls === "err" ? " bad" : "")}
             onClick={() => setNotice(null)}
             title="click to clear">
          {notice.msg}
        </div>
      )}

      <main className="tab-room">
        <div className="left">
          <RoomView snap={snap} post={post} ask={ask}
                    tool={tool} thing={thing} show={show} trail={trail} />
        </div>
        {/* TEN ROBOTS, ONE TEACHER.
            Every card has its own Stop and Reset, which is right - a child
            owns their robot. But the moment the class gets noisy somebody
            has to be able to stop all ten at once and put them back, and
            doing that ten times over is not a thing to ask of a teacher
            with thirty seconds of attention left. Reset also wipes what
            the robots have said, so the next run starts on a clean page. */}
        <div className="right">
        {boards.length > 0 && (
          <div className="allboards">
            <button onClick={() => boards.forEach(b => post({ cmd: "stop", id: b.id }))}>
              Stop all
            </button>
            <button onClick={() => {
                      boards.forEach(b => post({ cmd: "reset", id: b.id }));
                      clearLines();
                    }}>
              Reset all
            </button>
            <span className="hint">{boards.length} in the room</span>
          </div>
        )}
        <div className={"cards" + (crowd ? " crowded" : "")}>
          {boards.length === 0 &&
            <p className="hint">nothing in the room yet - add one from the Robots menu</p>}
          {boards.map(b => (
            <Card key={b.id} body={b} post={post} log={byBoard.get(b.id)}
                  compact={crowd && !open.has(b.id)}
                  onToggle={crowd ? () => toggle(b.id) : undefined}
                  onCode={id => { setChosen(id); setCoding(id); }} />
          ))}
        </div>
        </div>
      </main>

      {/* THE BLOCKS, OVER EVERYTHING. Always mounted, only hidden: MakeCode
          takes seconds to load, and reloading it each time a card's Code
          button is pressed would make that button feel broken. */}
      <BlocksTab boards={boards} chosen={chosenId} onChoose={setChosen}
                 onTransfer={transfer} projects={projects} setProject={setProject}
                 open={coding != null} onClose={() => setCoding(null)} />

      {/* THE EDGE ARROW IS GONE. It was the way into the blocks before
          every card had its own Code button, and once they did it was a
          second door to the same room - floating over the floor, pointing
          the wrong way, and opening the blocks for whichever board was
          "chosen", which is a thing the arrow never showed you. The way
          in is the Code button on the board you mean; the way out is the
          labelled "> the room" button inside the blocks. The swipe still
          works for anyone who finds it. */}
    </div>
  );
}
