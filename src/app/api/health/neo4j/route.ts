import { NextResponse } from "next/server";
import { isNeo4jConfigured, verifyConnection } from "@/lib/neo4j";

/**
 * Health probe for the Neo4j connection. Cheap one-shot driver init +
 * `RETURN 1` so we get a real round-trip signal without consuming the
 * puzzle/commentary query budget. Used as a pre-deploy smoke check and
 * for any future status page.
 *
 * - 200 `{ ok: true, configured: true }` — driver up, connection verified
 * - 503 `{ ok: false, reason: "unconfigured" }` — env vars missing
 * - 503 `{ ok: false, reason: "unreachable" }` — env set but verify failed
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  if (!isNeo4jConfigured()) {
    return NextResponse.json(
      { ok: false, configured: false, reason: "unconfigured" },
      { status: 503 }
    );
  }
  try {
    const ok = await verifyConnection();
    if (ok) {
      return NextResponse.json({ ok: true, configured: true });
    }
    return NextResponse.json(
      { ok: false, configured: true, reason: "unreachable" },
      { status: 503 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        reason: "error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 503 }
    );
  }
}
