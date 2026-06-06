"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Box, Popover, Typography } from "@mui/material";
import { Info } from "lucide-react";

/**
 * Inline glossary for chess terms that appear in coach prose.
 *
 * `<GlossifiedText text="..." />` auto-detects known terms and wraps the
 * FIRST occurrence of each in a tappable info chip. Tapping the chip shows
 * a definition popover. Subsequent occurrences in the same string render
 * as plain text — one underline per term per message keeps the prose clean.
 *
 * Squares-level highlighting (red overlay for a pin line, etc.) is PR-C
 * scope. This file owns the *what-does-this-word-mean* layer only.
 */

export interface ChessTermEntry {
  name: string;
  /** Patterns we'll match in coach prose. Each must be a single chunk —
   *  multi-word terms are matched as a literal substring (no word boundary
   *  inside). Order doesn't matter; the matcher sorts by length. */
  aliases: string[];
  short: string;
  detail: string;
  example?: string;
}

export const CHESS_TERM_GLOSSARY: Record<string, ChessTermEntry> = {
  check: {
    name: "Check",
    aliases: ["check", "checks", "checking"],
    short:
      "A direct attack on the enemy king. The opponent must respond immediately by moving the king, blocking, or capturing the attacker.",
    detail:
      "Check is not a winning move on its own — it just constrains the opponent's next move. The real threat is usually what comes after: a tactic that exploits the king's forced reply.",
  },
  checkmate: {
    name: "Checkmate",
    aliases: ["checkmate", "mated", "mate in", "mating"],
    short:
      "The king is in check and there is no legal way to escape. The game ends immediately.",
    detail:
      "Three conditions: the king is attacked, it can't move to a safe square, the check can't be blocked, and the attacker can't be captured. Even one escape path means no mate.",
  },
  stalemate: {
    name: "Stalemate",
    aliases: ["stalemate"],
    short:
      "The side to move has no legal moves but isn't in check. The game is a draw.",
    detail:
      "Stalemate is a draw, not a loss — even though the stalemated side is often badly down on material. Knowing this saves losing positions; missing it throws away winning ones.",
  },
  pin: {
    name: "Pin",
    aliases: ["pin", "pinned", "pinning", "pins"],
    short:
      "A piece is attacked along a line and can't (or shouldn't) move because a more valuable piece sits behind it.",
    detail:
      "Absolute pin: the piece behind is the king — the pinned piece literally can't move. Relative pin: the piece behind is just more valuable — moving the pinned piece would lose material. Pins are powerful because the pinned piece is effectively frozen.",
    example: "A bishop on b5 pinning a knight on c6 to a king on e8.",
  },
  skewer: {
    name: "Skewer",
    aliases: ["skewer", "skewered", "skewering"],
    short:
      "Like a pin in reverse: the more valuable piece is in front and forced to move, exposing the less valuable piece behind to capture.",
    detail:
      "Long-range pieces (rook, bishop, queen) are the skewerers. The defending side has to move the front piece out of danger, surrendering the piece behind.",
  },
  fork: {
    name: "Fork",
    aliases: ["fork", "forked", "forking", "forks"],
    short:
      "A single piece attacks two or more enemy pieces at once. The opponent can only save one.",
    detail:
      "Knights are famous for forks because they jump over defenders. But any piece can fork — a queen forking king and rook, a pawn forking two pieces with one push.",
    example: "A knight on f7 forking the king on h8 and the queen on d8.",
  },
  "discovered attack": {
    name: "Discovered attack",
    aliases: ["discovered attack", "discovery", "discovered check"],
    short:
      "Moving one piece unmasks an attack from a piece behind it. The piece that moves can do something useful of its own at the same time.",
    detail:
      "Double-threat by construction: the moved piece makes its own threat, and the piece it unmasks adds another. Discovered check is the strongest version — the moving piece can grab material with impunity because the opponent must address the check.",
  },
  "double attack": {
    name: "Double attack",
    aliases: ["double attack", "double threat"],
    short:
      "Two threats made in the same move. The opponent can only meet one.",
    detail:
      "Umbrella term that includes forks and discovered attacks. Anything that creates two independent problems on one move qualifies.",
  },
  deflection: {
    name: "Deflection",
    aliases: ["deflection", "deflect", "deflecting"],
    short:
      "Forcing a defender off the square it's defending, so a follow-up tactic works.",
    detail:
      "Often pairs with a sacrifice — give up material to pull the defender, then strike where it used to guard. The opponent can either accept the deflection or watch the threat land anyway.",
  },
  decoy: {
    name: "Decoy",
    aliases: ["decoy", "decoyed", "decoying"],
    short:
      "Luring an enemy piece (usually the king) onto a bad square where another tactic catches it.",
    detail:
      "Inverse of deflection: deflection pulls a piece away from a duty; decoy pulls a piece onto a fatal square. Decoy sacrifices are the most spectacular in attacking play.",
  },
  zugzwang: {
    name: "Zugzwang",
    aliases: ["zugzwang"],
    short:
      "Any legal move worsens the position. The side to move would prefer to pass — but can't.",
    detail:
      "Mostly an endgame concept. King-and-pawn endings live and die on zugzwang. In the middlegame it's rare, since there are usually too many neutral moves available.",
  },
  "back rank mate": {
    name: "Back rank mate",
    aliases: ["back rank mate", "back rank", "back-rank mate"],
    short:
      "Checkmate on the 8th rank (or 1st, for Black) when the king is trapped by its own pawns and a rook or queen invades.",
    detail:
      "Classic pattern. The defender's own kingside pawns (f, g, h) usually do the trapping — the king has no escape square. Prevention: a luft (h-pawn or g-pawn push to create a hole), or trading off heavy pieces.",
  },
  "smothered mate": {
    name: "Smothered mate",
    aliases: ["smothered mate", "smothered"],
    short:
      "Checkmate where the king is completely surrounded by its own pieces, leaving only a knight check as the killing blow.",
    detail:
      "Only a knight can deliver it — every other piece can be blocked. The Philidor pattern (queen sacrifice on g8, then Nf7#) is the canonical example.",
  },
  overloaded: {
    name: "Overloaded piece",
    aliases: ["overloaded", "overloading", "overworked"],
    short:
      "A defender that's responsible for two things at once. Tactics arise when you attack one duty and the other collapses.",
    detail:
      "Common pattern: a rook defending the back rank AND a knight. Threaten the knight; the rook has to choose. Spotting overloaded defenders is a major source of tactical wins.",
  },
  "en passant": {
    name: "En passant",
    aliases: ["en passant"],
    short:
      "Special pawn capture: if an enemy pawn advances two squares from its starting position and lands beside one of your pawns, you can capture it as if it had only moved one.",
    detail:
      "Must be played on the very next move or the right is lost. The capturing pawn moves diagonally to the square the enemy pawn skipped over. Surprises beginners; load-bearing in many endgames.",
  },
};

// Pre-build the matcher: one alternation across every alias, longest first
// so "checkmate" doesn't get half-matched as "check".
const ALL_ALIASES = Object.entries(CHESS_TERM_GLOSSARY).flatMap(([key, e]) =>
  e.aliases.map((alias) => ({ alias, key })),
);
ALL_ALIASES.sort((a, b) => b.alias.length - a.alias.length);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MATCH_RE = new RegExp(
  `(${ALL_ALIASES.map((a) => escapeRegex(a.alias)).join("|")})`,
  "gi",
);

function aliasToKey(alias: string): string | undefined {
  const lower = alias.toLowerCase();
  return ALL_ALIASES.find((a) => a.alias.toLowerCase() === lower)?.key;
}

export interface GlossifiedTextProps {
  text: string;
}

/** Render a coach-prose string with the first occurrence of each known
 *  chess term swapped for a clickable info chip. */
export function GlossifiedText({ text }: GlossifiedTextProps) {
  const segments = useMemo(() => {
    const out: Array<{ kind: "text" | "term"; value: string; key?: string }> =
      [];
    const seenKeys = new Set<string>();
    let lastIdx = 0;
    const re = new RegExp(MATCH_RE.source, MATCH_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const matched = m[0];
      const key = aliasToKey(matched);
      if (!key) continue;
      if (seenKeys.has(key)) continue;
      if (m.index > lastIdx) {
        out.push({ kind: "text", value: text.slice(lastIdx, m.index) });
      }
      out.push({ kind: "term", value: matched, key });
      seenKeys.add(key);
      lastIdx = m.index + matched.length;
    }
    if (lastIdx < text.length) {
      out.push({ kind: "text", value: text.slice(lastIdx) });
    }
    if (out.length === 0) out.push({ kind: "text", value: text });
    return out;
  }, [text]);

  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "term" && seg.key ? (
          <ChessTermInfo key={i} termKey={seg.key}>
            {seg.value}
          </ChessTermInfo>
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </>
  );
}

interface ChessTermInfoProps {
  termKey: string;
  children: ReactNode;
}

/** Clickable inline term that pops a definition card. */
export function ChessTermInfo({ termKey, children }: ChessTermInfoProps) {
  const entry = CHESS_TERM_GLOSSARY[termKey];
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  if (!entry) return <span>{children}</span>;

  return (
    <>
      <Box
        ref={anchorRef}
        component="span"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        sx={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: "0.18em",
          cursor: "pointer",
          color: "#FFD1A8",
          borderBottom: "1px dotted rgba(255,209,168,0.5)",
          transition: "color 140ms ease, border-color 140ms ease",
          "&:hover": {
            color: "#FFB87C",
            borderBottomColor: "rgba(255,184,124,0.85)",
          },
        }}
      >
        {children}
        <Info
          size={11}
          style={{
            opacity: 0.7,
            transform: "translateY(1px)",
          }}
        />
      </Box>
      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              maxWidth: 340,
              p: 2,
              borderRadius: "1rem",
              background: "rgba(22,18,14,0.92)",
              backdropFilter: "blur(12px) saturate(150%)",
              WebkitBackdropFilter: "blur(12px) saturate(150%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow:
                "0 24px 64px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,122,26,0.18)",
              color: "rgba(255,240,224,0.92)",
            },
          },
        }}
      >
        <Typography
          variant="overline"
          sx={{
            display: "block",
            letterSpacing: "0.18em",
            color: "#FFD1A8",
            fontSize: "0.62rem",
            mb: 0.5,
          }}
        >
          {entry.name}
        </Typography>
        <Typography
          sx={{
            fontSize: "0.86rem",
            lineHeight: 1.45,
            color: "rgba(255,240,224,0.94)",
            mb: 1.25,
          }}
        >
          {entry.short}
        </Typography>
        <Typography
          sx={{
            fontSize: "0.78rem",
            lineHeight: 1.5,
            color: "rgba(255,240,224,0.66)",
          }}
        >
          {entry.detail}
        </Typography>
        {entry.example ? (
          <Typography
            sx={{
              mt: 1.25,
              fontSize: "0.74rem",
              lineHeight: 1.45,
              color: "rgba(255,209,168,0.78)",
              fontStyle: "italic",
            }}
          >
            e.g. {entry.example}
          </Typography>
        ) : null}
      </Popover>
    </>
  );
}
