/* The room: one canvas, and the things a hand can do to it.

   The canvas is drawn by room/renderer.js, which is deliberately not a
   React component - it paints 620x620 pixels sixty times a second and
   React has nothing useful to add to that. React owns the element; the
   renderer owns what is inside it; the snapshot is all that passes between
   them.

   Every control here posts. None of them writes anything.

   THE TOOL IS A MODE, and the pointer means whatever the mode says. That
   is how the old gym worked and it is right for nine-year-olds: one thing
   selected at a time, with the pointer doing the obvious thing. The
   alternative - modifier keys, right-click menus for everything - is a
   worse fit for a child and hopeless on a Chromebook trackpad.

   Which tool is live is chosen in the menu bar and lives in App, not
   here: this file is the canvas and the hand on it, and nothing else.

   TWO POINTS TO A THING, AND A MENU FOR THE REST.

   Drag the thing to move it; drag the blue dot beside it to turn it. That
   is all the canvas asks a child to learn, and it is the pair of gestures
   the old gym had. Copying and deleting used to be two more coloured dots
   on every object, which in a furnished room was a sky full of dots - so
   they moved to the right-click menu, where a second thought belongs. The
   dots only appear in drag mode: in any other mode the pointer already
   means something, and a handle under it would be a trap.

   A DRAG HOLDS AN ID, NEVER A POSITION. The moment the mouse runs ahead of
   the chair it is dragging, "whatever is under the pointer" is the table
   behind it. So the press works out what it has hold of, and every move
   after that talks about that one id until the hand lets go. */

import React, { useEffect, useRef, useState } from "react";
import { createRoomRenderer, turnPointOf } from "../room/renderer.js";
import { Item, Row, Sep } from "./Menu.jsx";

const TURN_GRAB = 46;        // how near the turn dot counts as on it
const MAGNET_GRAB = 58;      // about the bar itself
const LAMP_GRAB = 95;        // the generous reach, on open floor
const LAMP_DOT = 40;         // about the drawn glyph: what wins over a box

export default function RoomView({ snap, post, ask, tool, thing, show, trail }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const dragRef = useRef(null);
  const penRef = useRef(null);          // the line being dragged out right now
  const [menu, setMenu] = useState(null);

  useEffect(() => {
    if (!rendererRef.current && canvasRef.current) {
      /* The renderer is handed the room's own raycast rather than one of
         its own: the sonar view has to be the same question the sonar
         asked, or it is a drawing that cannot ever disagree with itself
         and therefore cannot ever show you a bug. */
      rendererRef.current = createRoomRenderer(canvasRef.current, {
        ray: (from, angle, opts) => ask({ cmd: "ray", from, angle, opts })
      });
    }
  }, [ask]);

  useEffect(() => {
    if (rendererRef.current && snap) {
      try {
        rendererRef.current.draw(snap, {
          trail, show, pen: penRef.current, handles: tool === "move"
        });
      } catch (e) { console.error(e); }
    }
  }, [snap, trail, show, tool]);

  /* The menu is a thing in front of the room; a click anywhere else is a
     click that means to put it away. */
  useEffect(() => {
    if (!menu) return;
    const away = () => setMenu(null);
    const esc = e => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const toRoom = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const S = snap.size / r.width;
    return { x: (e.clientX - r.left) * S, y: (e.clientY - r.top) * S };
  };

  /* What is under this point, in the order a hand means them: the dots
     first because they stick out past everything, then robots, then
     LAMPS, then furniture, then the floor.

     Lamps are asked TWICE, and the two radii are the whole trick. A lamp
     is a small bright mark and furniture is a big box, so with lamps last
     a lamp standing in front of a cupboard - or, where the Room menu
     drops them both, over one - could not be clicked at all: not dragged
     out, not switched off, not taken away. With lamps first and the
     generous radius, the opposite happened, because 95 mm of reach
     swallows most of a speaker: the box underneath became unclickable
     instead. So the near pass is the drawn glyph and nothing more, which
     is the only part of a lamp a hand is really pointing at, and the
     generous pass comes after the furniture, where it only ever picks up
     a lamp standing on open floor. */
  const pick = (p) => {
    const near = (q) => Math.hypot(p.x - q.x, p.y - q.y) < TURN_GRAB;
    for (const b of snap.bodies) if (near(turnPointOf({ body: b }))) return { what: "turn-body", body: b };
    for (const f of snap.furniture) if (near(turnPointOf({ thing: f }))) return { what: "turn-thing", thing: f };
    for (const b of snap.bodies) {
      if (Math.hypot(b.x - p.x, b.y - p.y) <= b.r + 20) return { what: "body", body: b };
    }
    const lampWithin = (r) => {
      for (let i = 0; i < snap.lamps.length; i++) {
        const L = snap.lamps[i];
        if (Math.hypot(L.x - p.x, L.y - p.y) < r) return { what: "lamp", lamp: L, index: i };
      }
      return null;
    };
    const onTheDot = lampWithin(LAMP_DOT);
    if (onTheDot) return onTheDot;
    /* A magnet is small, specific and lies ON the floor, so it is asked
       for before the furniture it may be sitting under. */
    for (let i = 0; i < (snap.magnets || []).length; i++) {
      const M = snap.magnets[i];
      if (Math.hypot(M.x - p.x, M.y - p.y) < MAGNET_GRAB)
        return { what: "magnet", magnet: M, index: i };
    }
    const f = ask({ cmd: "whatAt", x: p.x, y: p.y });
    if (f) return { what: "thing", thing: f };
    return lampWithin(LAMP_GRAB) || { what: "floor" };
  };

  const down = (e) => {
    if (e.button !== 0) return;                      // right-click is the menu
    setMenu(null);
    const p = toRoom(e);
    /* Guarded, as the old gym guarded it. Capture is a nicety - it keeps a
       drag alive when the pointer leaves the canvas - and it throws for a
       pointer the browser does not think is down. Letting that throw takes
       the whole press with it, so the child presses a robot and nothing at
       all happens. */
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch (err) { /* no capture, still a drag */ }

    /* The click is where the MIDDLE of the thing should land, which is what
       a child means by pointing at the floor; the catalogue measures from a
       corner, so `centred` takes half its size off. */
    if (tool === "place") { post({ cmd: "thing", name: thing, x: p.x, y: p.y, centred: true }); return; }
    if (tool === "take")  { post({ cmd: "unthing", x: p.x, y: p.y }); return; }
    if (tool === "erase") { post({ cmd: "erase", x: p.x, y: p.y }); return; }
    if (tool === "pen")   { penRef.current = { from: p, to: p }; return; }

    const hit = pick(p);
    if (hit.what === "turn-body") { dragRef.current = { kind: "turn-body", id: hit.body.id }; return; }
    if (hit.what === "turn-thing") { dragRef.current = { kind: "turn-thing", uid: hit.thing.uid }; return; }
    if (hit.what === "body") {
      dragRef.current = { kind: "body", id: hit.body.id };
      post({ cmd: "hold", id: hit.body.id });
      return;
    }
    if (hit.what === "thing") {
      const f = hit.thing;
      dragRef.current = { kind: "thing", uid: f.uid,
                          dx: p.x - (f.x + f.w / 2), dy: p.y - (f.y + f.h / 2) };
      return;
    }
    if (hit.what === "lamp") { dragRef.current = { kind: "lamp", index: hit.index }; return; }
    if (hit.what === "magnet") { dragRef.current = { kind: "magnet", index: hit.index }; return; }
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

    const d = dragRef.current;
    if (!d) return;
    const p = toRoom(e);
    /* Sixty mouse moves a second collapse to wherever the hand ended up,
       so the queue never grows and the thing never lags behind the finger. */
    const once = (key) => ({ coalesce: key });

    if (d.kind === "body") {
      post({ cmd: "place", id: d.id, x: p.x, y: p.y }, once("place:" + d.id));
    } else if (d.kind === "turn-body") {
      const b = snap.bodies.find(x => x.id === d.id);
      if (!b) return;
      post({ cmd: "place", id: d.id, x: b.x, y: b.y,
             heading: Math.atan2(p.y - b.y, p.x - b.x) }, once("place:" + d.id));
    } else if (d.kind === "thing") {
      post({ cmd: "moveThing", uid: d.uid, x: p.x - d.dx, y: p.y - d.dy, centred: true },
            once("thing:" + d.uid));
    } else if (d.kind === "turn-thing") {
      const f = snap.furniture.find(x => x.uid === d.uid);
      if (!f) return;
      post({ cmd: "turnThing", uid: d.uid,
             rot: Math.atan2(p.y - (f.y + f.h / 2), p.x - (f.x + f.w / 2)) },
            once("thing:" + d.uid));
    } else if (d.kind === "lamp") {
      post({ cmd: "moveLamp", id: d.index, x: p.x, y: p.y }, once("lamp:" + d.index));
    } else if (d.kind === "magnet") {
      post({ cmd: "moveMagnet", id: d.index, x: p.x, y: p.y }, once("magnet:" + d.index));
    }
  };

  const up = () => {
    if (tool === "pen" && penRef.current) {
      const { from, to } = penRef.current;
      penRef.current = null;
      /* a tap is not a line, it is a child deciding not to draw one */
      if (Math.hypot(to.x - from.x, to.y - from.y) > 40) post({ cmd: "line", from, to });
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    if (d.kind === "body") post({ cmd: "drop", id: d.id });
  };

  /* The second thought: copy it, take it away, give it a name. Opened
     where the pointer is, so it never has to be hunted for. */
  const context = (e) => {
    e.preventDefault();
    const p = toRoom(e);
    const hit = pick(p);
    const what = hit.what.startsWith("turn-") ? hit.what.slice(5) : hit.what;
    if (what === "floor") { setMenu(null); return; }
    /* `lamp` has to travel with the rest of it. Leaving it out did not
       show up as a missing menu - RoomMenu read `menu.lamp.kind`, threw
       during render, and React took the whole gym down with it: a blank
       white window, mid-lesson, from one right-click on a lamp. */
    setMenu({ at: { top: e.clientY, left: e.clientX }, what: what,
              body: hit.body, thing: hit.thing, lamp: hit.lamp, magnet: hit.magnet,
              index: hit.index,
              /* which speaker this is, if it is one: the world switches
                 them on by their place in its list, not by uid */
              speaker: hit.thing
                ? snap.speakers.findIndex(S => S.uid === hit.thing.uid) : -1 });
  };

  const cursor = tool === "move" ? "grab" : tool === "erase" ? "cell" : "crosshair";

  return (
    <div className="roomview">
      <div className="stage">
        <canvas ref={canvasRef} width={620} height={620} id="room"
                style={{ cursor }}
                onPointerDown={down} onPointerMove={move}
                onPointerUp={up} onPointerCancel={up}
                onContextMenu={context} />
        {menu && (
          <div className="drop ctx" style={menu.at} role="menu"
               onPointerDown={e => e.stopPropagation()}
               onClick={() => setMenu(null)}>
            <RoomMenu menu={menu} post={post} close={() => setMenu(null)} />
          </div>
        )}
      </div>
    </div>
  );
}

function RoomMenu({ menu, post, close }) {
  const focused = useRef(null);
  if (menu.what === "body") {
    const b = menu.body;
    const p = b.program || {};
    return (
      <>
        <Sep label={p.plugged ? "Bit:Bot" : "micro:bit"} />
        {/* A box, not a prompt(): prompt is not supported in the app's own
            browser and throws, so the menu item did nothing at all. */}
        <Row label="name">
          {/* Focused ONCE. A ref callback runs on every render, and this
              menu re-renders with the snapshot: re-selecting the text each
              time meant the second keystroke wiped the first. */}
          <input defaultValue={p.name || ""} maxLength={18}
                 ref={el => {
                   if (!el || el === focused.current) return;
                   focused.current = el; el.focus(); el.select();
                 }}
                 onKeyDown={e => {
                   if (e.key !== "Enter") return;
                   post({ cmd: "rename", id: b.id, name: e.target.value });
                   /* and get out of the way. Enter is "done"; leaving the
                      menu sitting over the robot afterwards made it look
                      as though nothing had been accepted. */
                   if (close) close();
                 }}
                 onBlur={e => post({ cmd: "rename", id: b.id, name: e.target.value })} />
        </Row>
        <Item onClick={() => post({ cmd: "copy", id: b.id })}
              hint="an empty one beside it">Another like this</Item>
        <Item onClick={() => post({ cmd: "home", id: b.id })}>Put it back at the start</Item>
        <Sep />
        <Item onClick={() => post({ cmd: "remove", id: b.id })}>Take it out of the room</Item>
      </>
    );
  }
  if (menu.what === "thing") {
    const f = menu.thing;
    return (
      <>
        <Sep label={f.name} />
        {/* A LAMP COULD BE SWITCHED OFF WHERE IT STOOD AND A SPEAKER COULD
            NOT. You had to know it was also listed up in the Room menu,
            under a number, and a child looking at a black box on the floor
            does not know that. Same thing, same gesture. */}
        {menu.speaker >= 0 && (
          <Item onClick={() => post({ cmd: "speaker", id: menu.speaker })}>
            {f.playing ? "Stop the music" : "Play some music"}
          </Item>
        )}
        <Item onClick={() => post({ cmd: "copyThing", uid: f.uid })}>Another one of these</Item>
        <Item onClick={() => post({ cmd: "turnThing", uid: f.uid, rot: (f.rot || 0) + Math.PI / 2 })}
              hint="a quarter turn">Turn it round</Item>
        <Sep />
        <Item onClick={() => post({ cmd: "dropThing", uid: f.uid })}>Take it out of the room</Item>
      </>
    );
  }
  /* BEFORE the lamp fallthrough, and explicitly. Everything that is not a
     body or a thing used to be assumed to be a lamp, and the day something
     else arrived it read `menu.lamp.kind` off undefined and took the whole
     gym down with it. */
  if (menu.what === "magnet") {
    const M = menu.magnet || {};
    return (
      <>
        <Sep label="magnet" />
        {/* HALF a turn, not a quarter. The furniture item above turns by a
            quarter because a table has four sides that all look different;
            a magnet has two ends, and "turn it round" means the red end
            now points where the pale end did. A quarter turn left the
            magnet lying across the room with its field barely changed,
            which looks like the menu item did nothing. */}
        <Item onClick={() => post({ cmd: "turnMagnet", id: menu.index,
                                    rot: (M.rot || 0) + Math.PI })}
              hint="swaps which end faces where">Turn it round</Item>
        <Sep />
        <Item onClick={() => post({ cmd: "dropMagnet", id: menu.index })}>
          Take it out of the room
        </Item>
      </>
    );
  }
  if (menu.what !== "lamp" || !menu.lamp) return null;
  return (
    <>
      <Sep label={menu.lamp.kind === "ceiling" ? "ceiling light" : "lamp"} />
      <Item onClick={() => post({ cmd: "lamp", id: menu.index })}>
        {menu.lamp.on ? "Switch it off" : "Switch it on"}
      </Item>
      <Sep />
      <Item onClick={() => post({ cmd: "dropLamp", id: menu.index })}>Take it out of the room</Item>
    </>
  );
}
