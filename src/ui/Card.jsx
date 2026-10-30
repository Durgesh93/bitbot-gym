/* One board's card: the thing a child actually works in.

   Everything on it comes out of `body`, which is one entry of the snapshot.
   The card holds no state of its own - not the screen, not the sensor
   numbers, not whether the program is running. It cannot drift, because
   there is nothing of its own to drift from.

   Two halves, with a rule between them: on top what the micro:bit feels,
   underneath what the robot feels. A child learning that the board is the
   brain and the chassis is the body can see it in the card. */

import React from "react";

const STATE_WORD = {
  ready: "ready", run: "running", wait: "waiting", end: "finished", stop: "stopped"
};

function Screen({ cells }) {
  return (
    <div className="scr" aria-label="the micro:bit screen">
      {(cells || new Array(25).fill(0)).map((v, i) => (
        <span key={i} className={v > 0 ? "on" : ""}
              style={v > 0 ? { opacity: 0.35 + 0.65 * (v / 255) } : undefined} />
      ))}
    </div>
  );
}

function Arm({ pixels, from, to, label }) {
  return (
    <div>
      <b>{label}</b>
      {pixels.slice(from, to).map((c, i) => (
        <i key={i} style={c ? { background: c, boxShadow: "0 0 5px " + c } : undefined} />
      ))}
    </div>
  );
}

function Row({ k, v }) {
  return <tr><td className="k">{k}</td><td className="v">{v}</td></tr>;
}

/* Three digits wide, always, so a column of numbers does not jump about
   while a robot drives. */
const n3 = v => String(v == null ? 0 : v).padStart(3, " ");

export default function Card({ body, post }) {
  const p = body.program || {};
  const r = body.reads || {};
  const state = p.state || "ready";
  const cls = state === "run" ? "live" : state === "stop" ? "off" : "";

  const send = msg => post({ ...msg, id: body.id });
  const hold = (button) => ({
    onPointerDown: () => send({ cmd: "press", button, down: true }),
    onPointerUp: () => send({ cmd: "press", button, down: false }),
    onPointerLeave: () => send({ cmd: "press", button, down: false })
  });

  return (
    <div className={"card " + cls}>
      <div className="top">
        <b>micro:bit {body.id}</b>
        <span className="st" data-st={state}>{STATE_WORD[state]}</span>
        <span className="ctime">{((p.stopwatch || 0) / 1000).toFixed(1)}s</span>
        <span className="where">{p.plugged ? "Bit:Bot " + (p.model || "XL") : "in hand"}</span>
      </div>

      <div className="run">
        <button className="go" onClick={() => send({ cmd: "run" })}>Play</button>
        <button onClick={() => send({ cmd: "stop" })}>Stop</button>
        <button onClick={() => send({ cmd: "reset" })}>Reset</button>
      </div>

      <div className="sect">micro:bit</div>
      <div className="body">
        <Screen cells={body.screen} />
        <table>
          <tbody>
            <Row k="light" v={n3(r.light)} />
            <Row k="sound" v={n3(r.sound)} />
            <Row k="compass" v={n3(r.compass) + "°"} />
            <Row k="waiting on" v={p.armed ? p.armed + " handler(s)" : "-"} />
          </tbody>
        </table>
      </div>

      <div className="press">
        <button {...hold("A")}>A</button>
        <button {...hold("B")}>B</button>
        <button {...hold("logo")}>logo</button>
        <button onClick={() => send({ cmd: "gesture", name: "shake" })}>shake</button>
      </div>

      {p.plugged && (
        <>
          <div className="sect bot">Bit:Bot</div>
          <table>
            <tbody>
              <Row k="eye L / R" v={n3(r.lightL) + " / " + n3(r.lightR)} />
              <Row k="line L / R" v={r.lineL + " / " + r.lineR} />
              <Row k="sonar" v={r.sonar ? r.sonar + " cm" : "nothing in range"} />
            </tbody>
          </table>
          <div className="arms">
            <Arm pixels={p.pixels || []} from={0} to={6} label="L" />
            <Arm pixels={p.pixels || []} from={6} to={12} label="R" />
          </div>
        </>
      )}

      <div className="press">
        <button onClick={() => send({ cmd: "plug", on: !p.plugged })}>
          {p.plugged ? "take off the Bit:Bot" : "put it on a Bit:Bot"}
        </button>
        <button onClick={() => send({ cmd: "remove" })}>remove</button>
      </div>
    </div>
  );
}
