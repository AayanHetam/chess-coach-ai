"use client";

import { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

/**
 * /learn is superseded by /plan (the calendar home). Kept as a permanent
 * redirect so any existing links / bookmarks / onboarding deep-links resolve.
 */
export default function LearnRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/plan");
  }, [router]);
  return (
    <Head>
      <title key="title">Your plan — Chess Masti AI</title>
    </Head>
  );
}
