/* Reading a .hex back into a project.

   A MakeCode .hex is a firmware image, but it carries the project that
   built it along inside: records of type 0x0E hold a small JSON header and
   then every file of the project - main.blocks, main.ts, pxt.json - LZMA
   compressed. That is what lets you drop a .hex back onto the editor and
   get your blocks, and it is the whole reason the course's build pipeline
   goes to the trouble of setting embedMeta and embedBlob.

   So a lesson's .hex is not a dead end here. The teacher opens
   `W38L02P3.Breathing Heart.hex`, and the gym both puts the blocks in front
   of the class AND loads the program onto a board so it can be run.

   THE DECODER IS BUNDLED, NOT FETCHED. The old gym pulled lzma-d off a CDN
   the first time a .hex was opened, and said so in the error when it could
   not. That is eight kilobytes being downloaded in a classroom whose wifi
   is the least reliable thing in the room, at the exact moment the lesson
   starts. It is now part of the gym.

   Everything in here throws plain Error with a message meant to be read
   out loud, because every one of these failures is something a teacher can
   actually act on: wrong file, old file, file built without its source. */

import lzma from "../vendor/lzma-d.js";

/* The drawers the gym actually simulates. Anything else a program depends
   on will decompile and display, and then do nothing when it runs, so it
   is worth a word rather than a silence. */
export const SIMULATED = ["core", "radio", "microphone", "bitbot"];

/* Pull the type 0x0E records out of the Intel hex and glue their payloads
   together. Everything else in the file is the firmware, which is of no
   interest to us - we are not flashing anything. */
export function embeddedBytes(buf) {
  const text = new TextDecoder("latin1").decode(buf);
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (line[0] !== ":") continue;
    const n = parseInt(line.substr(1, 2), 16);
    if (parseInt(line.substr(7, 2), 16) !== 0x0E) continue;   // 0x0E = embedded source
    for (let i = 0; i < n; i++) out.push(parseInt(line.substr(9 + i * 2, 2), 16));
  }
  return new Uint8Array(out);
}

/* The header is plain JSON sitting in front of the compressed blob, so it
   can be read without unpacking anything. It is how we know where the
   project text starts and stops once it IS unpacked. */
export function headerIn(bytes) {
  const asText = new TextDecoder("latin1").decode(bytes);
  const i = asText.indexOf('{"compression"');
  if (i < 0)
    throw new Error("there is no project inside that .hex - it was not built to be reopened");
  const j = asText.indexOf("}", i) + 1;
  let meta;
  try { meta = JSON.parse(asText.slice(i, j)); }
  catch (e) { throw new Error("the project header in that .hex is damaged"); }
  return { meta, blob: bytes.slice(j) };
}

function unpack(blob) {
  return new Promise((res, rej) =>
    lzma.decompress(blob, (result, err) =>
      err ? rej(new Error("could not unpack the project inside that .hex")) : res(result)));
}

/* buf: the whole .hex as an ArrayBuffer. fileName is only used to name the
   project when the hex does not name itself. */
export async function readHex(buf, fileName) {
  const { meta, blob } = headerIn(embeddedBytes(buf));
  const raw = await unpack(blob);
  /* MakeCode counts headerSize and textSize in UTF-16 units, which is what
     a JavaScript string counts in too, so the slice below is in the same
     units the numbers were written in. */
  const txt = typeof raw === "string" ? raw
                                      : new TextDecoder("utf-8").decode(new Uint8Array(raw));
  let files;
  try { files = JSON.parse(txt.slice(meta.headerSize, meta.headerSize + meta.textSize)); }
  catch (e) { throw new Error("the project inside that .hex did not read back cleanly"); }

  const ts = files["main.ts"];
  if (typeof ts !== "string")
    throw new Error("that project has no main.ts in it, so there is nothing to run");

  /* Anything bolted on that the gym has never heard of. Not an error: the
     blocks will still show, they just will not do anything when run, and
     being told that beats watching a robot sit still. */
  let extras = [];
  try {
    const deps = JSON.parse(files["pxt.json"] || "{}").dependencies || {};
    extras = Object.keys(deps).filter(d => SIMULATED.indexOf(d) < 0);
  } catch (e) { /* no pxt.json, never mind */ }

  const name = meta.name || String(fileName || "").replace(/\.hex$/i, "") || "a .hex";
  const now = Math.round(Date.now() / 1000);
  /* Shaped exactly like what the editor hands back on a save, because it
     goes straight back in through `importproject`. */
  const project = {
    header: { id: "hex-" + now, name, meta: {}, editor: "blocksprj",
              pubId: "", pubCurrent: false, target: meta.pxtTarget || "microbit",
              targetVersion: meta.eVER || "9.0.12", recentUse: now,
              modificationTime: now, path: "hex-" + now, isDeleted: false },
    text: files
  };
  return { name, files, ts, extras, project };
}
