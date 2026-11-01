/* Reading a .hex back into a project.

   The fixtures are built here rather than checked in, because a real
   MakeCode .hex is most of a megabyte of firmware wrapped around a few
   kilobytes of project, and the firmware is the part we throw away. What
   is built here is the part that matters: the type 0x0E records, the JSON
   header, the LZMA blob. If the reader can take those apart it can take a
   real one apart, and there is a test at the bottom that checks exactly
   that against the course's own hex files when they are to hand. */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import lzma from "lzma";
import { readHex, embeddedBytes, headerIn } from "../../src/app/hexfile.js";

/* Lay bytes out as Intel hex records of the given type, 16 to a line, the
   way the MakeCode build writes the embedded project out. */
function records(bytes, type) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    let line = ":" + chunk.length.toString(16).padStart(2, "0").toUpperCase() +
               "0000" + type.toString(16).padStart(2, "0").toUpperCase();
    for (const b of chunk) line += b.toString(16).padStart(2, "0").toUpperCase();
    out += line + "00\n";                    // the checksum; nothing here reads it
  }
  return out;
}

function compress(str) {
  return new Promise((res, rej) =>
    lzma.compress(str, 1, (r, e) => e ? rej(e) : res(new Uint8Array(r.map(b => b & 0xff)))));
}

/* A whole .hex, with a little pretend firmware around the project so the
   reader has something to ignore. */
async function buildHex(files, name) {
  const text = JSON.stringify(files);
  const header = JSON.stringify({ name, comment: "", status: "unpublished" });
  const blob = await compress(header + text);
  const meta = JSON.stringify({ compression: "LZMA", headerSize: header.length,
                                textSize: text.length, name,
                                eURL: "https://makecode.microbit.org/",
                                eVER: "9.0.12", pxtTarget: "microbit" });
  const bytes = new Uint8Array(meta.length + blob.length);
  for (let i = 0; i < meta.length; i++) bytes[i] = meta.charCodeAt(i);
  bytes.set(blob, meta.length);
  const firmware = records(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 0x00);
  const hex = ":020000040000FA\n" + firmware + records(bytes, 0x0E) + ":00000001FF\n";
  const buf = new ArrayBuffer(hex.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < hex.length; i++) view[i] = hex.charCodeAt(i);
  return buf;
}

const PROJECT = {
  "main.blocks": '<xml xmlns="https://developers.google.com/blockly/xml">' +
                 '<block type="pxt-on-start" x="12" y="12"></block></xml>',
  "main.ts": "basic.showIcon(IconNames.Heart)\n",
  "pxt.json": JSON.stringify({ name: "W38L02P3.Breathing Heart",
                               dependencies: { core: "*", radio: "*", microphone: "*" } })
};

describe("opening a .hex", () => {
  it("gets the whole project back out of one", async () => {
    const buf = await buildHex(PROJECT, "W38L02P3.Breathing Heart");
    const out = await readHex(buf, "whatever.hex");
    expect(out.name).toBe("W38L02P3.Breathing Heart");
    expect(Object.keys(out.files).sort()).toEqual(["main.blocks", "main.ts", "pxt.json"]);
    expect(out.ts).toBe("basic.showIcon(IconNames.Heart)\n");
    expect(out.extras).toEqual([]);
  });

  it("hands back a project the editor will take", async () => {
    /* it goes straight back in through `importproject`, so it has to be
       shaped like what the editor hands out on a save */
    const buf = await buildHex(PROJECT, "Breathing Heart");
    const { project } = await readHex(buf, "x.hex");
    expect(project.header.editor).toBe("blocksprj");
    expect(project.header.target).toBe("microbit");
    expect(project.header.name).toBe("Breathing Heart");
    expect(project.text["main.blocks"]).toContain("pxt-on-start");
  });

  it("walks past the firmware and reads only the project records", async () => {
    const buf = await buildHex(PROJECT, "x");
    const bytes = embeddedBytes(buf);
    /* the 1..8 written as type 0x00 above must not be in here */
    expect(new TextDecoder("latin1").decode(bytes)).toMatch(/^\{"compression"/);
    expect(headerIn(bytes).meta.compression).toBe("LZMA");
  });

  it("names an extension the gym does not simulate", async () => {
    const files = { ...PROJECT, "pxt.json": JSON.stringify({
      name: "Servo Thing",
      dependencies: { core: "*", bitbot: "*", servo: "*", neopixel: "*" } }) };
    const out = await readHex(await buildHex(files, "Servo Thing"), "x.hex");
    expect(out.extras.sort()).toEqual(["neopixel", "servo"]);
  });

  /* The three failures a teacher can actually hit, each said in words they
     can do something about. */
  it("says so when the .hex has no project in it", async () => {
    const hex = ":020000040000FA\n" + records(new Uint8Array([1, 2, 3]), 0x00) + ":00000001FF\n";
    const buf = new Uint8Array([...hex].map(c => c.charCodeAt(0))).buffer;
    await expect(readHex(buf, "firmware.hex")).rejects
      .toThrow(/not built to be reopened/);
  });

  it("says so when the thing is not a .hex at all", async () => {
    const buf = new TextEncoder().encode("this is a pdf, honestly").buffer;
    await expect(readHex(buf, "notes.pdf")).rejects.toThrow(/no project inside/);
  });

  it("says so when there is no main.ts to run", async () => {
    const files = { "main.blocks": "<xml/>", "pxt.json": "{}" };
    await expect(readHex(await buildHex(files, "Empty"), "x.hex")).rejects
      .toThrow(/nothing to run/);
  });
});

/* The course's own hex files, when this is running on the teacher's
   machine. Not skipped quietly on purpose - a pipeline change that breaks
   reopening would show up here first, and these are the exact files it
   has to work on. */
const COURSE = "/Users/skatiy/Library/CloudStorage/GoogleDrive-durgesh080793@gmail.com/" +
  ".shortcut-targets-by-id/1rIVEstquWcKsySJxmMUILC3NJGuHWCzc/Microbit Programming/" +
  "microbit_lessons_2026_Durgesh";

describe.skipIf(!existsSync(COURSE))("the course's real hex files", () => {
  const weeks = existsSync(COURSE)
    ? readdirSync(COURSE).filter(d => /^W\d\d-/.test(d)).sort() : [];

  it("opens every hex in every week folder", async () => {
    let seen = 0;
    for (const w of weeks) {
      for (const f of readdirSync(join(COURSE, w)).filter(f => f.endsWith(".hex"))) {
        const b = readFileSync(join(COURSE, w, f));
        const out = await readHex(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), f);
        expect(out.ts.length, f + " has no code in it").toBeGreaterThan(0);
        expect(out.files["main.blocks"], f + " has no blocks in it").toBeTruthy();
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  }, 30000);
});
