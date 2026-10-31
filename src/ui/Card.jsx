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

import React from "react";
import { Screen, Meter, Eyes, Sonar, Line, Compass, Pixels, Pill } from "./parts.jsx";

export default function Card({ body, post, compact, onToggle }) {
  const p = body.program || {};
  const r = body.reads || {};
  const state = p.state || "ready";
  const cls = state === "run" ? "live" : state === "stop" ? "off" : state === "wait" ? "hold" : "";

  const send = msg => post({ ...msg, id: body.id });
  const hold = (button) => ({
    onPointerDown: () => send({ cmd: "press", button, down: true }),
    onPointerUp: () => send({ cmd: "press", button, down: false }),
    onPointerLeave: () => send({ cmd: "press", button, down: false })
  });

  const head = (
    <div className="top">
      <b>micro:bit {body.id}</b>
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
        <div className="run">
          <button className="go" onClick={() => send({ cmd: "run" })}>Play</button>
          <button onClick={() => send({ cmd: "stop" })}>Stop</button>
        </div>
      </div>
    );
  }

  return (
    <div className={"card " + cls}>
      {head}

      <div className="run">
        <button className="go" onClick={() => send({ cmd: "run" })}>Play</button>
        <button onClick={() => send({ cmd: "stop" })}>Stop</button>
        <button onClick={() => send({ cmd: "reset" })}>Reset</button>
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

      <div className="press last">
        <button onClick={() => send({ cmd: "plug", on: !p.plugged })}>
          {p.plugged ? "take off the Bit:Bot" : "put it on a Bit:Bot"}
        </button>
        <button className="quiet" onClick={() => send({ cmd: "remove" })}>remove</button>
      </div>
    </div>
  );
}
