/* The Code tab: paste JavaScript straight in.

   This is the one that works with no internet at all, which on a school
   Chromebook matters more than it sounds. The Blocks tab needs
   makecode.microbit.org; this needs nothing. A trainer with a flaky
   connection can still run the whole lesson from here, and the JavaScript
   MakeCode shows under its own "JavaScript" tab pastes in unchanged. */

import React, { useState } from "react";
/* The same programs the regression runs - see src/app/examples.js. A menu
   entry that no longer works would turn `npm test` red before a class
   found out, which is the whole reason they do not live in this file. */
import { EXAMPLES } from "../app/examples.js";

export default function CodeTab({ boards, chosen, onChoose, onTransfer, code, setCode }) {
  const [text, setText] = useState(code || "");

  return (
    <div className="codetab">
      <div className="tools">
        <label className="inline">
          onto
          <select value={chosen} onChange={e => onChoose(Number(e.target.value))}>
            {boards.map(b => <option key={b.id} value={b.id}>micro:bit {b.id}</option>)}
          </select>
        </label>
        <button className="go" onClick={() => { setCode(text); onTransfer(chosen, text); }}>
          Transfer to micro:bit {chosen}
        </button>
        <span className="sep" />
        <label className="inline">
          try one
          <select value="" onChange={e => { if (e.target.value) setText(EXAMPLES[e.target.value]); }}>
            <option value="">choose...</option>
            {Object.keys(EXAMPLES).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <span className="hint">this tab needs no internet</span>
      </div>
      <textarea value={text} spellCheck={false}
                onChange={e => setText(e.target.value)}
                placeholder={"Paste the JavaScript from MakeCode here.\n\n" +
                             "basic.showIcon(IconNames.Heart)\n" +
                             "bitbot.go(BBDirection.Forward, 50)"} />
    </div>
  );
}
