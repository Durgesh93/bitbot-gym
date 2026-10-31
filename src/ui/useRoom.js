/* The one place React meets the gym.

   React must not own the world. If a component held the robots, two
   components would eventually disagree about where one was, and that is
   exactly the class of bug this rebuild exists to stop. So: the room is
   created once, outside React, in a ref. The loop ticks it. Each frame the
   snapshot - plain data, nothing live in it - goes into one piece of state,
   and every component below renders from that.

   Which means a component can only ever do two things: read the snapshot it
   was given, and post a message. It has nothing to keep in sync. */

import { useEffect, useRef, useState, useCallback } from "react";
import { createRoom, ROOM } from "../app/room.js";
import { bus } from "../core/bus.js";
import { onSay } from "../core/log.js";

/* ONE GYM PER PAGE, and the room is a singleton because the bus is.

   createRoom() claims the "world" address, and two rooms on one bus is an
   error the bus is quite right to refuse. Hanging the room off a component
   ref looked fine and was not: any remount - a hot reload, a StrictMode
   double mount, an error boundary retry - built a second room before the
   first had let go of the address, and the gym died on "two things answer
   to world". A ref is for something each component owns a copy of, and
   there is only ever one world.

   import.meta.hot.data is the one thing Vite carries across a reload of
   THIS module, so the room survives editing the UI - which also means the
   robots stay where they were while you work on the card, and that is a
   nicer way to build than re-adding them after every save. */

const keep = (typeof import.meta !== "undefined" && import.meta.hot)
  ? (import.meta.hot.data.gym || (import.meta.hot.data.gym = {}))
  : {};

export function useRoom(options) {
  if (!keep.room) keep.room = createRoom({ bus, ...(options || {}) });
  const room = keep.room;

  const [snap, setSnap] = useState(() => room.snapshot());
  const [lines, setLines] = useState([]);
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState(true);
  const speedRef = useRef(1);
  speedRef.current = running ? speed : 0;

  /* One loop for the whole gym. A frame is 16 ms of real time; at 1x that
     is three ticks of 5 ms, and the speed selector simply buys more. */
  useEffect(() => {
    let alive = true, trouble = null;
    function frame() {
      if (!alive) return;
      try {
        const steps = Math.round(3 * speedRef.current);
        for (let i = 0; i < steps; i++) room.tick();
        setSnap(room.snapshot());
      } catch (e) {
        /* One bad frame must not end the loop. The single-file gym had no
           guard here: one throw killed the animation for good while
           everything still claimed to be running, and the only symptom was
           that Play quietly did nothing. */
        if (!trouble) { trouble = e; console.error(e); }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return () => { alive = false; };
  }, [room]);

  useEffect(() => onSay(line => {
    setLines(old => {
      const next = old.concat([{ ...line, k: Math.random() }]);
      return next.length > 200 ? next.slice(-200) : next;
    });
  }), []);

  /* A click is an intent, never a write. It lands on the next drain, which
     is between ticks - exactly where a child's hand lands. */
  const post = useCallback((msg, opts) => bus.post(ROOM, msg, opts), []);
  const ask = useCallback(msg => bus.send(ROOM, msg), []);

  return { room, snap, lines, post, ask, speed, setSpeed, running, setRunning,
           clearLines: () => setLines([]) };
}
