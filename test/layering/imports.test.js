import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname, resolve, sep } from "node:path";

/* THE LAYERING RULE, as a test.

   Every folder in src/ may only import from the folders below it. This is the
   fix for the bug we kept hitting: when the blocks could reach straight into
   the robot's variables, a parameter named `b` silently became the robot, and
   three separate blocks were broken that way before anyone noticed.

   A comment asking people to be careful rots. A test does not. */

const RULES = {
  core:     [],                                 // imports nothing of ours at all
  hardware: ["core"],
  world:    ["core", "hardware"],
  api:      ["core", "hardware"],
  app:      ["core", "hardware", "world", "api"],
  ui:       ["core", "app"],
  room:     ["core", "app"],
  tools:    ["core", "hardware", "world", "api", "app", "room"]   // dev tools: rulers, not the gym
};

const SRC = resolve(__dirname, "../../src");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

/* Every `from "..."` in a file, resolved to the layer it lands in. Only our
   own relative imports count; a bare name is a library and always allowed. */
function importsOf(file) {
  const text = readFileSync(file, "utf-8");
  const out = [];
  const re = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(text))) {
    const spec = m[1];
    if (!spec.startsWith(".")) { out.push({ spec, layer: null }); continue; }
    const target = resolve(dirname(file), spec);
    const rel = relative(SRC, target);
    out.push({ spec, layer: rel.startsWith("..") ? "OUTSIDE src" : rel.split(sep)[0] });
  }
  return out;
}

const files = walk(SRC);

describe("the layering rule", () => {
  it("has some source to check, so a passing run means something", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("gives every folder in src a rule", () => {
    const folders = new Set(files.map(f => relative(SRC, f).split(sep)[0])
                                 .filter(p => p.endsWith(".js") === false));
    for (const f of folders) expect(Object.keys(RULES)).toContain(f);
  });

  for (const file of files) {
    const rel = relative(SRC, file);
    const layer = rel.split(sep)[0];
    it(rel + " imports only what its layer may", () => {
      const allowed = RULES[layer] || [];
      for (const imp of importsOf(file)) {
        if (imp.layer === null) continue;                 // a library, always fine
        if (imp.layer === layer) continue;                // its own layer, fine
        expect(allowed, rel + " must not import " + imp.spec).toContain(imp.layer);
      }
    });
  }

  it("never reaches into the legacy folder", () => {
    /* legacy/ is the old single file cut into pieces. It is there to read,
       not to import: it has no exports and leans on globals. */
    for (const file of files) {
      const text = readFileSync(file, "utf-8");
      expect(text, relative(SRC, file) + " imports from legacy/").not.toMatch(/legacy\//);
    }
  });

  it("keeps core as a leaf, which is what makes the model testable", () => {
    for (const file of files.filter(f => relative(SRC, f).startsWith("core" + sep))) {
      for (const imp of importsOf(file)) {
        expect(imp.layer, relative(SRC, file) + " must import nothing of ours").toBe(null);
      }
    }
  });
});
