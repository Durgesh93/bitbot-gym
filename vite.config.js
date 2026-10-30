import { defineConfig } from "vite";

/* Two pages during development:
     /                 the published single-file gym, exactly as it ships
     /inspector.html   the field inspector, a ruler for the world engine
   The build still produces one inlined file; the inspector is dev only. */
export default defineConfig({
  server: { open: "/inspector.html" },
  build: { rollupOptions: { input: { inspector: "inspector.html" } } }
});
