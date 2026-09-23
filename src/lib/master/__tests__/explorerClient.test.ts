import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchExplorer,
  peekExplorer,
  prefetchExplorer,
  resetExplorerCacheForTests,
  ROWS_REQUESTED,
} from "../explorerClient";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const ANSWER = {
  moves: [{ uci: "e2e4", san: "e4", count: 5 }],
  source: "tree",
};

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  const mock = vi.fn(async (input: string | URL | Request) =>
    handler(String(input))
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => resetExplorerCacheForTests());
afterEach(() => vi.unstubAllGlobals());

describe("fetchExplorer", () => {
  it("asks once per position, whatever the move counters say", async () => {
    const mock = stubFetch(() => Response.json(ANSWER));
    expect(peekExplorer(START)).toBeUndefined();
    await fetchExplorer(START);
    await fetchExplorer(START.replace(" 0 1", " 7 12"));
    expect(mock).toHaveBeenCalledTimes(1);
    expect(String(mock.mock.calls[0][0])).toContain(`moves=${ROWS_REQUESTED}`);
    expect(peekExplorer(START)).toEqual(ANSWER);
  });

  it("shares one request between callers that ask while it is in flight", async () => {
    let release: (r: Response) => void = () => {};
    const mock = stubFetch(() => new Promise<Response>((r) => (release = r)));
    const a = fetchExplorer(START);
    const b = fetchExplorer(START);
    expect(mock).toHaveBeenCalledTimes(1);
    release(Response.json(ANSWER));
    expect(await a).toEqual(ANSWER);
    expect(await b).toEqual(ANSWER);
  });

  it("does not remember a failure, so a retry asks again", async () => {
    const mock = stubFetch(() => new Response("", { status: 502 }));
    await expect(fetchExplorer(START)).rejects.toThrow("502");
    expect(peekExplorer(START)).toBeUndefined();
    await expect(fetchExplorer(START)).rejects.toThrow("502");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("prefetches quietly and the answer is there for the real request", async () => {
    const mock = stubFetch(() => Response.json(ANSWER));
    prefetchExplorer(START);
    await new Promise((r) => setTimeout(r, 0));
    expect(peekExplorer(START)).toEqual(ANSWER);
    await fetchExplorer(START);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("a failed prefetch is silent", async () => {
    stubFetch(() => {
      throw new Error("offline");
    });
    expect(() => prefetchExplorer(START)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(peekExplorer(START)).toBeUndefined();
  });
});
