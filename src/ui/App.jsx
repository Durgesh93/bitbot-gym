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

     Which sensor views are showing and whether trails are on: view state,
     none of it known to the gym. RoomView is then only a canvas and the
     hand on it, which is the right size for that file.

     THERE IS NO POINTER TOOL ANY MORE, AND NO ROOM, ROBOTS OR BUILD MENU
     EITHER. The pointer always drags, and everything that used to be a
     mode or a menu item up here - add a robot, add a chair, remove, pen,
     rubber, switch that lamp off - is a left click on the thing or the
     spot it acts on, down in RoomView. The mode was invisible from the
     canvas, which is the whole reason it kept dropping chairs on robots;
     the menus were four clicks away from the place you were pointing at.

     What stays up here is what has no object to click: the sensor views,
     the clock, the robot tuning, and saving or opening the room. */
  const [tune, setTune] = useState(() => ask({ cmd: "tuning" }));
  const set = (k, v) => setTune(ask({ cmd: "tune", [k]: v }));
  const [show, setShow] = useState({ light: false, sonar: false });
  const [trail, setTrail] = useState(true);
  const [catalogue, setCatalogue] = useState([]);
  useEffect(() => { setCatalogue(ask({ cmd: "catalogue" }) || []); }, [ask]);
  const anyView = show.light || show.sonar;
  const flip = k => setShow(v => ({ ...v, [k]: !v[k] }));
  /* There is no "put it in the middle of the room" helper any more: nothing
     is added from up here. Everything lands on the spot that was clicked,
     which is both fewer steps and the thing the hand already meant. */
  const [chosen, setChosen] = useState(1);
  const [projects, setProjects] = useState({});
  /* Which cards the teacher has opened up. This is view state and
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
  /* EVERY CARD STARTS FOLDED, however few robots there are.
     It used to be only past four, on the grounds that a wall of full cards
     stops being readable - but the thing under the cards is the ROOM, and
     a Chromebook is 768 pixels tall. One full card pushed the room off the
     top of the screen. A folded card still shows the screen, the eyes, the
     sonar, the last thing the robot said, and Play, Stop and Code; what it
     costs is the detail, and the detail is one click away. */
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

    /* OPENING A PROJECT IS ONE ACT, SO IT IS ALL SENT AND NONE OF IT
       POSTED. Posting is for a hand: a click lands on the next drain,
       between ticks, which is where a hand belongs. This is not a hand,
       it is a whole room arriving at once, and mixing the two broke it -
       the room commands were POSTED and so drained later, while each
       board was ADDED with a send and so arrived at once. The board went
       down on its exact spot and then the queued `scene` reopened the
       room underneath it and stood it on a default start spot instead.
       Every project opened with its robots in the wrong place, and the
       line course opened with the robot sitting beside its line.

       It did not show up in the test because the test sends everything,
       the way node has to. Now the gym does the same, so the test covers
       the path the gym actually takes.

       OUT WITH WHAT IS THERE FIRST: a project says exactly what is in
       the room, so anything left over is the last lesson's. The copy of
       the list matters - removing walks the same array the room keeps. */
    for (const b of [...(snap.bodies || [])]) ask({ cmd: "remove", id: b.id });
    for (const c of plan.room) ask(c);

    const fresh = {};
    let first = null;
    for (const b of plan.boards) {
      const id = ask(b.add);
      if (id == null) continue;
      if (first == null) first = id;
      if (b.group) ask({ cmd: "group", id, group: b.group });
      if (b.code) ask({ cmd: "load", id, code: b.code });
      /* and the blocks behind the code, so pressing Code shows the
         lesson rather than an empty workspace */
      if (b.editor) fresh[id] = b.editor;
    }
    setProjects(fresh);
    if (first != null) setChosen(first);
    say('opened "' + p.name + '"' + (plan.boards.length
          ? " - " + plan.boards.length + (plan.boards.length === 1 ? " board" : " boards") + ", press Play"
          : ""), "say");
  }, [ask, snap]);

  /* SAVING MUST NOT GO THROUGH window.prompt.

     It did, and the button looked broken: a browser is free to suppress
     a page's dialogs - Chrome does it once anybody ticks "prevent this
     page from creating additional dialogs", and some managed Chromebooks
     do it from the start - and a suppressed prompt does not throw, it
     just returns null. The old code read that as "cancelled" and went
     quietly home: no file, no message, nothing. A child pressing Save and
     getting silence has no way to tell that from a broken program.

     So the name is asked for on the page, in our own box, which cannot be
     switched off. */
  const [naming, setNaming] = useState(null);
  const [forgetting, setForgetting] = useState(false);

  const writeFile = useCallback((name) => {
    const p = captureNow(name);
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = p.name.replace(/[^\w .-]+/g, " ").trim() + ".gym.json";
    /* in the document before it is clicked: a loose anchor is enough for
       Chrome but not for every browser, and this costs one line */
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
    /* and onto the shelf as well, so next week it is one press rather
       than a trip through a file picker. The file is the one that
       survives a reimaged laptop; this is the one that is quick. */
    if (shelf.put(p)) setRooms(shelf.list());
    say('saved "' + p.name + '" - look in your Downloads', "say");
  }, [captureNow]);

  const saveToFile = useCallback(() => setNaming("my project"), []);

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
            {/* ONE MENU IN THE BAR, and nothing in it acts on a single
                object.

                Room, Robots and Build are gone. Everything they held acts
                on a THING or on a SPOT, and both of those are now a left
                click on the thing or the spot: a lamp is switched off by
                clicking the lamp, a chair is put down by clicking the floor
                where you want it. A menu bar entry for "add a chair
                somewhere" was always a worse version of pointing at the
                place you meant.

                What is left is the handful of settings that belong to the
                whole gym - what the sensors draw, how fast time runs, and
                what the real Bit:Bots are like - which have no object to
                click on. They are one menu because a header is the one
                piece of furniture a 1366-pixel Chromebook cannot spare. */}
            <Menu label="Setup" chip={anyView
              ? [show.light && "light", show.sonar && "sonar"]
                  .filter(Boolean).join(" ")
              : (speed > 1 ? speed + "x" : (running ? null : "paused"))}>
              <Sep label="what the sensors see" />
              <Item on={!anyView}
                    onClick={() => setShow({ light: false, sonar: false })}>
                Plain
              </Item>
              <Item on={show.light} onClick={() => flip("light")}
                    hint="a blob at each eye">Light sensors</Item>
              <Item on={show.sonar} onClick={() => flip("sonar")}
                    hint="the real pings">Sonar</Item>
              <Item on={trail} onClick={() => setTrail(!trail)}
                    hint="where it has just been">Trail</Item>

              {/* THE CLOCK, which used to be a menu of its own for two
                  controls. Nobody needs a whole menu to make time run
                  double speed, and the two lines cost nothing here. */}
              <Sep label="how fast time runs" />
              <Row label="speed">
                <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>
                  {[1, 2, 4, 8].map(v => <option key={v} value={v}>{v}x</option>)}
                </select>
              </Row>
              <Item on={!running} onClick={() => setRunning(!running)}>
                {running ? "Pause the clock" : "Start the clock"}
              </Item>

              {/* THE HARDWARE. One set for every robot on purpose: these
                  describe the Bit:Bots and the floor the class actually
                  has - measure one of them once and the gym stops lying to
                  you - and ten robots that each drove differently would
                  make every lesson unrepeatable. */}
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
              <Item on={tune.lightUp} onClick={() => set("lightUp", !tune.lightUp)}
                    hint={tune.lightUp ? "as ours are wired" : "some boards read backwards"}>
                Light sensors: brighter reads higher
              </Item>
            </Menu>
        </MenuBar>

        <span className="spacer" />

        {/* SAVE AND OPEN, IN THE OPEN. They were a "Projects" menu, which
            is a menu you open to find the one button you wanted. Saving a
            room is the thing a teacher does at the end of every lesson and
            opening one is the thing they do at the start of the next, so
            both are one press now.

            Open still has a list under it, because the browser's own copy
            of last week's room is the fast way back to it - but the button
            says Open and does the obvious thing if you ignore the list. */}
        <button className="hdrbtn" onClick={saveToFile}
                title="keeps a .gym.json file you can send on">Save</button>
        <Menu label="Open" chip={rooms.length ? String(rooms.length) : null}>
          <Item onClick={() => projectFile.current && projectFile.current.click()}
                hint="a .gym.json you saved before">Choose a file...</Item>
          {rooms.length > 0 && (
            <Sep label={forgetting ? "pick one to forget" : "saved in this browser"} />
          )}
          {rooms.map(r => (
            <Item key={r.name}
                  onClick={() => {
                    if (forgetting) {
                      if (shelf.remove(r.name)) setRooms(shelf.list());
                      setForgetting(false);
                      say('forgot "' + r.name + '" - your file is untouched', "say");
                      return;
                    }
                    const p = shelf.get(r.name);
                    if (p) openProject(p);
                  }}
                  hint={forgetting ? "forget this one"
                                   : (r.saved ? new Date(r.saved).toLocaleDateString() : null)}>
              {r.name}
            </Item>
          ))}
          {/* also a prompt once, also silently broken when the browser
              suppressed it: now it is two clicks on the page instead */}
          {rooms.length > 0 && (
            <Item on={forgetting} keepOpen onClick={() => setForgetting(!forgetting)}
                  hint="only from this browser, never the file">
              {forgetting ? "no, keep them all" : "Forget a saved project"}
            </Item>
          )}
        </Menu>


        <input ref={projectFile} type="file" accept=".json,.gym.json,application/json" hidden
               onChange={e => { const f = e.target.files && e.target.files[0];
                                if (f) openFromFile(f);
                                e.target.value = ""; }} />

        {/* "the room" / "the blocks" is gone from here. It was a label
            saying which page you were looking at, to somebody who was
            looking at it. */}
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

      {/* THE SAVE BOX. Our own, on the page, because the browser's prompt
          can be switched off (see writeFile above). It is a form, so
          Enter saves and the keyboard works the way a keyboard works;
          Escape or Cancel puts it away. */}
      {naming !== null && (
        <div className="shade" onMouseDown={e => { if (e.target === e.currentTarget) setNaming(null); }}>
          <form className="namebox"
                onSubmit={e => {
                  e.preventDefault();
                  const n = naming.trim();
                  if (!n) return;
                  setNaming(null);
                  writeFile(n);
                }}>
            <h2>What shall this room be called?</h2>
            {/* the suggestion arrives selected, the way the browser's own
                prompt did it: a child types the name and it replaces
                "my project" instead of landing in the middle of it */}
            <input autoFocus value={naming} spellCheck="false"
                   aria-label="a name for this room"
                   onFocus={e => e.target.select()}
                   onChange={e => setNaming(e.target.value)}
                   onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); setNaming(null); } }} />
            <p className="small">It goes to your Downloads as a <b>.gym.json</b> file,
              and into this browser's Open list.</p>
            <div className="namerow">
              <button type="button" className="hdrbtn" onClick={() => setNaming(null)}>Cancel</button>
              <button type="submit" className="hdrbtn go" disabled={!naming.trim()}>Save it</button>
            </div>
          </form>
        </div>
      )}

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
                    catalogue={catalogue} show={show} trail={trail} />
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
        <div className="cards crowded">
          {boards.length === 0 &&
            <p className="hint">nothing in the room yet - click the floor and take a robot</p>}
          {boards.map(b => (
            <Card key={b.id} body={b} post={post} log={byBoard.get(b.id)}
                  compact={!open.has(b.id)}
                  onToggle={() => toggle(b.id)}
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
