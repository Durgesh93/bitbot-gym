/* One board's card: the thing a child actually works in.

   Everything on it comes out of `body`, which is one entry of the snapshot.
   The card holds no state of its own - not the screen, not the sensor
   numbers, not whether the program is running, not even whether a button is
   held down. It cannot drift, because there is nothing of its own to drift
   from.

   Two halves, with a rule between them: on top what the micro:bit feels,
   underneath what the robot feels. A child learning that the board is the
   brain and the chassis is the body can see it in the card.

   Watch the A button to see the whole gym in miniature. Pressing it posts a
   message; the board takes it on the next drain; the board's read() puts it
   in `reads`; the snapshot carries it here; the button lights up. It would
   have been one line to light the button from a React useState, and that
   line is exactly the lie this rebuild exists to stop telling.

   TWO SIZES. A full card is for the child working on that robot. A compact
   one is for the teacher with ten of them: name, state, what is on the
   screen, and the two readings that say whether a robot is doing something
   sensible. Ten full cards is five screens of scrolling, and "which of my
   ten are stuck?" is a question you have to be able to answer by looking
   up, not by scrolling. Compact is not less honest - it is the same
   snapshot, fewer of its fields. */

import React, { useRef, useState } from "react";
import { Screen, Meter, Eyes, Sonar, Line, Compass, Pixels, Pill, Field } from "./parts.jsx";

export default function Card({ body, post, log, compact, onToggle, onCode }) {
  const p = body.program || {};
  const r = body.reads || {};
  const state = p.state || "ready";
  const cls = state === "run" ? "live" : state === "stop" ? "off" : state === "wait" ? "hold" : "";

  const said = log || [];
  const last = said[said.length - 1];
  const send = msg => post({ ...msg, id: body.id });
  const hold = (button) => ({
    onPointerDown: () => send({ cmd: "press", button, down: true }),
    onPointerUp: () => send({ cmd: "press", button, down: false }),
    onPointerLeave: () => send({ cmd: "press", button, down: false })
  });

  /* THE NAME IS THE CHILD'S. Click it and type over it.

     It was a `window.prompt` for about an hour, which looked like one line
     of honest code and was a bug: prompt() is not supported in the app's
     own browser and throws, so clicking the name did nothing at all. It is
     not reliable in an installed PWA either. Nothing in the gym may depend
     on it.

     The half-typed name IS state, and it lives here, which is the one
     exception to this card holding none: a draft is not the model, and
     sending every keystroke to the room would make the room's name fight
     the cursor. It commits on Enter or on leaving the box, and Escape
     throws it away. */
  const name = p.name || ("micro:bit " + body.id);
  const [editing, setEditing] = useState(false);
  const focused = useRef(null);        // the box we have already put the cursor in
  const commit = (e) => { send({ cmd: "rename", name: e.target.value }); setEditing(false); };

  const head = (
    <div className="top">
      {editing
        ? <input className="rename" defaultValue={name} maxLength={18}
                 /* FOCUSED ONCE, when the box first appears.
                    By hand rather than with autoFocus, which is quietly
                    skipped when the document is not focused - and ONCE,
                    because a ref callback runs on every render and this
                    card re-renders sixty times a second off the snapshot.
                    Selecting the text again each time meant the next
                    keystroke replaced the one before it, so a name could
                    only ever be one character long. React keeps the same
                    DOM node across renders, so comparing it is enough. */
                 ref={el => {
                   if (!el || el === focused.current) return;
                   focused.current = el; el.focus(); el.select();
                 }}
                 onBlur={commit}
                 onKeyDown={e => {
                   /* Enter COMMITS; it does not blur and hope. blur() does
                      nothing at all when the box never got focus, and the
                      name silently would not change. */
                   if (e.key === "Enter") commit(e);
                   if (e.key === "Escape") setEditing(false);   // unmounts, so no commit
                 }} />
        : <b className="naming" onClick={() => setEditing(true)}
             title="click to give it a name">{name}</b>}
      <Pill state={state} />
      <span className="spacer" />
      <span className="ctime">{((p.stopwatch || 0) / 1000).toFixed(1)}s</span>
      {onToggle && (
        <button className="caret" onClick={onToggle}
                title={compact ? "open this one up" : "fold it away"}>
          {compact ? "+" : "−"}
        </button>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className={"card small " + cls}>
        {head}
        <div className="mbrow">
          <Screen cells={body.screen} dim={state === "stop"} small />
          <div className="gauges">
            {p.plugged
              ? <><Eyes left={r.lightL} right={r.lightR} /><Sonar cm={r.sonar} /></>
              : <><Meter label="light" value={r.light} max={255} tone="warm" />
                  <Meter label="sound" value={r.sound} max={255} tone="hot" /></>}
          </div>
        </div>
        {/* One line, the newest. At this size that is the whole question -
            "what is this one doing?" - and ten of them answered at once is
            the thing a wall of full cards could never give a teacher. */}
        <div className={"lastsaid" + (last && last.cls === "err" ? " bad" : "")}>
          {last ? last.msg : "\u2014"}
        </div>
        {/* THE SAME FOUR BUTTONS AS AN OPEN CARD, in the same order. The
            folded card used to drop Reset to save width, and the result
            was that a robot's buttons changed depending on whether its
            card happened to be open - so a teacher saying "press Reset"
            was right for some children and wrong for others. Width is
            cheaper than that. */}
        <div className="run">
          <button className="go" onClick={() => send({ cmd: "run" })}>Play</button>
          <button onClick={() => send({ cmd: "stop" })}>Stop</button>
          <button onClick={() => send({ cmd: "reset" })}>Reset</button>
          <button className="code" onClick={() => onCode(body.id)}>Code</button>
        </div>
      </div>
    );
  }

  return (
    <div className={"card " + cls}>
      {head}

      {/* CODE IS ON THE CARD, beside Play, because that is the order the
          work happens in: this robot needs a program, so open the blocks
          for THIS robot. Hunting for a board number in a dropdown on
          another page was the step everybody got wrong. */}
      {/* THERE IS NO REMOVE BUTTON ON A CARD ANY MORE. Taking a robot out
          of the room is done where the robot is: click it on the floor and
          the menu that opens says "Take it out of the room". A card is for
          running the thing and watching it, and a delete button sitting
          among Play and Reset is a delete button a nine-year-old will one
          day press instead of Stop. */}
      <div className="run">
        <button className="go" onClick={() => send({ cmd: "run" })}>Play</button>
        <button onClick={() => send({ cmd: "stop" })}>Stop</button>
        <button onClick={() => send({ cmd: "reset" })}>Reset</button>
        <button className="code" onClick={() => onCode(body.id)}>Code</button>
      </div>

      {/* The two halves. Stacked in a normal card; side by side when an
          opened card has the whole row, which is the only time there is
          width to spare. */}
      <div className="panes">
        <div className="pane">
          <div className="sect mb">micro:bit</div>
          <div className="mbrow">
            <Screen cells={body.screen} dim={state === "stop"} />
            <div className="gauges">
              <Meter label="light" value={r.light} max={255} tone="warm" />
              <Meter label="sound" value={r.sound} max={255} tone="hot" />
              <Field uT={r.magnet} />
              <Compass heading={r.compass} />
            </div>
          </div>
          <div className="press">
            <button className={r.buttonA ? "down" : ""} {...hold("A")}>A</button>
            <button className={r.buttonB ? "down" : ""} {...hold("B")}>B</button>
            <button className={r.logo ? "down" : ""} {...hold("logo")}>logo</button>
            <button onClick={() => send({ cmd: "gesture", name: "shake" })}>shake</button>
          </div>
        </div>

        <div className="pane">
          {p.plugged ? (
            <>
              <div className="sect bb">Bit:Bot {p.model || "XL"}</div>
              <div className="gauges wide">
                <Eyes left={r.lightL} right={r.lightR} />
                <Sonar cm={r.sonar} />
                <Line left={r.lineL} right={r.lineR} />
                <Pixels pixels={p.pixels} />
              </div>
            </>
          ) : (
            <p className="inhand">in hand - the <code>bitbot</code> blocks will say so politely</p>
          )}
        </div>
      </div>

      {/* Its own log. The shared one at the bottom of the room still has
          every line from every robot; this one has only this robot's, which
          is the question the child in front of this card is asking. */}
      <div className="cardlog">
        {said.length === 0
          ? <div className="empty">this one has not said anything yet</div>
          : said.slice(-40).map(l => <div key={l.k} className={l.cls}>{l.msg}</div>)}
      </div>

    </div>
  );
}
