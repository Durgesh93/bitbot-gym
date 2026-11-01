/* The real MakeCode editor, embedded, over the whole window.

   IT IS OPENED FROM A ROBOT'S CARD and it transfers back to that robot. A
   page of its own, with a dropdown on it asking which board you meant, put
   the question in the wrong place: by the time a child is looking at
   blocks they have long since decided whose blocks these are. Press Code
   on a card, build, press Transfer, and you are back in the room watching
   it. The arrow at the edge opens it too, for the board already chosen.

   It is never unmounted, only hidden. MakeCode takes a few seconds to load
   and reloading it every time a card is pressed would make the button feel
   broken.

   Not a picture of it and not a lookalike: makecode.microbit.org itself, in
   controller mode, with the Bit:Bot extension already a dependency so the
   micro:bit drawers AND the Bit:Bot drawer are both there. A child builds
   blocks exactly as they will in the lesson, then presses Transfer, which
   is the gym's version of dragging the .hex onto the board.

   The protocol is three messages, and the third is the one that matters.
   The editor asks the host what projects it has (`workspacesync`) and we
   hand it the one to open; it hands the whole project back every time it
   saves (`workspacesave`), and we keep the main.ts out of that.

   But it only saves when the child changes something. Pressing Transfer on
   a project the editor has not happened to save yet would read an empty
   string, and the board would sit there saying "nothing on this one yet" -
   which is exactly the bug this had. So Transfer ASKS: it sends
   `saveproject`, waits for the `workspacesave` that comes back, and
   transfers that. Four seconds, then it gives up and says so out loud,
   because a Transfer that quietly does nothing is the worst thing this
   screen can do to a nine year old.

   The echo is the subtle part. A save can arrive a second after a program
   was started, so only pressing Transfer puts a card back to "ready".
   Comparing the code will not do it - the editor tidies the text on the way
   through, so it never comes back quite as it went in. */

import React, { useEffect, useRef, useState } from "react";
import { say } from "../core/log.js";
import { readHex } from "../app/hexfile.js";

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

export default function BlocksTab({ boards, chosen, onChoose, onTransfer, projects, setProject,
                                    open, onClose }) {
  const frameRef = useRef(null);
  /* THE EDITOR IS NOT BUILT UNTIL IT IS FIRST OPENED, and then it is kept.

     The old gym made the iframe the first time the Blocks tab was shown,
     and that was not laziness, it was the thing that made it work. Blockly
     measures its workspace once at startup and caches it: start it inside
     a box that is hidden or has no size and every drag afterwards is
     worked out against nonsense - you pick up a block and the whole canvas
     moves instead. Built on first open, it starts up in a real, visible,
     full-sized box, and after that the sheet only ever parks off to the
     side, so the size it measured stays true. */
  /* The board a transfer is travelling to right now, or null. It is the
     whole of the cable animation's state. */
  const [wiring, setWiring] = useState(null);
  const [started, setStarted] = useState(false);
  const fileRef = useRef(null);            // the hidden file picker behind Open a .hex
  const [dropping, setDropping] = useState(false);
  useEffect(() => { if (open) setStarted(true); }, [open]);
  const [live, setLive] = useState(false);
  const [note, setNote] = useState("starting MakeCode - the first load takes a moment");
  const latest = useRef("");
  const pending = useRef(null);        // a Transfer waiting for the editor to save
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
        /* somebody is waiting on this one */
        if (pending.current) { const done = pending.current; pending.current = null; done(ts); }
        return;
      }
      if (msg.action === "workspacereset" || msg.action === "workspaceloaded") {
        try { ev.source.postMessage(msg, "*"); } catch (e) { /* ignore */ }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [chosen, projects, setProject]);

  /* Escape is the way out of anything that covers the screen, and people
     try it before they look for a button. */
  useEffect(() => {
    if (!open || !onClose) return;
    const esc = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);

  /* A fresh sheet says what to do next, not what happened last time. The
     note is the only thing in here that remembers, and "transferred -
     press Play" left over from ten minutes ago is a lie about this one. */
  useEffect(() => {
    if (open) setNote(live ? "build your blocks, then press Transfer"
                           : "starting MakeCode - the first load takes a moment");
  }, [open]);                                       // eslint-disable-line react-hooks/exhaustive-deps

  /* Switching board shows that board's blocks. */
  useEffect(() => {
    if (live) send("importproject", { project: projects[chosen] || starterProject("micro:bit " + chosen) });
  }, [chosen]);                                     // eslint-disable-line react-hooks/exhaustive-deps

  /* OPENING A .HEX GOES BOTH WAYS AT ONCE. A lesson's hex carries its own
     source inside it, so the teacher opening `W38L02P3.Breathing Heart.hex`
     should get the blocks up on the board AND a program loaded on the
     robot, without anybody pressing Transfer in between. Doing only the
     first is a slideshow; doing only the second hides the lesson. */
  async function openHexFile(file) {
    if (!file) return;
    setNote("opening " + file.name + "\u2026");
    let out;
    try { out = await readHex(await file.arrayBuffer(), file.name); }
    catch (e) {
      /* every one of these is something a teacher can act on, so it is
         said out loud as well as written on the sheet */
      setNote(e.message);
      say(e.message, "err");
      return;
    }

    setProject(chosen, out.project);
    if (live) {
      send("importproject", { project: out.project });
      /* AND TIDY UP AFTER IT. Importing a project puts the editor back to
         its defaults, so MakeCode's own little simulator comes back and
         the blocks go back to their ordinary size - undoing the two things
         done at startup. The gym has a whole room to be the simulator; a
         second one in the corner of the editor is just a thing for a child
         to point at and ask about. */
      setTimeout(() => { send("hidesimulator"); send("setscale", { scale: 1.35 }); }, 400);
    }
    else setStarted(true);           // no editor yet: workspacesync will pick it up

    if (here) {
      onTransfer(chosen, out.ts);
      setNote("opened \u201c" + out.name + "\u201d - the blocks are here and it is on "
              + name + ", press Play");
      say("opened \u201c" + out.name + "\u201d onto " + name, "say");
    } else {
      setNote("opened \u201c" + out.name + "\u201d - add a board in the room to run it on");
    }

    if (out.extras.length)
      say("note: this program also uses " + out.extras.join(", ")
          + " - those blocks will show, but the gym does not simulate them", "say");
  }

  /* Ask the editor for the blocks as they stand, then hand them over. */
  async function transferNow() {
    if (!here || wiring) return;
    /* THE CABLE. Pressing Transfer and having the screen simply change is
       the moment a child stops believing anything happened - on a real
       Bit:Bot there is a lead, a light and a wait. So the program is shown
       travelling down a wire to the board by name.

       And it is held for most of a second EVEN IF THE EDITOR ANSWERS AT
       once, which is the old gym's trick and worth keeping: an animation
       too quick to see is not an animation, it is a flicker. */
    setWiring(name);
    const began = Date.now();
    const ts = await new Promise(res => {
      pending.current = res;
      send("saveproject");
      setTimeout(() => { if (pending.current === res) { pending.current = null; res(null); } }, 4000);
    });
    await new Promise(r => setTimeout(r, Math.max(0, 900 - (Date.now() - began))));
    setWiring(null);

    const code = (typeof ts === "string" && ts.trim()) ? ts : latest.current;
    if (!code || !code.trim()) {
      setNote("MakeCode sent nothing back - put a block in first, then press Transfer");
      say("nothing came back from the editor - put a block under `on start`, " +
          "then press Transfer again", "err");
      return;
    }
    setNote("transferred - press Play on its card");
    onTransfer(chosen, code);
    /* AND GET OUT OF THE WAY. Transfer is the end of the job in here: the
       child wants to watch the robot, and leaving a full-screen editor
       over the room so they have to find a close button is a step with no
       purpose. */
    if (onClose) onClose();
  }

  /* NOTHING TO TRANSFER TO IS NOT A THING TO HIDE AND IT IS NOT A THING TO
     LET SOMEBODY PRESS. An empty room means the Transfer button would name
     a board that is not there, and a child would press it and be told off
     by a message. Grey it out and say where boards come from instead. */
  const here = boards.find(b => b.id === chosen);
  const name = (here && here.program && here.program.name) || ("micro:bit " + chosen);

  return (
    <div className={"blockstab" + (open ? " open" : "") + (dropping ? " dropping" : "")}
         aria-hidden={open ? undefined : "true"}
         /* A .HEX DROPPED ANYWHERE ON THE SHEET OPENS. It is what everyone
            tries first, having spent the last year dragging these onto a
            MICROBIT drive, and the file picker is still there for anyone
            who does not. */
         onDragOver={e => { e.preventDefault(); setDropping(true); }}
         onDragLeave={e => { if (e.currentTarget === e.target) setDropping(false); }}
         onDrop={e => {
           const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
           if (!f) return;
           e.preventDefault(); setDropping(false);
           if (/\.hex$/i.test(f.name)) openHexFile(f);
           else { setNote("that is not a .hex"); say("that is not a .hex", "err"); }
         }}>
      <div className="tools">
        {/* IT SAYS WHERE IT GOES. This was a bare arrow glyph and the first
            person to use the sheet had to ask how to get out of it, which
            is the whole answer about unlabelled icons. */}
        <button className="shut" onClick={onClose}>{"\u203a"} the room</button>
        {/* ONE BUTTON. The sheet was opened from a robot's card, so whose
            blocks these are was settled before MakeCode even appeared; a
            dropdown asking again is a second chance to send the program to
            the wrong robot. The button says the name so there is no doubt
            which one it is going to. */}
        <button className="go" onClick={transferNow} disabled={!here || !!wiring}>
          {here ? "Transfer to " + name : "Transfer"}
        </button>
        {/* THE OTHER DIRECTION. Transfer sends blocks out to a robot; this
            brings a lesson's .hex back in. A MakeCode hex carries its own
            source, so every file in the course folder opens here as the
            blocks that built it - which is the only way a child who was
            away last week can see what the class made. The editor's own
            Import button is not there: it is in controller mode, which
            hides the home screen, so this is the only door. */}
        <button className="hex" onClick={() => fileRef.current && fileRef.current.click()}>
          Open a .hex
        </button>
        <input ref={fileRef} type="file" accept=".hex" hidden
               onChange={e => {
                 const f = e.target.files && e.target.files[0];
                 if (f) openHexFile(f);
                 /* cleared so that opening the SAME file twice still fires;
                    a teacher who has just rebuilt a hex will do exactly
                    that, and nothing happening looks like a broken button */
                 e.target.value = "";
               }} />
        <span className="hint">
          {here ? note : note.startsWith("opened") ? note
                       : "add a micro:bit or a Bit:Bot in the room first"}
        </span>
      </div>
      {wiring && (
        <div className="wire" role="status">
          <i /><b>transferring to {wiring}{"\u2026"}</b>
        </div>
      )}

      {started
        ? <iframe ref={frameRef} title="MakeCode editor" src={EDITOR_URL}
                  allow="usb; clipboard-read; clipboard-write" />
        : <div className="warming" />}
    </div>
  );
}
