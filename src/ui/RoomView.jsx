/* The room: one canvas, and the things a hand can do to it.

   The canvas is drawn by room/renderer.js, which is deliberately not a
   React component - it paints the room sixty times a second and React has
   nothing useful to add to that. React owns the element; the renderer owns
   what is inside it; the snapshot is all that passes between them.

   Every control here posts. None of them writes anything.

   THERE IS NO LONGER A TOOL, AND THAT IS THE POINT.

   The pointer used to be a mode: drag, or add-a-chair, or remove, or pen,
   or rubber, chosen up in the Build menu. One thing selected at a time is
   a good rule for nine-year-olds, but the mode was invisible from the
   canvas, and the cost was always the same - a child meant to pick a robot
   up, the pointer was still in "add chair" from five minutes ago, and a
   chair landed on the robot. The menu even carried a note apologising for
   it.

   So the pointer now only ever does the obvious thing: DRAG. Everything
   that used to be a mode is a menu on the thing it acts on.

     press and move   - drag it
     press and let go - that is a CLICK: it picks the thing and opens its
                        menu, right where the pointer is
     click the floor  - the floor's own menu, which is now the whole of
                        what the Build and Robots menus used to be: put a
                        robot, a thing, a lamp or a magnet down HERE, lay
                        tape, or act on the room all at once

   A click and a drag are told apart by distance, not by time: under a few
   pixels of travel the hand meant to click. Time would punish a child who
   presses slowly, and every child presses slowly.

   RIGHT-CLICK STILL WORKS and opens the same menus. It costs one line and
   it is what an adult's hand will try.

   WHAT IS PICKED CAN BE DRIVEN FROM THE KEYBOARD, with the four arrow
   keys and nothing else. They move it or they turn it, and the Move/Turn
   switch under the room says which. A trackpad on a school Chromebook is a
   miserable thing to place furniture with, the keyboard is exact in a way
   no trackpad is, and ChromeOS eats shift-arrow before the page sees it -
   so a visible switch is the only way two jobs fit on four keys.

   ONE SET OF HANDLES, ON THE PICKED THING ONLY. The turn dot used to sit
   beside every object at once, which in a furnished room was a sky full of
   dots. Now the thing you have picked wears the ring and the dot, and
   nothing else does.

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

/* How far the pointer may travel and still have meant a click. In room
   units, so it is the same small distance whatever size the canvas has
   been dragged to. */
const CLICK_SLOP = 18;

/* One press of an arrow key. The room is 2000 units across and stands for
   two metres, so a unit is a millimetre and this is two centimetres - fine
   enough to line a robot up on a strip of tape, coarse enough that holding
   the key still crosses the room. */
const NUDGE = 20;
const SPIN = Math.PI / 12;                        // 15 degrees a press

/* How deep the room is, in millimetres, whatever shape the window is. Two
   metres: the short side is held and the long side follows the screen, so
   a robot that crossed the room in four seconds last week still does, and
   a wide window buys floor sideways rather than shrinking the robot. */
const ROOM_SHORT = 2000;

/* What the resize grip may ask for, in pixels.

   The top used to be 1100, which on a big screen stopped the grip dead
   halfway down the glass. There is no reason to: the room is drawn at
   whatever size it is given, the page scrolls now, and a teacher
   demonstrating to the whole class wants the floor as big as it will go.
   So the ceiling is only there to stop a slipped drag asking for a canvas
   the browser cannot allocate. */
const CANVAS_MIN = 260;
const CANVAS_MAX = 2400;
const SIZE_KEY = "bitbot-gym:canvas";

export default function RoomView({ snap, post, ask, show, trail, catalogue }) {
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const rendererRef = useRef(null);
  const dragRef = useRef(null);
  const penRef = useRef(null);          // the line being dragged out right now
  /* the last spot the keyboard ASKED for, so a burst of presses adds up
     instead of six of them all counting from the same stale snapshot */
  const nudgeRef = useRef(null);
  const snapRef = useRef(null);         // the latest, for the resize repaint
  const roomRef = useRef({ w: 0, h: 0 });  // the room shape we last asked for
  const optsRef = useRef({});
  const [menu, setMenu] = useState(null);
  const [sel, setSel] = useState(null);
  /* What the four arrow keys do to it: slide it, or spin it. Shown as
     two buttons under the room, because a mode nobody can see is the
     thing this whole file just got rid of. */
  const [mode, setMode] = useState("move");
  /* A one-shot pointer job, chosen from the floor menu and spent on the
     next drag. It is NOT a mode: nothing can be left in it, because it
     clears itself the moment the hand lets go. */
  const [armed, setArmed] = useState(null);       // "pen" | "erase" | null

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

  /* ---- how big the canvas is -----------------------------------------

     A school Chromebook is 1366 by 768 with a shelf across the bottom, and
     a 620 pixel room plus a menu bar plus a row of robot cards does not
     fit in it. So the box carries a resize grip, the size it is dragged to
     is remembered, and the backing store is kept exactly equal to the box
     - draw at one size and display at another and every click lands
     somewhere other than where it was aimed.

     AND THE ROOM IS NOT SQUARE ANY MORE. It is whatever shape this box
     is, because every screen the gym runs on is wider than it is tall and
     a square room left a strip of nothing down each side - the floor the
     children actually got was only as big as the window is TALL.

     So the canvas takes the whole box, and the ROOM is then told to be
     that shape. `reshape` moves the real walls, which is what makes this
     a bigger floor and not just a wider picture of the same floor. */
  useEffect(() => {
    const box = boxRef.current, cv = canvasRef.current;
    if (!box || !cv) return;

    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(SIZE_KEY) || "null"); } catch (e) { /* never mind */ }

    /* `wish` is the size the grip was last dragged to - the child's decision,
       and the thing worth remembering. `applied` is what we actually put on
       the box, which may be smaller: a room dragged wide on a classroom
       monitor must not hang off the edge of a laptop. Keeping the two apart
       means a small window borrows the room for a while without stealing the
       remembered size. */
    let wish = saved && saved.w > 0 && saved.h > 0
                 ? { w: Math.round(saved.w), h: Math.round(saved.h) } : null;
    let applied = null;

    const hold = () => {
      if (!wish) return false;
      const main = box.closest("main");
      const capW = main ? main.clientWidth : Infinity;
      const capH = main ? main.clientHeight - 32 : Infinity;
      const w = Math.round(Math.max(CANVAS_MIN, Math.min(wish.w, capW)));
      const h = Math.round(Math.max(CANVAS_MIN, Math.min(wish.h, capH)));
      if (box.style.width === w + "px" && box.style.height === h + "px") return false;
      box.style.width = w + "px";
      box.style.height = h + "px";
      applied = { w: w, h: h };
      return true;
    };
    hold();

    /* ---- AS BIG AS THE SCREEN, to start with --------------------------

       The room opens filling the window: the whole width, and whatever
       height is left under the header once the hint line has had its
       twenty pixels. The cards go below the fold and the arrow keys
       scroll down to them, which is the right way round - the room is
       the thing being taught with, the cards are the readouts.

       Only until somebody drags the grip, though. A dragged size is a
       decision and it is remembered; this is just the opening bid, so it
       is re-made whenever the window changes and never once the grip has
       been touched. */
    const auto = () => {
      if (box.style.width) return false;              // the grip has had its say
      const main = box.closest("main");
      const hint = box.parentElement && box.parentElement.parentElement
                     && box.parentElement.parentElement.querySelector(".keyhint");
      if (!main) return false;
      const room = Math.max(CANVAS_MIN,
                     main.clientHeight - (hint ? hint.offsetHeight + 12 : 32));
      const want = Math.round(room) + "px";
      if (box.style.height === want) return false;
      box.style.height = want;
      return true;
    };

    /* What shape the room should be, in millimetres, for a canvas this
       shape. Clamped, because a box dragged into a long thin letterbox
       would otherwise ask for a corridor eight metres long - and the
       light and sound grids are sized off the long side. */
    const roomFor = (pw, ph) => {
      const ratio = Math.max(0.35, Math.min(3.2, pw / ph));
      return ratio >= 1 ? { w: Math.round(ROOM_SHORT * ratio), h: ROOM_SHORT }
                        : { w: ROOM_SHORT, h: Math.round(ROOM_SHORT / ratio) };
    };

    const fit = () => {
      const bw = Math.max(CANVAS_MIN, Math.min(CANVAS_MAX, Math.floor(box.clientWidth)));
      const bh = Math.max(CANVAS_MIN, Math.min(CANVAS_MAX, Math.floor(box.clientHeight)));
      if (!bw || !bh) return false;
      /* THE ROOM IS RESHAPED FIRST, and sent rather than posted: the
         canvas is about to be redrawn at the new shape, and the snapshot
         it is drawn from has to agree already or there is a frame with
         the walls in the wrong place. */
      const want = roomFor(bw, bh);
      let moved = false;
      if (want.w !== roomRef.current.w || want.h !== roomRef.current.h) {
        roomRef.current = want;
        try { ask({ cmd: "reshape", w: want.w, h: want.h }); moved = true; }
        catch (e) { console.error(e); }
      }

      /* THE CANVAS IS THE ROOM'S SHAPE, not the box's, and the two are
         only the same while the box's shape is one the room is allowed to
         be. Drag the box into a letterbox narrower than the clamp above
         permits and the room stops following; if the canvas went on
         following, the renderer - which scales off the WIDTH, so that one
         scale serves both axes and a click cannot land anywhere but where
         it was aimed - would draw the bottom of the room off the bottom
         of the canvas, and the strip that fell off could never be
         clicked. So the canvas takes the biggest rectangle of the room's
         shape that fits the box, and any slack is left as margin. */
      const ar = want.w / want.h;
      let pw = bw, ph = Math.round(bw / ar);
      if (ph > bh) { ph = bh; pw = Math.round(bh * ar); }
      if (cv.width === pw && cv.height === ph) return moved;
      cv.width = pw; cv.height = ph;
      /* and displayed at exactly those pixels: one backing pixel to one
         css pixel is what keeps the picture crisp and the maths honest */
      cv.style.width = pw + "px"; cv.style.height = ph + "px";
      return true;
    };

    const ro = new ResizeObserver(() => {
      /* a resized canvas is a BLANK canvas until something paints it, and
         waiting for the next snapshot shows a white hole where the room is */
      if (fit() && rendererRef.current) {
        try {
          snapRef.current = ask({ cmd: "snapshot" });   // the reshaped room, not the old one
          rendererRef.current.draw(snapRef.current, optsRef.current);
        } catch (e) { console.error(e); }
      }
      /* remember only what the grip was dragged to: the browser writes an
         inline size when it is dragged and at no other time */
      if (box.style.width) {
        const cw = box.clientWidth, ch = box.clientHeight;
        /* only a size we did not write ourselves came from the grip */
        if (!applied || Math.abs(cw - applied.w) > 1 || Math.abs(ch - applied.h) > 1) {
          wish = { w: cw, h: ch };
          applied = { w: cw, h: ch };
          try { localStorage.setItem(SIZE_KEY, JSON.stringify(wish)); }
          catch (e) { /* full, or a private window: the size is a nicety */ }
        }
      }
    });
    ro.observe(box);
    /* the window changing size re-makes the opening bid; the box's own
       ResizeObserver then does the rest */
    const onResize = () => { hold(); auto(); };
    window.addEventListener("resize", onResize);
    auto();
    fit();
    return () => { ro.disconnect(); window.removeEventListener("resize", onResize); };
  }, [ask]);

  useEffect(() => {
    snapRef.current = snap;
    optsRef.current = { trail, show, pen: penRef.current, sel };
    if (rendererRef.current && snap) {
      try { rendererRef.current.draw(snap, optsRef.current); }
      catch (e) { console.error(e); }
    }
  }, [snap, trail, show, sel]);

  /* A picked thing that has been taken out of the room is not picked any
     more. Without this the keyboard went on nudging a uid nothing answers
     to, and the ring stayed painted over bare floor. */
  useEffect(() => {
    if (!sel || !snap) return;
    const there =
      sel.kind === "body"   ? (snap.bodies || []).some(b => b.id === sel.id)
    : sel.kind === "thing"  ? (snap.furniture || []).some(f => f.uid === sel.uid)
    : sel.kind === "lamp"   ? sel.index < (snap.lamps || []).length
    : sel.kind === "magnet" ? sel.index < (snap.magnets || []).length
    : false;
    if (!there) setSel(null);
  }, [snap, sel]);

  /* The menu is a thing in front of the room; a click anywhere else is a
     click that means to put it away. */
  useEffect(() => {
    if (!menu) return;
    const away = () => setMenu(null);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [menu]);

  /* ---- the keyboard ---------------------------------------------------

     FOUR ARROW KEYS AND NOTHING ELSE. This started out as arrows to move
     and shift-arrow to turn, which is the obvious design and is no use at
     all on the machine the class has: ChromeOS eats shift-arrow before the
     page ever sees it, so turning simply did not happen.

     So the arrows do both, and WHICH they do is a thing you can see - two
     buttons under the room, Move and Turn, with the live one lit. A mode
     you can see and switch with a thumb is a different animal from the old
     invisible pointer tool, and it is the only way to get two jobs out of
     four keys on a keyboard that will not give us a fifth.

     Space flips between them, for a hand already on the keys, and shift
     with left or right still turns on the machines where it works - an
     undocumented shortcut costs nothing and helps on a real laptop.

     AND WITH NOTHING PICKED THE SAME KEYS SCROLL THE PAGE, which on a
     Chromebook is the only way down to the cards: the page does not scroll
     the document, it scrolls the box the room and the cards sit in, and a
     browser only scrolls a box like that when something inside it has the
     focus. Pressing down and having the screen sit still is how a child
     decides a page is broken. So this handler owns the arrow keys either
     way - hold something and they move it, hold nothing and they scroll -
     and Escape is the one key that gets you from the first to the second.

     Guarded two ways: the keys belong to a text box whenever one has the
     focus, or renaming a robot would drive it across the floor; and they
     are only swallowed when they were actually used. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;

      if (!sel) {
        /* NOTHING HELD: the arrows are the page's. A line is about the
           height of a folded card's row, a page is most of the box. */
        const box = document.querySelector("main.tab-room");
        if (!box) return;
        const by = e.key === "ArrowDown" ? 120 : e.key === "ArrowUp" ? -120
                 : e.key === "PageDown" ? box.clientHeight - 60
                 : e.key === "PageUp" ? -(box.clientHeight - 60)
                 : e.key === "Home" ? -box.scrollHeight
                 : e.key === "End" ? box.scrollHeight : 0;
        if (!by) return;
        e.preventDefault();
        /* NOT a smooth scroll. Chrome measures the next scrollBy from
           wherever the animation has got to, so holding the key down or
           pressing it three times quickly scrolled once and swallowed the
           rest - which looks exactly like a dropped key press. Jumping is
           what every other scrollable page does anyway. */
        box.scrollTop += by;
        return;
      }

      if (e.key === "Escape") { setSel(null); setMenu(null); return; }
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setMode(m => (m === "move" ? "turn" : "move"));
        return;
      }

      const arrow = e.key === "ArrowLeft" || e.key === "ArrowRight"
                 || e.key === "ArrowUp"   || e.key === "ArrowDown";
      if (!arrow) return;
      /* Turn mode, or the shift shortcut where the machine allows it. Up
         and down turn too, so a child who has not noticed which pair does
         what still gets a turn out of whichever key they press. */
      const spin = mode === "turn" || e.shiftKey;
      const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
      const dx = spin ? 0 : e.key === "ArrowLeft" ? -NUDGE : e.key === "ArrowRight" ? NUDGE : 0;
      const dy = spin ? 0 : e.key === "ArrowUp" ? -NUDGE : e.key === "ArrowDown" ? NUDGE : 0;
      e.preventDefault();
      /* The click that picked this thing up also opened its menu, which is
         now sitting over the room. The moment the keys take over, the menu
         is in the way of the only thing you want to look at. */
      setMenu(null);
      const by = spin ? (back ? -SPIN : SPIN) : 0;

      /* ---- WHERE THE THING IS, which is NOT what the snapshot says.

         A posted command is drained between ticks, so the snapshot in hand
         is always one frame behind what has just been asked for. Press an
         arrow six times quickly and all six read the same stale heading
         and all six ask for the same single step: the robot turned fifteen
         degrees and the child pressed six times. It looked like dropped
         key presses and it was not - every press landed, on the same old
         number.

         So the last thing we ASKED for is remembered, and the next press
         counts from there. It is forgotten after half a second of quiet,
         by which time the room has caught up and is the better authority;
         and whenever the hand drags something, because then the room is
         the only authority. */
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const key = sel.kind + ":" + (sel.id != null ? sel.id : sel.uid != null ? sel.uid : sel.index);
      const q = nudgeRef.current;
      const warm = q && q.key === key && now - q.t < 500 ? q : null;
      const keep = (x, y, a) => { nudgeRef.current = { key, t: now, x, y, a }; };

      if (sel.kind === "body") {
        const b = (snap.bodies || []).find(x => x.id === sel.id);
        if (!b) return;
        const x = (warm ? warm.x : b.x) + dx;
        const y = (warm ? warm.y : b.y) + dy;
        const h = (warm ? warm.a : (b.h || 0)) + by;
        keep(x, y, h);
        post({ cmd: "place", id: b.id, x, y, heading: h });
      } else if (sel.kind === "thing") {
        const f = (snap.furniture || []).find(x => x.uid === sel.uid);
        if (!f) return;
        const x = (warm ? warm.x : f.x + f.w / 2) + dx;
        const y = (warm ? warm.y : f.y + f.h / 2) + dy;
        const a = (warm ? warm.a : (f.rot || 0)) + by;
        keep(x, y, a);
        if (spin) post({ cmd: "turnThing", uid: f.uid, rot: a });
        else post({ cmd: "moveThing", uid: f.uid, x, y, centred: true });
      } else if (sel.kind === "lamp") {
        if (spin) return;                                   // a bulb has no front
        const L = (snap.lamps || [])[sel.index];
        if (!L) return;
        const x = (warm ? warm.x : L.x) + dx, y = (warm ? warm.y : L.y) + dy;
        keep(x, y, 0);
        post({ cmd: "moveLamp", id: sel.index, x, y });
      } else if (sel.kind === "magnet") {
        const M = (snap.magnets || [])[sel.index];
        if (!M) return;
        const x = (warm ? warm.x : M.x) + dx, y = (warm ? warm.y : M.y) + dy;
        const a = (warm ? warm.a : (M.rot || 0)) + by;
        keep(x, y, a);
        if (spin) post({ cmd: "turnMagnet", id: sel.index, rot: a });
        else post({ cmd: "moveMagnet", id: sel.index, x, y });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, snap, post, mode]);

  const toRoom = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    /* One scale, off the width, because the canvas and the room are kept
       the same shape. Using the height for y as well would paper over a
       mismatch instead of showing it, and a papered-over mismatch is a
       click that lands somewhere other than where it was aimed. */
    const S = (snap.w || snap.size) / r.width;
    return { x: (e.clientX - r.left) * S, y: (e.clientY - r.top) * S };
  };

  /* What is under this point, in the order a hand means them: the turn dot
     first because it sticks out past everything, then robots, then LAMPS,
     then furniture, then the floor.

     The turn dot is only asked about for the thing that is PICKED, because
     that is now the only thing wearing one.

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
    if (sel && sel.kind === "body") {
      const b = (snap.bodies || []).find(x => x.id === sel.id);
      if (b && near(turnPointOf({ body: b }))) return { what: "turn-body", body: b };
    }
    if (sel && sel.kind === "thing") {
      const f = (snap.furniture || []).find(x => x.uid === sel.uid);
      if (f && near(turnPointOf({ thing: f }))) return { what: "turn-thing", thing: f };
    }
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

  const selOf = (hit) =>
      hit.what === "body"   || hit.what === "turn-body"  ? { kind: "body", id: hit.body.id }
    : hit.what === "thing"  || hit.what === "turn-thing" ? { kind: "thing", uid: hit.thing.uid }
    : hit.what === "lamp"   ? { kind: "lamp", index: hit.index }
    : hit.what === "magnet" ? { kind: "magnet", index: hit.index }
    : null;

  /* Everything the menu needs about what was clicked, in the shape
     RoomMenu reads. Built in one place because both buttons open it. */
  const menuFor = (hit, e, p) => {
    const what = hit.what.startsWith("turn-") ? hit.what.slice(5) : hit.what;
    return {
      at: { top: e.clientY, left: e.clientX }, what,
      body: hit.body, thing: hit.thing, lamp: hit.lamp, magnet: hit.magnet,
      index: hit.index, spot: p,
      /* which speaker this is, if it is one: the world switches them on by
         their place in its list, not by uid */
      speaker: hit.thing ? snap.speakers.findIndex(S => S.uid === hit.thing.uid) : -1
    };
  };

  const down = (e) => {
    if (e.button !== 0) return;                      // the other button is the context handler
    setMenu(null);
    const p = toRoom(e);
    /* Guarded, as the old gym guarded it. Capture is a nicety - it keeps a
       drag alive when the pointer leaves the canvas - and it throws for a
       pointer the browser does not think is down. Letting that throw takes
       the whole press with it, so the child presses a robot and nothing at
       all happens. */
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch (err) { /* no capture, still a drag */ }

    nudgeRef.current = null;            // the hand overrules anything the keys asked for
    if (armed === "pen")   { penRef.current = { from: p, to: p }; return; }
    if (armed === "erase") { post({ cmd: "erase", x: p.x, y: p.y }); return; }

    const hit = pick(p);
    /* Where the press started and what it was over, so letting go can ask
       whether the hand travelled far enough to have meant a drag. */
    const start = { x: p.x, y: p.y, hit, moved: false };

    if (hit.what === "turn-body")  { dragRef.current = { ...start, kind: "turn-body", id: hit.body.id }; return; }
    if (hit.what === "turn-thing") { dragRef.current = { ...start, kind: "turn-thing", uid: hit.thing.uid }; return; }
    if (hit.what === "body") {
      dragRef.current = { ...start, kind: "body", id: hit.body.id };
      post({ cmd: "hold", id: hit.body.id });
      return;
    }
    if (hit.what === "thing") {
      const f = hit.thing;
      dragRef.current = { ...start, kind: "thing", uid: f.uid,
                          dx: p.x - (f.x + f.w / 2), dy: p.y - (f.y + f.h / 2) };
      return;
    }
    if (hit.what === "lamp")   { dragRef.current = { ...start, kind: "lamp", index: hit.index }; return; }
    if (hit.what === "magnet") { dragRef.current = { ...start, kind: "magnet", index: hit.index }; return; }
    /* bare floor: nothing to drag, but letting go here still means something */
    dragRef.current = { ...start, kind: "floor" };
  };

  const move = (e) => {
    if (armed === "pen" && penRef.current) {
      /* drawn on the canvas as you drag and only sent to the room when you
         let go: a line half-drawn is not a line the sensors should see */
      penRef.current = { from: penRef.current.from, to: toRoom(e) };
      return;
    }
    if (armed === "erase" && e.buttons) {
      const p = toRoom(e); post({ cmd: "erase", x: p.x, y: p.y }); return;
    }

    const d = dragRef.current;
    if (!d) return;
    const p = toRoom(e);
    if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) > CLICK_SLOP) d.moved = true;
    if (!d.moved) return;                  // still inside the slop: this may yet be a click
    if (d.kind === "floor") return;

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

  const up = (e) => {
    if (armed === "pen" && penRef.current) {
      const { from, to } = penRef.current;
      penRef.current = null;
      setArmed(null);                                 // spent
      /* a tap is not a line, it is a child deciding not to draw one */
      if (Math.hypot(to.x - from.x, to.y - from.y) > 40) post({ cmd: "line", from, to });
      return;
    }
    if (armed === "erase") { setArmed(null); return; }

    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    if (d.kind === "body") post({ cmd: "drop", id: d.id });

    /* Either way the thing is now PICKED, so the arrow keys carry straight
       on from wherever the hand left it: drag it roughly across the room,
       then nudge it onto the line. What the two differ in is the menu - a
       click asked for it, a drag has already done its work and wants no
       menu dropped over the top of it. */
    setSel(selOf(d.hit));
    if (d.moved) return;
    if (e) setMenu(menuFor(d.hit, e, { x: d.x, y: d.y }));
  };

  /* Right-click opens the very same menus. Nothing needs it any more, but
     it is what a grown-up hand tries first and it costs one line. */
  const context = (e) => {
    e.preventDefault();
    const p = toRoom(e);
    const hit = pick(p);
    setSel(selOf(hit));
    setMenu(menuFor(hit, e, p));
  };

  const cursor = armed === "pen" ? "crosshair" : armed === "erase" ? "cell" : "grab";

  return (
    <div className="roomview">
      <div className="stage">
        <div className="canvasbox" ref={boxRef}
             title="drag the bottom-right corner to resize the room">
          <canvas ref={canvasRef} width={620} height={620} id="room"
                  style={{ cursor }}
                  onPointerDown={down} onPointerMove={move}
                  onPointerUp={up} onPointerCancel={() => { dragRef.current = null; }}
                  onContextMenu={context} />
        </div>
        {menu && (
          <div className="drop ctx" style={menu.at} role="menu"
               onPointerDown={e => e.stopPropagation()}
               onClick={() => setMenu(null)}>
            <RoomMenu menu={menu} post={post} close={() => setMenu(null)}
                      catalogue={catalogue} arm={setArmed} />
          </div>
        )}
      </div>
      {/* ONE LINE UNDER THE ROOM, and it carries the only mode left in the
          gym. Move or Turn, lit so you can see which, because four arrow
          keys have to do two jobs on a Chromebook that will not pass shift
          through. The buttons are there for a finger as well as a thumb on
          the space bar - a touchscreen Chromebook has no keyboard open. */}
      <div className="keyhint">
        {sel && (
          <span className="modesw" role="group" aria-label="what the arrow keys do">
            {["move", "turn"].map(m => (
              <button key={m} className={mode === m ? "on" : ""}
                      onClick={() => setMode(m)}
                      title="the space bar swaps these">
                {m === "move" ? "✥ Move" : "↻ Turn"}
              </button>
            ))}
          </span>
        )}
        <span className="said">
          {armed === "pen" ? <>Now <b>drag</b> across the floor to lay the tape.</>
          : armed === "erase" ? <>Now <b>sweep</b> over the tape to rub it out.</>
          : sel ? <>Holding <b>{labelOf(snap, sel)}</b> &mdash; the <b>arrow keys</b>{" "}
                    {mode === "turn" ? "turn" : "move"} it, <b>Space</b> swaps,{" "}
                    <b>Esc</b> lets go.</>
          : <>Click a robot or a thing to pick it up. Click the floor to put
              something down. The <b>arrow keys</b> scroll the page.</>}
        </span>
      </div>
    </div>
  );
}

/* What to call the picked thing in the hint line. */
function labelOf(snap, sel) {
  if (sel.kind === "body") {
    const b = (snap.bodies || []).find(x => x.id === sel.id);
    return (b && b.program && b.program.name) || "the robot";
  }
  if (sel.kind === "thing") {
    const f = (snap.furniture || []).find(x => x.uid === sel.uid);
    return (f && f.name) || "it";
  }
  if (sel.kind === "lamp") {
    const L = (snap.lamps || [])[sel.index];
    return L && L.kind === "ceiling" ? "the ceiling light" : "the lamp";
  }
  return "the magnet";
}

function RoomMenu({ menu, post, close, catalogue, arm }) {

  /* THE FLOOR'S OWN MENU. This is where Add object, Draw line and Erase
     line went when they stopped being pointer modes. Everything here acts
     on the spot that was clicked, which is the thing a mode could never
     promise: "add a chair" used to mean "add a chair wherever you click
     NEXT", and next was often somewhere the child had stopped meaning. */
  if (menu.what === "floor") {
    const at = menu.spot;
    /* Rows of small buttons rather than a column of full-width items. The
       floor menu now carries what the Build and Robots menus used to, and
       a column of fourteen items is a menu you scroll - on a Chromebook
       whose whole screen is 768 pixels tall, a menu you scroll is a menu
       whose bottom half nobody ever sees. */
    const pill = (label, msg, title) => (
      <button key={label} className="pill" title={title || null}
              onClick={() => { post({ ...msg, x: at.x, y: at.y }); if (close) close(); }}>
        {label}
      </button>
    );
    return (
      <>
        <Sep label="put something here" />
        <Row label="robot">
          {pill("Bit:Bot", { cmd: "add" }, "wheels, eyes, sonar")}
          {pill("micro:bit", { cmd: "add", kind: "microbit" }, "just the board")}
        </Row>
        <Row label="thing">
          {/* Choosing IS the act - there is no second button to press. The
              catalogue is twenty-six things long, which is a list and not
              a menu. */}
          <select defaultValue=""
                  onChange={e => {
                    if (!e.target.value) return;
                    post({ cmd: "thing", name: e.target.value, x: at.x, y: at.y, centred: true });
                    if (close) close();
                  }}>
            <option value="" disabled>choose one...</option>
            {(catalogue || []).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </Row>
        <Row label="more">
          {pill("Lamp", { cmd: "addLamp" }, "stands on the floor")}
          {pill("Ceiling", { cmd: "addLamp", kind: "ceiling" }, "shines straight down")}
          {pill("Speaker", { cmd: "addSpeaker" }, "the microphone can hear it")}
          {pill("Magnet", { cmd: "addMagnet" }, "upsets the compass near it")}
        </Row>
        <Sep label="tape on the floor" />
        {/* These two still need a DRAG - a line has two ends, a rubber has
            to be swept - so they arm the pointer for exactly one go and
            then hand it straight back. */}
        <Item onClick={() => arm("pen")} hint="then drag it out">Draw a line</Item>
        <Item onClick={() => arm("erase")} hint="then sweep over the tape">Rub out lines</Item>
        {/* THE WHOLE ROOM AT ONCE, which is what is left of the Build menu
            now that there is no Build menu. It belongs on the floor for the
            same reason everything else does: the floor IS the whole room. */}
        <Sep label="the whole room at once" />
        <Row label="all">
          <button className="pill" onClick={() => { post({ cmd: "furnish" }); if (close) close(); }}>
            Furnish
          </button>
          <button className="pill" title="lights stay on"
                  onClick={() => { post({ cmd: "empty" }); if (close) close(); }}>
            Empty
          </button>
          <button className="pill" title="rubs out every line"
                  onClick={() => { post({ cmd: "clearFloor" }); if (close) close(); }}>
            Clear tape
          </button>
          <button className="pill" title="back to their start spots"
                  onClick={() => { post({ cmd: "home" }); if (close) close(); }}>
            Robots back
          </button>
        </Row>
      </>
    );
  }

  if (menu.what === "body") {
    const b = menu.body;
    const p = b.program || {};
    return (
      <>
        <Sep label={p.plugged ? "Bit:Bot" : "micro:bit"} />
        {/* A box, not a prompt(): prompt is not supported in the app's own
            browser and throws, so the menu item did nothing at all. */}
        <Row label="name">
          {/* NOT focused when the menu opens, though it used to be. The
              arrow keys are how a robot is placed now, and a focused text
              box eats every one of them: you clicked the robot, the menu
              came up, you pressed an arrow and a caret moved. Click the
              box when you mean to rename it. */}
          <input defaultValue={p.name || ""} maxLength={18}
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
