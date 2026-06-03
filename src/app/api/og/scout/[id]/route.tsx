import { ImageResponse } from "next/og";
import { getScoutSnapshot } from "@/lib/scoutSnapshots";

export const runtime = "nodejs";

const CARD_W = 1200;
const CARD_H = 630;

const BG = "#0B0F19";
const FG = "#F1F5F9";
const MUTED = "#94A3B8";
const EMBER = "#F97316";
const EDGE = "rgba(255,255,255,0.08)";

/**
 * Server-rendered OG image for a shared scout snapshot.
 *
 * Visual: player name + platform + the four key profile stats (OVR, ATK,
 * DEF, TIME) as a chart-of-rings. The Stalker Score gets its own large
 * numeric callout on the right. Same Obsidian Glass + Ember Core palette
 * as the insight and game-share OG cards.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let username = "Opponent";
  let platform = "chess.com";
  let stalkerTotal = 0;
  let predictability = "—";
  let ovr = 0;
  let atk = 0;
  let def = 0;
  let timeStat = 0;
  let mind = 0;
  let totalGames = 0;
  let archetype = "";

  if (id && typeof id === "string" && id.length <= 64) {
    try {
      const snap = await getScoutSnapshot(id);
      if (snap) {
        username = snap.username;
        platform = snap.platform;
        stalkerTotal = snap.analytics.stalker.total;
        predictability = snap.analytics.stalker.predictability;
        ovr = snap.analytics.profile.ovr;
        atk = snap.analytics.profile.atk;
        def = snap.analytics.profile.def;
        timeStat = snap.analytics.profile.time;
        mind = snap.analytics.profile.mind;
        totalGames = snap.analytics.profile.totalGames;
        archetype = snap.analytics.profile.archetype || "";
      }
    } catch (err) {
      console.error("[og/scout] snapshot read failed for", id, err);
    }
  }

  const stats = [
    { label: "OVR", value: ovr },
    { label: "ATK", value: atk },
    { label: "DEF", value: def },
    { label: "TIME", value: timeStat },
    { label: "MIND", value: mind },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: BG,
          backgroundImage: `radial-gradient(circle at 85% 15%, rgba(249,115,22,0.22) 0%, rgba(249,115,22,0) 55%), radial-gradient(circle at 12% 85%, rgba(56,189,248,0.10) 0%, rgba(56,189,248,0) 50%)`,
          padding: 48,
          color: FG,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: EMBER,
                color: BG,
                fontSize: 24,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              CM
            </div>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
              <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4 }}>
                Chess Masti
              </span>
              <span style={{ fontSize: 13, color: MUTED, letterSpacing: 1.4 }}>
                SCOUT REPORT
              </span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              padding: "6px 14px",
              borderRadius: 999,
              border: `1px solid ${EDGE}`,
              color: MUTED,
              fontSize: 15,
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            {platform} · {totalGames} games
          </div>
        </div>

        {/* Player name */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 28 }}>
          <span style={{ fontSize: 56, fontWeight: 800, color: FG, letterSpacing: -1, lineHeight: 1 }}>
            {username}
          </span>
          {archetype && (
            <span style={{ color: MUTED, fontSize: 18, marginTop: 8 }}>{archetype}</span>
          )}
        </div>

        {/* Two columns: stats + stalker */}
        <div style={{ display: "flex", flex: 1, gap: 28 }}>
          {/* Profile stats */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              gap: 14,
              padding: 24,
              borderRadius: 16,
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${EDGE}`,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 12,
                color: EMBER,
                letterSpacing: 2,
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              PROFILE
            </div>
            {stats.map((s) => (
              <StatRow key={s.label} label={s.label} value={s.value} />
            ))}
          </div>

          {/* Stalker score */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: 24,
              borderRadius: 16,
              background: `${EMBER}15`,
              border: `1px solid ${EMBER}33`,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 12,
                color: EMBER,
                letterSpacing: 2,
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              STALKER SCORE
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 110, fontWeight: 800, color: FG, lineHeight: 1, letterSpacing: -3 }}>
                {Math.round(stalkerTotal)}
              </span>
              <span style={{ color: MUTED, fontSize: 28 }}>/100</span>
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 12,
                color: FG,
                fontSize: 22,
              }}
            >
              Predictability: <span style={{ color: EMBER, fontWeight: 700, marginLeft: 6 }}>{predictability}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 24,
            paddingTop: 18,
            borderTop: `1px solid ${EDGE}`,
            color: MUTED,
            fontSize: 16,
          }}
        >
          <span>Scout any opponent free →</span>
          <span style={{ color: FG, fontWeight: 600 }}>chessmasti.com</span>
        </div>
      </div>
    ),
    {
      width: CARD_W,
      height: CARD_H,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    },
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 14,
          color: MUTED,
          fontWeight: 600,
        }}
      >
        <span>{label}</span>
        <span style={{ color: FG }}>{v}</span>
      </div>
      <div
        style={{
          display: "flex",
          height: 8,
          borderRadius: 999,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            width: `${v}%`,
            background: EMBER,
          }}
        />
      </div>
    </div>
  );
}
