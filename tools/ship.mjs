/* Turn the built single file into the page GitHub Pages serves.

   Two jobs, and the first one is a correction rather than a step.

   Vite fingerprints every asset an HTML file links to, so
   `manifest.webmanifest` comes out of the build as
   `manifest-Cjru80ve.webmanifest` and `icon-192.png` as
   `icon-192-ChlFmVPd.png`. That is exactly right for a cache-busted
   deploy and exactly wrong here: those two files already live at the
   repo root under their plain names, sw.js caches them by those names,
   and the manifest is what an installed gym was installed FROM. A
   hashed link would quietly cost the class the offline app, and quietly
   is the problem - the page would still open, so nobody would notice
   until a lesson ran with the wifi down.

   So the links go back to the plain names, and then the whole thing
   becomes index.html. Everything else is already inlined: one file, no
   requests, open it off a USB stick and it works. */

import { readFileSync, writeFileSync } from "node:fs";

const BUILT = "dist-ship/gym.html";
const LIVE = "index.html";

let html = readFileSync(BUILT, "utf8");

const unhash = [
  [/manifest-[A-Za-z0-9_-]+\.webmanifest/g, "manifest.webmanifest"],
  [/icon-192-[A-Za-z0-9_-]+\.png/g, "icon-192.png"]
];
for (const [pattern, plain] of unhash) {
  if (!pattern.test(html)) continue;
  pattern.lastIndex = 0;
  html = html.replace(pattern, plain);
}

/* It is only worth shipping if it really is self-contained, so say so out
   loud rather than trusting the plugin. Anything still pointing outside
   the file, other than the two PWA links, means a classroom with no wifi
   gets a broken page.

   The scan is of the MARKUP only. A bundle of this size has `src=` and
   `href=` inside its own string literals - the renderer builds HTML for
   the MakeCode iframe - and treating those as outward links fails a
   build that is perfectly self-contained. */
const markup = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "<style></style>");
const outward = [...markup.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(m => m[1])
  .filter(u => !u.startsWith("data:") && !u.startsWith("#"))
  .filter(u => !["manifest.webmanifest", "icon-192.png",
                 "./manifest.webmanifest", "./icon-192.png"].includes(u));
if (outward.length) {
  console.error("not self-contained, still asks for:", outward);
  process.exit(1);
}

writeFileSync(LIVE, html);
console.log("shipped " + BUILT + " -> " + LIVE +
            "  (" + (html.length / 1024).toFixed(0) + " KB, " +
            "links kept: manifest.webmanifest, icon-192.png)");
