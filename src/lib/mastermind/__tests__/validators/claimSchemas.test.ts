/**
 * PR-CI-3: structured-output claim parsers (tech-lead decision #6).
 *
 * Pins: (a) the envelope unwrap that feeds the legacy array-shaped parse
 * functions, (b) the wire request carrying output_config.format json_schema
 * with the {claims: [...]} envelope, (c) end-to-end through the REAL default
 * parsers: a constrained {claims:[...]} response yields parsed claims in
 * both evalClaim and relationalClaim — the fail-open unparseable-JSON class
 * (audit #4) is closed at the schema, not the regex.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  EVAL_CLAIM_ITEM_SCHEMA,
  RELATIONAL_CLAIM_ITEM_SCHEMA,
  claimsEnvelopeSchema,
  unwrapClaimsEnvelope,
} from "@/lib/mastermind/validators/claimSchemas";

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  vi.unstubAllEnvs();
});

describe("unwrapClaimsEnvelope", () => {
  it("unwraps {claims: [...]} to the bare-array JSON string", () => {
    expect(unwrapClaimsEnvelope('{"claims":[{"a":1}]}')).toBe('[{"a":1}]');
    expect(unwrapClaimsEnvelope('{"claims":[]}')).toBe("[]");
  });

  it("passes through non-envelope shapes for lenient downstream parsing", () => {
    expect(unwrapClaimsEnvelope('[{"a":1}]')).toBe('[{"a":1}]'); // already bare
    expect(unwrapClaimsEnvelope("not json")).toBe("not json");
    expect(unwrapClaimsEnvelope('{"claims":"nope"}')).toBe('{"claims":"nope"}');
  });
});

describe("schema shape (Anthropic structured-output constraints)", () => {
  it("every object level carries additionalProperties:false and a full required list", () => {
    const walk = (node: unknown): void => {
      if (node === null || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      if (obj.type === "object") {
        expect(obj.additionalProperties).toBe(false);
        expect(Object.keys(obj.properties as Record<string, unknown>).sort()).toEqual(
          ([...(obj.required as string[])] as string[]).sort(),
        );
      }
      for (const v of Object.values(obj)) walk(v);
    };
    walk(claimsEnvelopeSchema(EVAL_CLAIM_ITEM_SCHEMA));
    walk(claimsEnvelopeSchema(RELATIONAL_CLAIM_ITEM_SCHEMA));
  });
});

describe("default parsers end-to-end (mocked wire, real code path)", () => {
  let lastBody: Record<string, unknown> | null = null;

  beforeEach(() => {
    lastBody = null;
    // llmProvider bakes ANTHROPIC_API_KEY into a module-level const at load
    // time — reset the registry so the dynamic imports below see the stub.
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-api-test-fake-fake-fake-fake-fake-fake-fakeAA");
  });

  function mockAnthropic(text: string): void {
    global.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      lastBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
        { status: 200 },
      );
    }) as typeof fetch;
  }

  it("evalClaim: constrained envelope response parses through validateEvalClaim", async () => {
    mockAnthropic(
      JSON.stringify({
        claims: [
          {
            stated_band: "winning",
            stated_cp: 500,
            supporting_spans: ["White is winning"],
            confidence: 0.95,
            claim_class: "evaluative",
            perspective: "white",
          },
        ],
      }),
    );
    const { validateEvalClaim } = await import("@/lib/mastermind/validators");
    // Contract says roughly equal; the (mock-parsed) claim says winning →
    // the validator FIRES, proving the structured parse fed real claims in.
    const result = await validateEvalClaim({
      llmResponse: "White is winning",
      stockfishEval: { cp: 0 },
      playerPerspective: "white",
      correlationId: "claim-schema-test",
    });
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(1);
    // The wire request was schema-constrained with the envelope.
    const oc = (lastBody as { output_config?: { format?: { type: string; schema: unknown } } })
      .output_config;
    expect(oc?.format?.type).toBe("json_schema");
    expect(oc?.format?.schema).toEqual(claimsEnvelopeSchema(EVAL_CLAIM_ITEM_SCHEMA));
  });

  it("relationalClaim: constrained envelope response parses through validateRelationalClaim", async () => {
    mockAnthropic(
      JSON.stringify({
        claims: [
          {
            kind: "attack",
            pieceColor: "w",
            pieceType: "n",
            fromSquare: "d4",
            targetSquare: "g3", // FALSE from d4 — must contradict
            pinnedToSquare: null,
            expectedPiece: null,
            line: null,
            precedingLine: null,
            moveRefPly: null,
            rawText: "the knight controls g3",
          },
        ],
      }),
    );
    const { validateRelationalClaim } = await import("@/lib/mastermind/validators");
    const result = await validateRelationalClaim({
      llmResponse: "the knight controls g3",
      fen: "3q2k1/6p1/8/8/3NP3/8/8/6K1 w - - 0 11",
      correlationId: "claim-schema-test",
    });
    expect(result.passed).toBe(false);
    expect(result.issues[0].check_name).toBe("relational_claim_contradicted");
    const oc = (lastBody as { output_config?: { format?: { schema: unknown } } }).output_config;
    expect(oc?.format?.schema).toEqual(claimsEnvelopeSchema(RELATIONAL_CLAIM_ITEM_SCHEMA));
  });
});
