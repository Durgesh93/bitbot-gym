import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    environment: "node",          // the model has no DOM in it, and must not
    reporters: "verbose",
  },
});
