import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* Three pages during development:
     /                 the published single-file gym, exactly as it ships
     /gym.html         the rebuilt gym: React, the world engine, the real blocks
     /inspector.html   the field inspector, a ruler for the world engine

   index.html stays untouched until the rebuild has passed its regression.
   Until then the live gym is the live gym. */
export default defineConfig({
  plugins: [react()],
  server: { open: "/gym.html" },
  build: { rollupOptions: { input: { gym: "gym.html", inspector: "inspector.html" } } }
});
