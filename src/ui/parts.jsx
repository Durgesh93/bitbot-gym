/* The readouts.

   A number on its own is useless to a nine year old. "eye L/R 574 / 526"
   tells a child nothing at all; two bars, one leaning further than the
   other, tells them everything before they have read a digit. So every
   reading in the gym gets a SHAPE, and the number sits beside it for the
   teacher and for the child who wants to know exactly.

   These are all pure: hand one a value, it draws. None of them remembers
   anything between renders, none of them knows where the value came from,
   and none of them can be out of date - the card re-renders from a fresh
   snapshot sixty times a second and these just redraw.

   The bars carry a 90 ms transition. That is not decoration: without it a
   value that jitters by one unit strobes horribly at 60 fps, and a child
   watching for "is it getting brighter?" cannot see the trend through the
   flicker. The NUMBER never eases - that one has to be honest to the
   millisecond, because it is what the block returns. */

import React from "react";

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const pct = v => (clamp01(v) * 100).toFixed(1) + "%";

/* ---- the micro:bit screen ------------------------------------------- */

/* Twenty five LEDs that look like LEDs: the dark ones still catch a little
   light, the lit ones bloom. Brightness is 0-255 per cell and the board
   really does set it per cell, so showIcon and setBrightness look different
   here, as they do on the desk. */
export function Screen({ cells, dim, small }) {
  const c = cells || new Array(25).fill(0);
  return (
    <div className={"scr" + (dim ? " dim" : "") + (small ? " sm" : "")}
         role="img" aria-label="the micro:bit screen">
      {c.map((v, i) => {
        const on = v > 0;
        const b = on ? 0.25 + 0.75 * (v / 255) : 0;
        return <span key={i} className={on ? "on" : ""}
                     style={on ? { opacity: b, boxShadow: `0 0 ${3 + 7 * b}px rgba(255,46,46,${b})` }
                               : undefined} />;
      })}
    </div>
  );
}

/* ---- a plain level: light, sound ------------------------------------ */

export function Meter({ label, value, max, tone, unit }) {
  const v = value == null ? 0 : value;
  return (
    <div className="meter">
      <span className="lab">{label}</span>
      <span className="track"><i className={tone ? "t-" + tone : ""} style={{ width: pct(v / max) }} /></span>
      <span className="num">{Math.round(v)}{unit || ""}</span>
    </div>
  );
}

/* ---- the magnetometer, in microtesla --------------------------------- */

/* NOT A LINEAR BAR. A magnet's field falls off as one over the distance
   CUBED, so this number runs from about 50 standing anywhere in the room
   to a couple of thousand with the board sat on top of a magnet. A bar
   that fitted the top of that range would show the Earth as one pixel,
   and a bar that fitted the Earth would be pinned the moment a magnet
   came out. So it is logarithmic, and it carries a tick where the Earth
   alone sits - which turns the readout into the actual lesson: am I
   above what the planet gives me, and by how much? */
const FLOOR = 10, CEIL = 4000;
const EARTH_UT = 50.5;
const logPct = v => {
  const c = Math.max(FLOOR, Math.min(CEIL, v || 0));
  return (Math.log(c / FLOOR) / Math.log(CEIL / FLOOR) * 100).toFixed(1) + "%";
};

export function Field({ uT }) {
  const v = uT == null ? 0 : uT;
  const strong = v > EARTH_UT * 1.25;
  return (
    <div className="meter">
      <span className="lab">magnet</span>
      <span className="track">
        <i className={strong ? "t-hot" : "t-cool"} style={{ width: logPct(v) }} />
        <u className="earth" style={{ left: logPct(EARTH_UT) }} />
      </span>
      <span className="num">{v >= 1000 ? Math.round(v) : v.toFixed(1)} µT</span>
    </div>
  );
}

/* ---- the two light eyes, as a balance -------------------------------- */

/* The one readout that earns its place. Both bars grow OUTWARD from the
   middle, so a robot looking straight at a lamp is symmetrical and a robot
   with a lamp off to its left is visibly lopsided. Every light-chasing
   program in the course is "turn towards the longer bar", and here that is
   not a metaphor - it is the picture. */
export function Eyes({ left, right }) {
  const L = (left || 0) / 1023, R = (right || 0) / 1023;
  /* A dead band, so the gold does not flicker from eye to eye on a robot
     facing the lamp square on. Below about 25 of 1023 the two eyes are
     telling the same story and neither should be declared the winner. */
  const lead = Math.abs(L - R) < 0.025 ? null : (L > R ? "l" : "r");
  return (
    <div className="eyes">
      <span className="lab">eyes</span>
      <span className="num l">{Math.round(left || 0)}</span>
      <span className="bal">
        <span className="half lh"><i className={lead === "l" ? "lead" : ""} style={{ width: pct(L) }} /></span>
        <span className="pin" />
        <span className="half rh"><i className={lead === "r" ? "lead" : ""} style={{ width: pct(R) }} /></span>
      </span>
      <span className="num r">{Math.round(right || 0)}</span>
    </div>
  );
}

/* ---- the sonar ------------------------------------------------------- */

/* Two metres of room, drawn. The marker sits where the wall is, and goes
   amber inside 30 cm and red inside 15, because "stop before you hit it" is
   the whole of the obstacle lesson. Zero is not a distance of zero - the
   real sensor reports 0 when nothing came back at all - so it says so in
   words rather than drawing a wall pressed against the robot's nose. */
export function Sonar({ cm }) {
  const clear = !cm;
  const near = clamp01(cm / 200);
  const tone = clear ? "" : cm < 15 ? " red" : cm < 30 ? " amber" : "";
  return (
    <div className={"sonar" + tone}>
      <span className="lab">sonar</span>
      <span className="beam">
        {!clear && <i className="fill" style={{ width: pct(near) }} />}
        {!clear && <b className="wall" style={{ left: pct(near) }} />}
      </span>
      <span className="num">{clear ? "clear" : cm + " cm"}</span>
    </div>
  );
}

/* ---- the two line sensors -------------------------------------------- */

/* Looking up at the robot's belly: two eyes on the floor, lit when they are
   over something dark. A child following a line watches these two and
   nothing else. */
export function Line({ left, right }) {
  return (
    <div className="line">
      <span className="lab">line</span>
      <span className="pads">
        <i className={left ? "dark" : ""} title="left line sensor" />
        <i className={right ? "dark" : ""} title="right line sensor" />
      </span>
      <span className="num">{left || right ? (left && right ? "both" : left ? "left" : "right") : "pale"}</span>
    </div>
  );
}

/* ---- the compass ----------------------------------------------------- */

/* A strip of compass rather than a dial.

   A 34 px dial in a row this wide is a lost little thing you have to lean
   in to read, and the row's whole middle is empty behind it. A tape uses
   the width it has been given, the letters stay upright so they are
   readable from the back of the room, and turning the robot slides them
   past a fixed marker - which is the right story anyway: the compass is
   still and the robot turns.

   Each mark is placed at its angle RELATIVE to where the robot is facing,
   wrapped into -180..180, so they come round for ever and none of them
   needs a special case at north. They are not eased, because a mark
   wrapping from one edge to the other would otherwise sail across the
   whole strip; the fade at both ends hides the jump instead. */

const MARKS = [["N", 0], ["NE", 45], ["E", 90], ["SE", 135],
               ["S", 180], ["SW", 225], ["W", 270], ["NW", 315]];
const SPAN = 180;                                   // degrees visible end to end

export function Compass({ heading }) {
  const h = heading || 0;
  return (
    <div className="dial">
      <span className="lab">facing</span>
      <span className="tape" aria-label={"facing " + Math.round(h) + " degrees"}>
        {MARKS.map(([name, deg]) => {
          const rel = ((deg - h + 540) % 360) - 180;
          if (Math.abs(rel) > SPAN / 2) return null;
          return (
            <b key={name} className={deg % 90 ? "minor" : ""}
               style={{ left: (50 + (rel / SPAN) * 100) + "%" }}>{name}</b>
          );
        })}
        <i className="here" />
      </span>
      <span className="num">{Math.round(h)}&deg;</span>
    </div>
  );
}

/* ---- the FireLeds ---------------------------------------------------- */

/* Twelve of them, six down each arm, front of the robot at the top - laid
   out the way they sit on the chassis so a child can match what is on the
   screen to what is on the desk. */
export function Pixels({ pixels }) {
  const p = pixels || [];
  const arm = (from, to) => (
    <span className="arm">
      {p.slice(from, to).map((c, i) => (
        <i key={i} style={c ? { background: c, boxShadow: "0 0 7px " + c, borderColor: c } : undefined} />
      ))}
    </span>
  );
  return (
    <div className="pix">
      <span className="lab">arms</span>
      {arm(0, 6)}
      <span className="gap" />
      {arm(6, 12)}
    </div>
  );
}

/* ---- the state pill -------------------------------------------------- */

const WORD = { ready: "ready", run: "running", wait: "waiting", end: "finished", stop: "stopped" };

export function Pill({ state }) {
  return <span className="st" data-st={state}>{WORD[state] || state}</span>;
}
