import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

/**
 * Masti's still, bundled with the route (the edge runtime has no fs, and an
 * absolute production URL would 500 on a preview deploy until production
 * carries the file). Null when the fetch fails, and the card renders without
 * him rather than not at all.
 */
async function mastiStill(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(
      new URL("../../../../public/masti/v4/still/wave.png", import.meta.url)
    );
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest) {
  const masti = await mastiStill();
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 100px",
          background: "linear-gradient(135deg, #08080f 0%, #12101a 100%)",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* subtle amber glow top-right */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,107,43,0.18) 0%, transparent 70%)",
          }}
        />

        {/* Masti, waving from the free right half. */}
        {masti && (
          <img
            // satori takes an ArrayBuffer here; the JSX types do not know it.
            src={masti as unknown as string}
            alt=""
            width={288}
            height={360}
            style={{ position: "absolute", right: 40, bottom: 0 }}
          />
        )}

        {/* brand mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(255,107,43,0.2)",
              border: "1px solid rgba(255,107,43,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            ♟
          </div>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 20, letterSpacing: "0.04em" }}>
            chessmasti.com
          </span>
        </div>

        {/* headline */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginBottom: 28,
          }}
        >
          Free AI Chess Coach
        </div>

        {/* sub */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            fontSize: 28,
            color: "rgba(255,255,255,0.55)",
            lineHeight: 1.5,
            maxWidth: 700,
          }}
        >
          <span>Stockfish analysis.</span>
          <span style={{ color: "rgba(255,107,43,0.9)" }}>Claude explanations.</span>
          <span>Mistake-based drills.</span>
          <span>Free.</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
