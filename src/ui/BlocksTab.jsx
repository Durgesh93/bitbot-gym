/* The real MakeCode editor, embedded.

   Not a picture of it and not a lookalike: makecode.microbit.org itself, in
   controller mode, with the Bit:Bot extension already a dependency so the
   micro:bit drawers AND the Bit:Bot drawer are both there. A child builds
   blocks exactly as they will in the lesson, then presses Transfer, which
   is the gym's version of dragging the .hex onto the board.

   The protocol is two messages. The editor asks the host what projects it
   has (`workspacesync`) and we hand it the one we want opened; it hands the
   whole project back every time it saves (`workspacesave`), and we keep the
   main.ts out of that.

   The echo is the subtle part. A save can arrive a second after a program
   was started, so only pressing Transfer puts a card back to "ready".
   Comparing the code will not do it - the editor tidies the text on the way
   through, so it never comes back quite as it went in. */

import React, { useEffect, useRef, useState } from "react";

const EDITOR_URL = "https://makecode.microbit.org/?controller=1&nocookiebanner=1";

export function starterProject(name) {
  const now = Math.round(Date.now() / 1000);
  const pxt = {
    name: name || "Bit:Bot Gym",
    description: "micro:bit and Bit:Bot XL blocks",
    dependencies: {
      core: "*", radio: "*", microphone: "*",
      /* this is the line that puts the Bit:Bot drawer in the toolbox */
      bitbot: "github:4tronix/BitBot#v2.1.9"
    },
    files: ["main.blocks", "main.ts"],
    preferredEditor: "blocksprj"
  };
  return {
    header: {
      id: "gym-" + (name || "start") + "-" + now, name: name || "Bit:Bot Gym",
      meta: {}, editor: "blocksprj", pubId: "", pubCurrent: false,
      target: "microbit", targetVersion: "9.0.12",
      recentUse: now, modificationTime: now, path: "bitbot-gym", isDeleted: false
    },
    text: {
      "main.blocks": '<xml xmlns="https://developers.google.com/blockly/xml">' +
                     '<block type="pxt-on-start" x="12" y="12"></block></xml>',
      "main.ts": "",
      "pxt.json": JSON.stringify(pxt, null, 4)
    }
  };
}

export default function BlocksTab({ boards, chosen, onChoose, onTransfer, projects, setProject }) {
  const frameRef = useRef(null);
  const [live, setLive] = useState(false);
  const [note, setNote] = useState("starting MakeCode - the first load takes a moment");
  const latest = useRef("");
  const tidied = useRef(false);
  const msgId = useRef(0);

  const send = (action, extra) => {
    const f = frameRef.current;
    if (!f || !f.contentWindow) return;
    f.contentWindow.postMessage(
      { type: "pxteditor", id: "gym-" + (++msgId.current), action, response: true, ...(extra || {}) }, "*");
  };

  useEffect(() => {
    function onMessage(ev) {
      const msg = ev.data;
      if (!msg || typeof msg !== "object" || msg.type !== "pxthost") return;

      if (msg.action === "workspacesync") {
        msg.projects = [projects[chosen] || starterProject("micro:bit " + chosen)];
        try { ev.source.postMessage(msg, "*"); } catch (e) { /* the editor went away */ }
        setLive(true);
        setNote("MakeCode is ready - build your blocks, then press Transfer");
        if (!tidied.current) {
          tidied.current = true;
          /* take back the space the simulator does not need, and make the
             blocks bigger: they are for nine year olds */
          setTimeout(() => { send("hidesimulator"); send("setscale", { scale: 1.35 }); }, 600);
        }
        return;
      }
      if (msg.action === "workspacesave" && msg.project) {
        const ts = (msg.project.text || {})["main.ts"];
        if (typeof ts === "string") latest.current = ts;
        setProject(chosen, msg.project);
        return;
      }
      if (msg.action === "workspacereset" || msg.action === "workspaceloaded") {
        try { ev.source.postMessage(msg, "*"); } catch (e) { /* ignore */ }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [chosen, projects, setProject]);

  /* Switching board shows that board's blocks. */
  useEffect(() => {
    if (live) send("importproject", { project: projects[chosen] || starterProject("micro:bit " + chosen) });
  }, [chosen]);                                     // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="blockstab">
      <div className="tools">
        <label className="inline">
          onto
          <select value={chosen} onChange={e => onChoose(Number(e.target.value))}>
            {boards.map(b => <option key={b.id} value={b.id}>micro:bit {b.id}</option>)}
          </select>
        </label>
        <button className="go" onClick={() => onTransfer(chosen, latest.current)}>
          Transfer to micro:bit {chosen}
        </button>
        <span className="hint">{note}</span>
      </div>
      <iframe ref={frameRef} title="MakeCode editor" src={EDITOR_URL}
              allow="usb; clipboard-read; clipboard-write" />
    </div>
  );
}
