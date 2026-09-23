"use client";

import { useState } from "react";
import { Box, Typography } from "@mui/material";
import Link from "next/link";
import { Check } from "lucide-react";
import { MastiAvatar } from "@/components/masti";
import type { Churn } from "@/lib/repertoire/store";
import { measuredFor } from "@/lib/repertoire/yourTree";
import type { archiveAccountFor, useYourTree } from "@/lib/repertoire/useYourTree";
import { ChurnQuestion } from "./Quiz";
import { EMBER, FOCUS, GOOD, ROSE } from "./tokens";

export interface YourGamesCardProps {
  state: ReturnType<typeof useYourTree>;
  account: ReturnType<typeof archiveAccountFor>;
  side: "white" | "black";
  churn: Churn | null;
  onAnswerChurn: (churn: Churn) => void;
}

/**
 * "These numbers are not yours yet."
 *
 * Every share on the page is a corpus share until this is pressed, and the
 * label says whose games they are. Opt-in, never automatic: reading twelve
 * months of somebody's archive because they opened a page is not a thing to
 * do to them without asking.
 */
export function YourGamesCard({ state, account, side, churn, onAnswerChurn }: YourGamesCardProps) {
  const enough = measuredFor(state.tree, side);
  const counted = state.tree?.games[side] ?? 0;
  // Asked once, between pressing the button and the fetch going out: a
  // statement about appetite, which needs nothing from the archive.
  const [asking, setAsking] = useState(false);
  const begin = () => (churn === null ? setAsking(true) : state.run());
  const answer = (value: Churn) => {
    setAsking(false);
    onAnswerChurn(value);
    state.run();
  };

  if (asking) return <ChurnQuestion onAnswer={answer} onCancel={() => setAsking(false)} />;

  // No handle stored is the ordinary state for somebody who signed up over
  // the board, not an error.
  if (!account) {
    return (
      <Note>
        Add your Lichess or Chess.com username on{" "}
        <Box component={Link} href="/profile" sx={{ color: EMBER, textDecoration: "underline" }}>
          your profile
        </Box>{" "}
        and these numbers become yours.
      </Note>
    );
  }

  if (state.phase === "loading") {
    return <Note>Reading your last 12 months on {account.platform}…</Note>;
  }

  if (state.phase === "error") {
    return (
      <Note tone="warn">
        {state.error} <Retry onClick={begin}>Try again</Retry>
      </Note>
    );
  }

  if (state.phase === "ready" && enough) {
    return (
      <Note tone="good">
        Measured from {counted.toLocaleString()} of your own games as {side === "white" ? "White" : "Black"}.{" "}
        <Retry onClick={state.run}>Refresh</Retry>
      </Note>
    );
  }

  // Ready, but this colour is too thin to divide by. Say which, rather than
  // silently falling back to the corpus.
  if (state.phase === "ready") {
    const colour = side === "white" ? "White" : "Black";
    return (
      <Note>
        {/* Zero is its own sentence: "Only 0 of your games" reads like a bug. */}
        {counted === 0
          ? `None of the games we read were yours as ${colour}, so these are still the corpus average. `
          : `Only ${counted.toLocaleString()} of your games as ${colour}, too few to work out your own frequencies, so these are still the corpus average. `}
        <Retry onClick={state.run}>Refresh</Retry>
      </Note>
    );
  }

  return (
    <Note>
      Make these numbers yours. <Retry onClick={begin}>Use my last 12 months</Retry>
    </Note>
  );
}

function Note({ children, tone }: { children: React.ReactNode; tone?: "good" | "warn" }) {
  // Warnings wear rose; danger has its own colour and ember stays for actions.
  const colour = tone === "good" ? GOOD : tone === "warn" ? ROSE.bright : "rgba(255,255,255,0.5)";
  return (
    <Typography
      sx={{ mb: 2, fontSize: "0.8rem", lineHeight: 1.6, color: colour, display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}
    >
      {tone === "good" && <Check size={13} aria-hidden />}
      {tone === "warn" && <MastiAvatar mood="nervous" size={18} ring={false} />}
      <span>{children}</span>
    </Typography>
  );
}

function Retry({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 44,
        px: 1,
        ml: -1,
        appearance: "none",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: EMBER,
        fontSize: "0.8rem",
        fontWeight: 600,
        textDecoration: "underline",
        textUnderlineOffset: 3,
        borderRadius: "8px",
        "&:hover": { color: "#fff" },
        ...FOCUS,
      }}
    >
      {children}
    </Box>
  );
}

export default YourGamesCard;
