import { describe, it, expect, vi } from "vitest";
import { createBus } from "../../src/core/bus.js";

describe("the orchestrator", () => {
  it("carries a message to whoever answers to that address", () => {
    const bus = createBus();
    bus.listen("bitbot", (m) => "did " + m.cmd);
    expect(bus.send("bitbot", { cmd: "go" })).toBe("did go");
  });

  it("says so plainly when a block is aimed at nothing", () => {
    const bus = createBus();
    expect(() => bus.send("bitbot", { cmd: "go" }))
      .toThrow(/nothing answers to bitbot/);
  });

  it("refuses to let two things answer to one address", () => {
    const bus = createBus();
    bus.listen("bitbot", () => 1);
    expect(() => bus.listen("bitbot", () => 2)).toThrow(/two things answer/);
  });

  it("lets a handler ask a question of its own while it works", () => {
    const bus = createBus();
    bus.listen("world", () => 42);
    bus.listen("bitbot", () => bus.send("world", { cmd: "light" }) + 1);
    expect(bus.send("bitbot", { cmd: "eyes" })).toBe(43);
  });

  it("stops messages going round in circles instead of hanging the browser", () => {
    const bus = createBus();
    bus.listen("a", () => bus.send("b", {}));
    bus.listen("b", () => bus.send("a", {}));
    expect(() => bus.send("a", {})).toThrow(/round in circles/);
  });

  it("shows a watcher everything that goes by, with the reply", () => {
    const bus = createBus();
    const seen = [];
    bus.listen("bitbot", () => 7);
    bus.watch((r) => seen.push(r));
    bus.send("bitbot", { cmd: "sonar" });
    expect(seen).toEqual([{ address: "bitbot", message: { cmd: "sonar" }, reply: 7 }]);
  });

  it("keeps the traffic so a test can read back what a program did", () => {
    const bus = createBus();
    bus.listen("bitbot", () => null);
    bus.send("bitbot", { cmd: "go", speed: 30 });
    bus.send("bitbot", { cmd: "stop" });
    expect(bus.traffic().map(r => r.message.cmd)).toEqual(["go", "stop"]);
  });

  it("lets a watcher be taken off again", () => {
    const bus = createBus();
    const fn = vi.fn();
    bus.listen("x", () => null);
    const stop = bus.watch(fn);
    bus.send("x", {}); stop(); bus.send("x", {});
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
