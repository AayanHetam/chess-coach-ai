"use client";

import { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

/**
 * /preview/practice was a static chessground marketing demo with an unwired
 * (non-functional) solve loop — the only chessground-based puzzle surface left.
 * It's superseded by the real, functional /preview/puzzles, so this redirects
 * there (retiring chessground from puzzle surfaces entirely). Kept as a route
 * so any existing links resolve.
 */
export default function PreviewPracticeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/preview/puzzles");
  }, [router]);
  return (
    <Head>
      <title key="title">Puzzle Coach · Chess Masti</title>
    </Head>
  );
}
