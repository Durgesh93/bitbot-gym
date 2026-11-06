/* A menu bar, because a field of buttons cannot survive being resized.

   The room has about twenty commands. Laid out as buttons they need two
   or three rows, and the number of rows depends on how wide the window
   is - so the canvas height changes as you drag the window, the layout
   reflows, and at some width the last row lands under something else.
   That is not a bug to be patched; it is what a wrapping toolbar does.

   Four menus of four short words cannot wrap, at any width, ever. The
   commands are grouped by what they are for rather than by what they do
   to the code, which is the only grouping a child or a teacher can
   predict.

   Two rules this file keeps, and they are the reason it is a component
   and not a `<details>`:

   WHAT IS ON STAYS VISIBLE. A menu hides its contents, so anything with
   a state - which pointer tool is live, which sensor views are on - wears
   a tick inside the menu AND a chip on the button outside it. A mode you
   cannot see is a mode you will forget you are in.

   IT CLOSES THE WAYS PEOPLE EXPECT. Click outside, press Escape, or pick
   something. A menu that stays open after a click is the single most
   common way a home-made one goes wrong.

   THE PANEL IS MEASURED AGAINST THE WINDOW, not against the button. Two
   reasons, and both of them bit: the bar scrolls sideways if it ever has
   to, and a panel laid out inside a scrolling box gets clipped by it; and
   the rightmost menu's panel would hang off the edge of a narrow window.
   Fixed coordinates, worked out when it opens and clamped to the glass,
   answer both. */

import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";

const GAP = 5;          // between the button and its panel
const EDGE = 8;         // nearest the panel may come to the side of the window

/* WHICH ONE IS OPEN IS THE BAR'S BUSINESS, not each menu's.

   Two menus open at once is wrong, and so is having to click twice to look
   in the next one: once a bar is open, running the pointer along it should
   follow, the way every menu bar has worked since 1984. Both of those need
   one piece of state above the menus, so here it is. A Menu outside a
   MenuBar still works on its own. */
const Bar = createContext(null);

export function MenuBar({ children }) {
  const [open, setOpen] = useState(null);
  return (
    <nav className="bar">
      <Bar.Provider value={{ open, setOpen }}>{children}</Bar.Provider>
    </nav>
  );
}

export function Menu({ label, chip, children }) {
  const bar = useContext(Bar);
  const [alone, setAlone] = useState(false);
  const open = bar ? bar.open === label : alone;
  const setOpen = v => (bar ? bar.setOpen(v ? label : null) : setAlone(v));
  const [at, setAt] = useState({ top: 0, left: 0 });
  const box = useRef(null);
  const panel = useRef(null);

  /* Placed after it has been laid out, so its real width is known and the
     clamp has something true to work with.

     AND ITS HEIGHT IS CLAMPED TOO. Only the width was, and the Robots menu
     is nearly three hundred pixels of sliders: on a classroom laptop with
     the browser's own furniture taking the top of the screen, grip,
     battery and the light-sensor switch were simply off the bottom with no
     way to reach them. The panel now stops at the glass and scrolls. */
  useLayoutEffect(() => {
    if (!open || !box.current || !panel.current) return;
    const b = box.current.getBoundingClientRect();
    const w = panel.current.offsetWidth;
    const top = b.bottom + GAP;
    setAt({ top: top,
            left: Math.max(EDGE, Math.min(b.left, window.innerWidth - w - EDGE)),
            maxHeight: Math.max(140, window.innerHeight - top - EDGE) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = e => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === "Escape") setOpen(false); };
    /* pointerdown, not click: a menu that is still open while the pointer
       is down on the thing behind it feels stuck */
    /* Resizing moves the button out from under the panel. Rather than
       chase it, shut: nobody resizes a window mid-menu on purpose. */
    const gone = () => setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", gone);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", gone);
    };
  }, [open]);

  return (
    <div className={"menu" + (open ? " open" : "")} ref={box}>
      <button className="menubtn" onClick={() => setOpen(!open)} aria-expanded={open}
              onPointerEnter={() => { if (bar && bar.open && bar.open !== label) setOpen(true); }}>
        {label}
        {chip && <em>{chip}</em>}
        <i aria-hidden="true">{"▾"}</i>
      </button>
      {open && (
        <div className="drop" role="menu" ref={panel} style={at}
             onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

/* One command. `on` draws the tick - used for both "this is the live
   tool" and "this view is showing", because to a child those are the same
   idea and deserve the same mark. */
/* `keepOpen` is for the rare item that arms something inside the menu
   rather than doing it - "Forget a saved project" turns the list below it
   into a list of things to forget, and a menu that shut at that moment
   would look like a button that did nothing. */
export function Item({ on, onClick, hint, keepOpen, children }) {
  return (
    <button className={"mitem" + (on ? " on" : "")} role="menuitem"
            onClick={e => { if (keepOpen) e.stopPropagation(); if (onClick) onClick(e); }}>
      <span className="tick" aria-hidden="true">{on ? "✓" : ""}</span>
      <span className="what">{children}</span>
      {hint && <span className="hint">{hint}</span>}
    </button>
  );
}

/* Something that is not a command - a dropdown, a row of swatches. It
   must not close the menu, because you have not finished with it. */
export function Row({ label, children }) {
  return (
    <div className="mrow" onClick={e => e.stopPropagation()}>
      {label && <span className="mlabel">{label}</span>}
      {children}
    </div>
  );
}

/* A number you set by dragging, with the number shown. The value comes
   from the model every time - the slider is never the truth about how fast
   a robot goes, it is a handle on the truth. */
export function Slider({ label, hint, min, max, step, value, unit, dp, onChange }) {
  const shown = dp ? Number(value).toFixed(dp) : Math.round(value);
  return (
    <div className="mslide" onClick={e => e.stopPropagation()}>
      <label>
        <span className="mlabel">{label}</span>
        <b>{shown}{unit || ""}</b>
      </label>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={e => onChange(Number(e.target.value))} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Sep({ label }) {
  return label
    ? <div className="msep" role="separator"><span>{label}</span></div>
    : <div className="msep bare" role="separator" />;
}
