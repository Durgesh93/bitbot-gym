import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

/* Three pages during development:
     /                 the published single-file gym, exactly as it ships
     /gym.html         the rebuilt gym: React, the world engine, the real blocks
     /inspector.html   the field inspector, a ruler for the world engine

   index.html stays untouched until the rebuild has passed its regression.
   Until then the live gym is the live gym.

   Two builds, because they want opposite things:

     vite build              both pages, chunks shared between them - what you
                             want while developing, and it is faster
     vite build --mode ship  gym.html alone, everything inlined into it

   The ship build is the one that matters. The gym has to survive being
   double-clicked out of a Downloads folder on a school Chromebook with no
   network, which means one file: no sibling .js, no sibling .css, nothing to
   lose on the way. Rollup will only inline like that for a single input, so
   the two builds cannot be one build. */
export default defineConfig(({ mode }) => {
  const ship = mode === "ship";
  return {
    plugins: ship ? [react(), viteSingleFile()] : [react()],
    server: { open: "/gym.html" },
    build: {
      outDir: ship ? "dist-ship" : "dist",
      rollupOptions: {
        input: ship ? { gym: "gym.html" }
                    : { gym: "gym.html", inspector: "inspector.html" }
      }
    }
  };
});
