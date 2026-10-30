/* ========================================================================
   12. Opening a .hex. A MakeCode hex carries the project inside it: records
       of type 0x0E hold a little JSON header and then the whole project,
       LZMA compressed. Browsers cannot do LZMA, so the decoder is fetched
       the first time - that one step needs the internet.
   ======================================================================== */
let lzmaReady = null;
function loadLZMA() {
  if (lzmaReady) return lzmaReady;
  lzmaReady = new Promise((res, rej) => {
    if (window.LZMA) return res(window.LZMA);
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/lzma@2.3.2/src/lzma-d-min.js";
    sc.onload = () => window.LZMA ? res(window.LZMA) : rej(new Error("the unpacker did not start"));
    sc.onerror = () => rej(new Error("could not fetch the unpacker - opening a .hex needs the internet the first time"));
    document.head.appendChild(sc);
  });
  return lzmaReady;
}

function embeddedBytes(buf) {
  const text = new TextDecoder("latin1").decode(buf);
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (line[0] !== ":") continue;
    const n = parseInt(line.substr(1, 2), 16);
    if (parseInt(line.substr(7, 2), 16) !== 0x0E) continue;     // 0x0E = the embedded project
    for (let i = 0; i < n; i++) out.push(parseInt(line.substr(9 + i * 2, 2), 16));
  }
  return new Uint8Array(out);
}

async function openHex(file) {
  say("opening " + file.name, "say");
  let LZMA;
  try { LZMA = await loadLZMA(); }
  catch (e) { say(e.message, "err"); return; }

  const bytes = embeddedBytes(await file.arrayBuffer());
  const asText = new TextDecoder("latin1").decode(bytes);
  const i = asText.indexOf('{"compression"');
  if (i < 0) { say("there is no project inside that .hex - it was not built to be reopened", "err"); return; }
  const j = asText.indexOf("}", i) + 1;
  let meta;
  try { meta = JSON.parse(asText.slice(i, j)); }
  catch (e) { say("the project header in that .hex is damaged", "err"); return; }

  const blob = bytes.slice(j);
  let raw;
  try {
    raw = await new Promise((res, rej) =>
      LZMA.decompress(blob, (result, err) => err ? rej(err) : res(result)));
  } catch (e) { say("could not unpack the project: " + e, "err"); return; }

  // MakeCode counts the header and text in UTF-16 units, which is what a JS string counts in too
  const txt = typeof raw === "string" ? raw : new TextDecoder("utf-8").decode(new Uint8Array(raw));
  let files;
  try { files = JSON.parse(txt.slice(meta.headerSize, meta.headerSize + meta.textSize)); }
  catch (e) { say("the project inside that .hex did not read back cleanly", "err"); return; }

  const ts = files["main.ts"];
  if (typeof ts !== "string") { say("that project has no main.ts to run", "err"); return; }
  const target = mbit();
  target.code = ts;
  target.state = "ready"; target.runFrom = null; target.runFor = 0;
  say("loaded \"" + (meta.name || file.name) + "\" onto " + target.name, "say", target);

  // warn about anything bolted on that the gym has never heard of
  try {
    const deps = JSON.parse(files["pxt.json"] || "{}").dependencies || {};
    const known = ["core", "radio", "microphone", "bitbot"];
    const extra = Object.keys(deps).filter(d => known.indexOf(d) < 0);
    if (extra.length) say("note: this program also uses " + extra.join(", ") + " - those blocks are not simulated", "say");
  } catch (e) { /* no pxt.json, never mind */ }

  // and the blocks go in front of the teacher, starting the editor if it is not up yet
  const now = Math.round(Date.now() / 1000);
  const project = {
    header: { id: "hex-" + now, name: meta.name || file.name.replace(/\.hex$/i, ""), meta: {},
              editor: "blocksprj", pubId: "", pubCurrent: false, target: meta.pxtTarget || "microbit",
              targetVersion: meta.eVER || "9.0.12", recentUse: now, modificationTime: now,
              path: "hex-" + now, isDeleted: false },
    text: files
  };
  target.project = project;
  saveAll();
  if (editorFrame) {
    sendToEditor("importproject", { project: project });
    say("sent the blocks to the editor", "say", target);
  } else {
    pendingImport = project;
    startEditor();
  }
}

el("openHex").addEventListener("click", () => el("hexFile").click());
el("hexFile").addEventListener("change", e => {
  const f = e.target.files && e.target.files[0];
  if (f) openHex(f);
  e.target.value = "";
});
// dropping a .hex anywhere on the page works too
document.addEventListener("dragover", e => { e.preventDefault(); });
document.addEventListener("drop", e => {
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && /\.hex$/i.test(f.name)) { e.preventDefault(); openHex(f); }
});

