import { describe, expect, it } from "vitest";
import { createEngineTurn } from "../engineTurn";

/** A promise the test resolves by hand. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("createEngineTurn", () => {
  it("runs jobs one at a time, in the order they were asked", async () => {
    const turn = createEngineTurn();
    const log: string[] = [];
    const a = deferred<string>();
    const b = deferred<string>();

    const pa = turn.run(async () => {
      log.push("a:start");
      const v = await a.promise;
      log.push("a:end");
      return v;
    });
    const pb = turn.run(async () => {
      log.push("b:start");
      const v = await b.promise;
      log.push("b:end");
      return v;
    });
    await tick();
    expect(log).toEqual(["a:start"]);
    expect(turn.busy()).toBe(true);
    expect(turn.waiting()).toBe(1);

    b.resolve("B"); // b is ready first, but it is not its turn
    await tick();
    expect(log).toEqual(["a:start"]);

    a.resolve("A");
    expect(await pa).toBe("A");
    expect(await pb).toBe("B");
    expect(log).toEqual(["a:start", "a:end", "b:start", "b:end"]);
    expect(turn.busy()).toBe(false);
    expect(turn.waiting()).toBe(0);
  });

  it("a job that throws releases the engine and does not stop the next", async () => {
    const turn = createEngineTurn();
    const failing = turn.run(async () => {
      throw new Error("engine died");
    });
    const next = turn.run(async () => "fine");
    await expect(failing).rejects.toThrow("engine died");
    expect(await next).toBe("fine");
    expect(turn.busy()).toBe(false);
  });

  it("a job asked while the engine is free starts on the next microtask", async () => {
    const turn = createEngineTurn();
    let started = false;
    const p = turn.run(async () => {
      started = true;
      return 1;
    });
    expect(started).toBe(false);
    expect(turn.waiting()).toBe(1);
    expect(await p).toBe(1);
    expect(started).toBe(true);
  });
});

describe("createEngineTurn: a job asked ahead", () => {
  it("goes before the jobs still waiting, after the one running", async () => {
    const turn = createEngineTurn();
    const log: string[] = [];
    const first = deferred<void>();
    const running = turn.run(async () => {
      log.push("live:start");
      await first.promise;
      log.push("live:end");
    });
    await tick();
    const later = turn.run(async () => {
      log.push("later");
    });
    const whatIf = turn.run(
      async () => {
        log.push("what-if");
      },
      { ahead: true }
    );
    await tick();
    expect(turn.waiting()).toBe(2);
    expect(log).toEqual(["live:start"]);
    first.resolve();
    await Promise.all([running, whatIf, later]);
    expect(log).toEqual(["live:start", "live:end", "what-if", "later"]);
  });
});
