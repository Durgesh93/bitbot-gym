import { describe, it, expect } from "vitest";
import { createBus } from "../../src/core/bus.js";

/* post/drain is how everything from OUTSIDE the simulation gets in: a mouse
   drag, a key, a light switch being flicked. These tests pin the two
   properties the rest of the gym leans on - it lands between ticks, and one
   bad message cannot take the tick down with it. */

describe("post and drain", () => {
  it("holds a posted message until the tick drains it", () => {
    const bus = createBus();
    const seen = [];
    bus.listen("world", m => { seen.push(m.cmd); return "ok"; });

    bus.post("world", { cmd: "lamp" });
    expect(seen).toEqual([]);                 // nothing happens yet, on purpose
    expect(bus.pending()).toBe(1);

    const out = bus.drain();
    expect(seen).toEqual(["lamp"]);
    expect(out.delivered).toBe(1);
    expect(bus.pending()).toBe(0);
  });

  it("keeps the order things arrived in", () => {
    const bus = createBus();
    const seen = [];
    bus.listen("world", m => seen.push(m.n));
    [1, 2, 3, 4].forEach(n => bus.post("world", { n }));
    bus.drain();
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it("coalesces a drag, so sixty mouse moves a second cannot flood the queue", () => {
    const bus = createBus();
    const seen = [];
    bus.listen("world", m => seen.push(m.x));
    for (let x = 0; x < 60; x++) bus.post("world", { cmd: "place", x }, { coalesce: "place:3" });
    expect(bus.pending()).toBe(1);
    bus.drain();
    expect(seen).toEqual([59]);                // only where the hand ended up
  });

  it("coalesces each body separately", () => {
    const bus = createBus();
    const seen = [];
    bus.listen("world", m => seen.push(m.id + ":" + m.x));
    bus.post("world", { id: 1, x: 10 }, { coalesce: "place:1" });
    bus.post("world", { id: 2, x: 20 }, { coalesce: "place:2" });
    bus.post("world", { id: 1, x: 11 }, { coalesce: "place:1" });
    expect(bus.pending()).toBe(2);
    bus.drain();
    expect(seen).toEqual(["1:11", "2:20"]);
  });

  it("delivers a message posted during a drain on the NEXT drain, not this one", () => {
    const bus = createBus();
    let runs = 0;
    bus.listen("world", () => { runs++; bus.post("world", { again: true }); });
    bus.post("world", { first: true });
    bus.drain();
    expect(runs).toBe(1);                      // not a spin
    expect(bus.pending()).toBe(1);
    bus.drain();
    expect(runs).toBe(2);
  });

  it("carries on past a handler that throws, and reports it", () => {
    const bus = createBus();
    const seen = [];
    bus.listen("bad", () => { throw new Error("sensor came loose"); });
    bus.listen("good", () => seen.push("ran"));
    bus.post("bad", { cmd: "x" });
    bus.post("good", { cmd: "y" });
    const out = bus.drain();
    expect(seen).toEqual(["ran"]);             // the tick survives
    expect(out.delivered).toBe(1);
    expect(out.failed).toHaveLength(1);
    expect(out.failed[0].error.message).toBe("sensor came loose");
  });

  it("never drops a message to nobody in silence", () => {
    const bus = createBus();
    bus.post("nowhere", { cmd: "place" });
    const out = bus.drain();
    expect(out.undelivered).toHaveLength(1);
    expect(out.undelivered[0].address).toBe("nowhere");
  });

  it("does not throw when posting, whatever the address", () => {
    const bus = createBus();
    expect(() => bus.post("nowhere", { cmd: "x" })).not.toThrow();
  });

  it("puts posts in the traffic log beside sends, so one log explains a tick", () => {
    const bus = createBus();
    bus.listen("world", () => 7);
    bus.post("world", { cmd: "lamp" });
    bus.drain();
    bus.send("world", { cmd: "read" });
    const kinds = bus.traffic().map(r => r.kind);
    expect(kinds).toEqual(["post", "send"]);
  });
});
