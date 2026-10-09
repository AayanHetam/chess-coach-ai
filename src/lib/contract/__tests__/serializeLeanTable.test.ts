/**
 * The lean move table (pathway 4.8b, COACH_TURN1_LEAN_TABLE), on the ten
 * real fixtures with the network off.
 *
 * With the flag on, the verbalizer's projection keeps a move-table row's
 * better move but sends `line: null` in place of its engine line on a ply
 * with no insight. Everything else stays as it was: the flag-off bytes with
 * the switch unset or "0", the contract object, the two licence pools the
 * referee builds from the move table, the legacy prompt, the stable system
 * prompt and the card plan. The expected wire is derived here from the
 * flag-off wire by the rule itself, so an over-broad cut shows up as a diff.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { buildCoachContract } from "@/lib/contract/builder";
import {
  collectContractEvalPools,
  collectContractWhitelist,
} from "@/lib/contract/refereeChecks";
import {
  renderLegacyPrompt,
  serializeForVerbalizer,
} from "@/lib/contract/serialize";
import type { CoachContract } from "@/lib/contract/types";
import {
  __clearChessdbCache,
  __resetFetchForTesting,
  __setFetchForTesting,
} from "@/lib/grounding/chessdb";
import {
  buildVerbalizerUserTurn,
  getVerbalizerSystemPromptParts,
} from "@/lib/prompts/verbalizerPrompt";
import { argsFor, REAL_FIXTURES } from "./earlyGroundingFixtures";

const contracts = new Map<string, CoachContract>();

/** Each contract as built, before anything serialized it. */
interface AsBuilt {
  json: string;
  pools: ReturnType<typeof collectContractEvalPools>;
  whitelist: ReturnType<typeof collectContractWhitelist>;
  legacy: string;
  linesOnObject: number;
}
const asBuilt = new Map<string, AsBuilt>();

function withFlag<T>(value: string | undefined, fn: () => T): T {
  vi.stubEnv("COACH_TURN1_LEAN_TABLE", value);
  try {
    return fn();
  } finally {
    vi.unstubAllEnvs();
  }
}

const flagOff = (c: CoachContract) =>
  withFlag(undefined, () => serializeForVerbalizer(c));
const flagOn = (c: CoachContract) =>
  withFlag("1", () => serializeForVerbalizer(c));

interface WireRow {
  ply: number;
  bestWas: { san: string; line: unknown } | null;
}

/** Each insight's ply and the reply's, whose row holds the move's refutation. */
function cardedPlies(contract: CoachContract): Set<number> {
  return new Set(contract.insights.flatMap((i) => [i.ply, i.ply + 1]));
}

/** The flag-off wire with rule 6 applied by hand. */
function expectedLean(contract: CoachContract): string {
  const wire = JSON.parse(flagOff(contract)) as { moveTable: WireRow[] };
  const carded = cardedPlies(contract);
  for (const row of wire.moveTable) {
    if (!carded.has(row.ply) && row.bestWas && row.bestWas.line) {
      row.bestWas.line = null;
    }
  }
  return JSON.stringify(wire);
}

beforeAll(async () => {
  __setFetchForTesting(async () => {
    throw new Error("network disabled in lean table tests");
  });
  for (const name of REAL_FIXTURES) {
    __clearChessdbCache();
    const contract = await buildCoachContract(argsFor(name));
    contracts.set(name, contract);
    asBuilt.set(name, {
      json: JSON.stringify(contract),
      pools: collectContractEvalPools(contract),
      whitelist: collectContractWhitelist(contract),
      legacy: renderLegacyPrompt(contract),
      linesOnObject: contract.moveTable.filter((r) => r.bestWas?.line).length,
    });
  }
}, 240_000);

afterAll(() => __resetFetchForTesting());

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the lean move table", () => {
  it("covers all ten real fixtures", () => {
    expect(REAL_FIXTURES).toHaveLength(10);
    expect(contracts.size).toBe(10);
  });

  it('unset and "0" give the flag-off bytes', () => {
    for (const [name, contract] of Array.from(contracts)) {
      const off = flagOff(contract);
      expect(
        withFlag("0", () => serializeForVerbalizer(contract)),
        name
      ).toBe(off);
      expect(
        withFlag("", () => serializeForVerbalizer(contract)),
        name
      ).toBe(off);
    }
  });

  it("nulls the line only on rows with no insight that have one", () => {
    let rowsCut = 0;
    for (const [name, contract] of Array.from(contracts)) {
      expect(flagOn(contract), name).toBe(expectedLean(contract));
      const carded = cardedPlies(contract);
      rowsCut += contract.moveTable.filter(
        (r) => !carded.has(r.ply) && r.bestWas?.line
      ).length;
    }
    // Measured at 136 rows over the ten fixtures when the rule landed, 124
    // once the reply rows were kept.
    expect(rowsCut).toBeGreaterThan(100);
  });

  it("keeps a carded row's line and every null bestWas as they were", () => {
    for (const [name, contract] of Array.from(contracts)) {
      const off = JSON.parse(flagOff(contract)) as { moveTable: WireRow[] };
      const on = JSON.parse(flagOn(contract)) as { moveTable: WireRow[] };
      const carded = cardedPlies(contract);
      expect(on.moveTable.length, name).toBe(off.moveTable.length);
      on.moveTable.forEach((row, i) => {
        const before = off.moveTable[i];
        // A null bestWas means the move played was the engine's own: it must
        // never turn into a better move, and a better move never into null.
        expect(row.bestWas === null, name).toBe(before.bestWas === null);
        if (row.bestWas && before.bestWas) {
          expect(row.bestWas.san).toBe(before.bestWas.san);
        }
        if (carded.has(row.ply)) expect(row).toEqual(before);
        else
          expect({ ...row, bestWas: null }).toEqual({
            ...before,
            bestWas: null,
          });
      });
    }
  });

  it("leaves the contract object, its licence pools and the legacy prompt untouched", () => {
    for (const [name, contract] of Array.from(contracts)) {
      flagOn(contract);
      const built = asBuilt.get(name)!;
      // Compared with the contract as built, before any test serialized it.
      expect(JSON.stringify(contract), name).toBe(built.json);
      expect(collectContractEvalPools(contract), name).toEqual(built.pools);
      expect(collectContractWhitelist(contract), name).toEqual(built.whitelist);
      withFlag("1", () => {
        expect(renderLegacyPrompt(contract), name).toBe(built.legacy);
        expect(collectContractEvalPools(contract), name).toEqual(built.pools);
        expect(collectContractWhitelist(contract), name).toEqual(
          built.whitelist
        );
      });
      // The object still carries every line the wire leaves out.
      expect(
        contract.moveTable.filter((r) => r.bestWas?.line).length,
        name
      ).toBe(built.linesOnObject);
    }
  });

  it("keeps every cite token, line, eval display and better move", () => {
    for (const [name, contract] of Array.from(contracts)) {
      const json = flagOn(contract);
      for (const insight of contract.insights) {
        expect(json, name).toContain(`"${insight.factIdPrefix}"`);
        for (const line of insight.lines) {
          expect(json, name).toContain(`"${line.id}"`);
          expect(json, name).toContain(JSON.stringify(line.san));
          expect(json, name).toContain(`"${line.eval.display}"`);
        }
        expect(json, name).toContain(`"${insight.evalBefore.display}"`);
        expect(json, name).toContain(`"${insight.evalAfter.display}"`);
      }
      for (const row of contract.moveTable) {
        if (row.evalAfter) {
          expect(json, name).toContain(`"${row.evalAfter.display}"`);
        }
        if (row.bestWas) expect(json, name).toContain(`"${row.bestWas.san}"`);
      }
    }
  });

  it("keeps the reply row's line, the refutation of a blunder the opponent did not punish", () => {
    let kept = 0;
    for (const [name, contract] of Array.from(contracts)) {
      const on = JSON.parse(flagOn(contract)) as { moveTable: WireRow[] };
      for (const insight of contract.insights) {
        const reply = contract.moveTable.find((r) => r.ply === insight.ply + 1);
        if (!reply?.bestWas?.line) continue;
        const row = on.moveTable.find((r) => r.ply === reply.ply)!;
        expect(row.bestWas?.line, `${name} ${reply.ply}`).not.toBeNull();
        kept += 1;
      }
    }
    // Fixture 05's 20. Rg3 among them: 20... Be5 let it go, and only that
    // row's line holds 20... Bxg3+.
    const rg3 = contracts
      .get("05_long_game_six_mistakes.json")!
      .moveTable.find((r) => r.san === "Rg3");
    expect(rg3).toBeDefined();
    const fiveOn = JSON.parse(
      flagOn(contracts.get("05_long_game_six_mistakes.json")!)
    ) as { moveTable: Array<WireRow & { bestWas: { line: unknown } | null }> };
    const after = fiveOn.moveTable.find((r) => r.ply === rg3!.ply + 1)!;
    expect(JSON.stringify(after.bestWas?.line)).toContain("Bxg3+");
    expect(kept).toBeGreaterThan(0);
  });

  it("shrinks the projected contract by at least 3% over the ten fixtures", () => {
    let off = 0;
    let on = 0;
    for (const contract of Array.from(contracts.values())) {
      off += flagOff(contract).length;
      on += flagOn(contract).length;
    }
    // Measured at 3.4% (10,004 of 292,006 characters) when the rule landed,
    // 3.1% (9,108) once the reply rows were kept.
    expect(on).toBeLessThan(off * 0.97);
  });

  it("changes neither the stable system prompt nor the card plan", () => {
    const input = { personalityId: "friendly", userRating: 1500 };
    const systemOff = withFlag(undefined, () =>
      getVerbalizerSystemPromptParts(input)
    );
    const systemOn = withFlag("1", () => getVerbalizerSystemPromptParts(input));
    expect(systemOn).toEqual(systemOff);

    const CONTRACT_HEAD = "## VERIFIED FACT CONTRACT (JSON";
    for (const [name, contract] of Array.from(contracts)) {
      const args = { contract, messageText: "analyze my game" };
      const turnOff = withFlag(undefined, () => buildVerbalizerUserTurn(args));
      const turnOn = withFlag("1", () => buildVerbalizerUserTurn(args));
      const sectionsOff = turnOff.split("\n\n## ");
      const sectionsOn = turnOn.split("\n\n## ");
      expect(sectionsOn.length, name).toBe(sectionsOff.length);
      sectionsOn.forEach((section, i) => {
        const isContract = (i === 0 ? section : `## ${section}`).startsWith(
          CONTRACT_HEAD
        );
        if (!isContract) expect(section, name).toBe(sectionsOff[i]);
      });
      // The contract section is the lean wire under the same heading.
      expect(turnOn, name).toBe(
        turnOff.replace(flagOff(contract), () => expectedLean(contract))
      );
    }
  });
});
