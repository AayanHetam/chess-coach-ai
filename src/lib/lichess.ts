import { LineEval, PositionEval } from "@/types/eval";
import { sortLines } from "./engine/helpers/parseResults";
import {
  LichessError,
  LichessEvalBody,
  LichessGame,
  LichessResponse,
} from "@/types/lichess";
import { logErrorToSentry } from "./sentry";
import { formatUciPv } from "./chess";

/**
 * How long to wait for lichess.org/api/cloud-eval before giving up.
 *
 * This was 200ms, which measured almost exactly at the median response time
 * (~175ms warm from a desktop connection) — so roughly half of all warm
 * requests were aborted a few milliseconds before the answer arrived, and the
 * first request of any session, which pays DNS + TLS setup (~770ms measured),
 * was aborted every single time. On mobile the endpoint was unreachable in
 * practice. A cloud hit carries depth 55-75; the local WASM engine reaches
 * 14-26. Throwing that away over 25ms of headroom was the wrong trade.
 *
 * Raising it is only safe because the callers no longer *block* on it — see
 * `evaluatePositionWithUpdate`. A cache miss is cheap regardless: Lichess
 * answers 404 in ~175ms, so the ceiling is only reached on a genuinely slow
 * network.
 */
export const LICHESS_EVAL_TIMEOUT_MS = 2000;

export const getLichessEval = async (
  fen: string,
  multiPv = 1,
  timeoutMs = LICHESS_EVAL_TIMEOUT_MS
): Promise<PositionEval> => {
  try {
    const data = await fetchLichessEval(fen, multiPv, timeoutMs);

    if ("error" in data) {
      if (data.error === LichessError.NotFound) {
        return {
          bestMove: "",
          lines: [],
        };
      }
      throw new Error(data.error);
    }

    const lines: LineEval[] = data.pvs.map((pv, index) => ({
      pv: formatUciPv(fen, pv.moves.split(" ")),
      cp: pv.cp,
      mate: pv.mate,
      depth: data.depth,
      multiPv: index + 1,
    }));

    lines.sort(sortLines);
    const isWhiteToPlay = fen.split(" ")[1] === "w";
    if (!isWhiteToPlay) lines.reverse();

    const bestMove = lines[0].pv[0];
    const linesToKeep = lines.slice(0, multiPv);

    return {
      bestMove,
      lines: linesToKeep,
      source: "cloud",
    };
  } catch (error) {
    logErrorToSentry(error, { fen, multiPv });

    return {
      bestMove: "",
      lines: [],
    };
  }
};

export const getLichessUserRecentGames = async (
  username: string,
  signal?: AbortSignal
): Promise<LichessGame[]> => {
  const res = await fetch(
    `https://lichess.org/api/games/user/${username}?until=${Date.now()}&max=50&pgnInJson=true&sort=dateDesc&clocks=true`,
    { method: "GET", headers: { accept: "application/x-ndjson" }, signal }
  );

  if (res.status >= 400) {
    throw new Error("Error fetching games from Lichess");
  }

  const rawData = await res.text();
  const games: LichessGame[] = rawData
    .split("\n")
    .filter((game) => game.length > 0)
    .map((game) => JSON.parse(game));

  return games;
};

const fetchLichessEval = async (
  fen: string,
  multiPv: number,
  timeoutMs: number
): Promise<LichessResponse<LichessEvalBody>> => {
  try {
    const res = await fetch(
      `https://lichess.org/api/cloud-eval?fen=${fen}&multiPv=${multiPv}`,
      { method: "GET", signal: AbortSignal.timeout(timeoutMs) }
    );

    return res.json();
  } catch (error) {
    console.error(error);

    return { error: LichessError.NotFound };
  }
};
