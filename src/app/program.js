/* Turning what MakeCode shows a child into something the gym can run.

   MakeCode hands us ordinary TypeScript, in which `basic.pause(1000)` just
   blocks. We cannot block - one tick drives ten robots and a canvas - so
   every pause has to be awaited instead. That is the whole of `prepare`:
   mark the calls that take time, put `await` in front of them, and make
   every function that might contain one `async`.

   It is a text transform on purpose. The alternative is a full parser, and
   a parser that is 98% right is far harder to debug than a regex you can
   read in one sitting. The cases it handles are the cases MakeCode emits. */

/* Blocks that take time on the real board. Everything else returns at once. */
const BLOCKING = [
  "basic\\.pause", "basic\\.showString", "basic\\.showNumber",
  "bitbot\\.\\w*ms", "bitbot\\.\\w*Milliseconds", "bitbot\\.gocm",
  "bitbot\\.spinDeg", "bitbot\\.arcdeg", "bitbot\\.buzzTime",
  "music\\.play", "music\\.playTone", "music\\.rest",
  "control\\.waitMicros", "game\\.gameOver"
];

export function prepare(src) {
  let s = String(src);
  s = s.replace(/:\s*(number|string|boolean|void|any)\b/g, "");     // drop type annotations

  /* A child's own function can contain a pause, so calls to it must be
     awaited too. */
  const mine = [...s.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);

  /* Make everything async BEFORE inserting any await, so that nothing is
     ever inserted into a declaration. */
  s = s.replace(/\bfunction\s*\(/g, "async function (");
  s = s.replace(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g, "async function $1(");
  s = s.replace(/\(\s*\)\s*=>/g, "async () =>");
  s = s.replace(/async\s+async/g, "async");

  const names = BLOCKING.concat(mine.map(n => n.replace(/[$]/g, "\\$")));
  const re = new RegExp("(^|[^\\w.$])((?:" + names.join("|") + ")\\s*\\()", "g");
  const before = s;
  s = s.replace(re, (all, pre, call, offset) => {
    /* `function wiggle(` is where wiggle is DECLARED, not called. Putting
       an await in there produces `function await wiggle(`, which is a
       syntax error and was a real bug in the single-file gym. */
    if (/\bfunction\s*$/.test(before.slice(Math.max(0, offset - 12), offset + pre.length))) return all;
    return pre + "await " + call;
  });
  return s;
}

/* Thrown into a program that is waiting when somebody presses Stop. It is
   not an error and must never reach the log as one. */
export class Stopped extends Error {
  constructor() { super("stopped"); this.name = "Stopped"; }
}

/* Names a program uses that the gym has never heard of - an enum from an
   extension nobody has installed. Rather than crash, each becomes an object
   that answers with whatever is asked of it, so `Foo.Bar` is the string
   "Bar" and the program runs. */
function stubsFor(body, known) {
  const seen = new Set([...body.matchAll(/\b([A-Z][A-Za-z0-9_]*)\s*\./g)].map(x => x[1]));
  const stubs = {}, names = [];
  for (const n of seen) {
    if (n in known || n === "Math" || n === "Object" || n === "Array" ||
        n === "String" || n === "Number" || n === "JSON" || n === "Boolean") continue;
    stubs[n] = new Proxy({}, { get: (_, k) => String(k) });
    names.push(n);
  }
  return { stubs, names };
}

/* Build the function a program actually becomes. Kept apart from running it
   so a syntax error can be reported as a syntax error. */
export function compile(code, api, enums) {
  const body = prepare(code);
  const { stubs, names } = stubsFor(body, enums);
  const stubLine = names.length ? "const {" + names.join(",") + "} = __st;\n" : "";
  const fn = new Function("__ns", "__en", "__st", '"use strict";\n' +
    "const {" + Object.keys(api).join(",") + "} = __ns;\n" +
    "const {" + Object.keys(enums).join(",") + "} = __en;\n" +
    "music.PlaybackMode = __en.PlaybackMode;\n" +
    stubLine +
    "const Math = Object.assign(Object.create(globalThis.Math), {\n" +
    "  randomRange: (a, b) => __ns.randint(a, b)\n" +
    "});\n" +
    "return (async () => {\n" + body + "\n})();");
  return { run: () => fn(api, enums, stubs), unknown: names };
}
