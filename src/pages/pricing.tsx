import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Box, Stack, Typography } from "@mui/material";
import { Check, Sparkles, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthDialog } from "@/contexts/AuthDialogContext";
import { useEntitlement } from "@/hooks/useEntitlement";
import { PRICE_DISPLAY } from "@/lib/billing/config";

const orangeGradient = "linear-gradient(135deg, #F97316 0%, #EA580C 100%)";

const FREE_FEATURES = [
  "Play vs the engine + puzzle training",
  "Opening explorer & opponent scout",
  "Save & revisit your games",
  "A few AI-coach analyses every day",
];
const PREMIUM_FEATURES = [
  "Unlimited AI coach game analysis",
  "Unlimited follow-up coaching chat",
  "Interactive puzzle coach on every puzzle",
  "Daily concept micro-lessons",
  "Fact-grounded Mastermind analysis",
];

export default function PricingPage() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { openAuthDialog } = useAuthDialog();
  const { entitlement, isPremium } = useEntitlement();

  const [busy, setBusy] = useState<"checkout" | "portal" | "redeem" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState("");

  // Surface the checkout return state.
  useEffect(() => {
    if (router.query.checkout === "success") {
      setNotice("Thanks for subscribing! Your Premium access is active.");
      void refresh();
    } else if (router.query.checkout === "cancel") {
      setNotice("Checkout canceled — no charge was made.");
    }
  }, [router.query.checkout, refresh]);

  const comped = entitlement?.comped ?? false;
  const hasStripeSub =
    entitlement?.status === "active" ||
    entitlement?.status === "past_due" ||
    entitlement?.status === "canceled";

  const statusLine = useMemo(() => {
    if (!user) return "Sign in to start your free 7-day Premium trial.";
    if (comped) return "You have free Premium access — enjoy! 🎉";
    if (!entitlement) return "";
    if (entitlement.reason === "trialing")
      return `You're on a free trial — ${entitlement.trialDaysRemaining} day${
        entitlement.trialDaysRemaining === 1 ? "" : "s"
      } left.`;
    if (isPremium) return "You're on Premium. Thank you for supporting Chess Masti!";
    return "You're on the Free plan.";
  }, [user, comped, entitlement, isPremium]);

  async function postJson(url: string): Promise<{ url?: string }> {
    const res = await fetch(url, { method: "POST", credentials: "include" });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(d.error || `Request failed (${res.status})`);
    }
    return (await res.json()) as { url?: string };
  }

  const handleUpgrade = async () => {
    if (!user) {
      openAuthDialog();
      return;
    }
    setBusy("checkout");
    setError(null);
    try {
      const { url } = await postJson("/api/stripe/checkout");
      if (url) window.location.href = url;
      else throw new Error("No checkout URL returned.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout.");
      setBusy(null);
    }
  };

  const handleManage = async () => {
    setBusy("portal");
    setError(null);
    try {
      const { url } = await postJson("/api/stripe/portal");
      if (url) window.location.href = url;
      else throw new Error("No portal URL returned.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open billing portal.");
      setBusy(null);
    }
  };

  const handleRedeem = async () => {
    if (!user) {
      openAuthDialog();
      return;
    }
    const trimmed = code.trim();
    if (!trimmed) return;
    setBusy("redeem");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/promo/redeem", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "That code could not be redeemed.");
      setNotice("Code redeemed — you now have free Premium access! 🎉");
      setCode("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code could not be redeemed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Head>
        <title>Pricing — Chess Masti Premium</title>
        <meta
          name="description"
          content={`Chess Masti is free to start. Go unlimited with Premium for ${PRICE_DISPLAY.amount}/month.`}
        />
      </Head>
      <Box
        sx={{
          minHeight: "70vh",
          borderRadius: "1.5rem",
          background:
            "radial-gradient(120% 100% at 50% 0%, rgba(28,30,38,0.95), rgba(10,11,15,0.98))",
          border: "1px solid rgba(255,255,255,0.06)",
          px: { xs: 2, sm: 4 },
          py: { xs: 4, sm: 6 },
          color: "rgba(255,255,255,0.94)",
        }}
      >
        <Stack spacing={1.25} alignItems="center" textAlign="center" sx={{ mb: 4 }}>
          <Typography sx={{ fontSize: { xs: "1.8rem", sm: "2.3rem" }, fontWeight: 800, letterSpacing: "-0.02em" }}>
            Simple pricing. Seriously affordable.
          </Typography>
          <Typography sx={{ fontSize: "1rem", color: "rgba(255,255,255,0.6)", maxWidth: 560 }}>
            Start free with a 7-day Premium trial — no card required. Keep
            unlimited coaching for {PRICE_DISPLAY.amount} a month.
          </Typography>
          {statusLine && (
            <Typography sx={{ fontSize: "0.88rem", color: "#FB923C", fontWeight: 600, mt: 0.5 }}>
              {statusLine}
            </Typography>
          )}
        </Stack>

        {notice && (
          <NoticeBox tone="info" text={notice} />
        )}
        {error && <NoticeBox tone="error" text={error} />}

        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2.5}
          justifyContent="center"
          alignItems="stretch"
          sx={{ maxWidth: 820, mx: "auto" }}
        >
          <PlanCard
            title="Free"
            price="$0"
            cadence="forever"
            features={FREE_FEATURES}
            highlight={false}
            badge={!isPremium && !comped ? "Your plan" : undefined}
          />
          <PlanCard
            title="Premium"
            price={PRICE_DISPLAY.amount}
            cadence={`/ ${PRICE_DISPLAY.cadence}`}
            features={PREMIUM_FEATURES}
            highlight
            badge={isPremium ? "Your plan" : undefined}
            cta={
              comped ? (
                <Typography sx={{ fontSize: "0.86rem", color: "rgba(255,255,255,0.6)", textAlign: "center" }}>
                  Granted free via promo 🎉
                </Typography>
              ) : hasStripeSub ? (
                <CtaButton label={busy === "portal" ? "Opening…" : "Manage subscription"} onClick={handleManage} disabled={busy !== null} />
              ) : (
                <CtaButton
                  label={busy === "checkout" ? "Starting…" : user ? `Upgrade — ${PRICE_DISPLAY.amount}/${PRICE_DISPLAY.cadence}` : "Sign in to upgrade"}
                  onClick={handleUpgrade}
                  disabled={busy !== null}
                />
              )
            }
          />
        </Stack>

        <Typography
          sx={{
            maxWidth: 560,
            mx: "auto",
            mt: 2.5,
            textAlign: "center",
            fontSize: "0.78rem",
            color: "rgba(255,255,255,0.45)",
            lineHeight: 1.5,
          }}
        >
          Premium auto-renews at {PRICE_DISPLAY.amount}/{PRICE_DISPLAY.cadence}{" "}
          until you cancel — cancel anytime from Manage subscription. You&apos;ll
          see the exact amount due today at checkout. See our{" "}
          <Box component="a" href="/terms" sx={{ color: "#FB923C", textDecoration: "none" }}>
            Terms
          </Box>{" "}
          and{" "}
          <Box component="a" href="/privacy" sx={{ color: "#FB923C", textDecoration: "none" }}>
            Privacy Policy
          </Box>
          .
        </Typography>

        {/* Promo redeem */}
        <Box id="redeem" sx={{ maxWidth: 460, mx: "auto", mt: 5 }}>
          <Typography sx={{ fontSize: "0.92rem", fontWeight: 700, mb: 1, textAlign: "center" }}>
            Have a promo code?
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="center">
            <Box
              component="input"
              value={code}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value)}
              placeholder="Enter code"
              sx={{
                flex: 1,
                maxWidth: 240,
                px: 1.5,
                py: 1,
                borderRadius: "10px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.94)",
                fontSize: "0.9rem",
                outline: "none",
                "&:focus": { borderColor: "rgba(249,115,22,0.55)" },
              }}
            />
            <CtaButton
              label={busy === "redeem" ? "Redeeming…" : "Redeem"}
              onClick={handleRedeem}
              disabled={busy !== null || !code.trim()}
              compact
            />
          </Stack>
        </Box>
      </Box>
    </>
  );
}

function NoticeBox({ tone, text }: { tone: "info" | "error"; text: string }) {
  const isError = tone === "error";
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        justifyContent: "center",
        maxWidth: 560,
        mx: "auto",
        mb: 3,
        p: 1.25,
        borderRadius: "10px",
        background: isError ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
        border: `1px solid ${isError ? "rgba(239,68,68,0.25)" : "rgba(34,197,94,0.25)"}`,
      }}
    >
      {isError ? (
        <AlertTriangle size={15} color="#fca5a5" />
      ) : (
        <Check size={15} color="#86efac" />
      )}
      <Typography sx={{ fontSize: "0.84rem", color: isError ? "#fca5a5" : "#86efac" }}>
        {text}
      </Typography>
    </Box>
  );
}

function PlanCard({
  title,
  price,
  cadence,
  features,
  highlight,
  badge,
  cta,
}: {
  title: string;
  price: string;
  cadence: string;
  features: string[];
  highlight: boolean;
  badge?: string;
  cta?: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        position: "relative",
        borderRadius: "1.25rem",
        p: 3,
        background: highlight
          ? "linear-gradient(180deg, rgba(249,115,22,0.10), rgba(20,22,28,0.92))"
          : "linear-gradient(180deg, rgba(22,24,30,0.9), rgba(14,16,22,0.9))",
        border: highlight
          ? "1px solid rgba(249,115,22,0.35)"
          : "1px solid rgba(255,255,255,0.08)",
        boxShadow: highlight ? "0 16px 48px rgba(249,115,22,0.12)" : "none",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {badge && (
        <Box
          sx={{
            position: "absolute",
            top: 16,
            right: 16,
            px: 1,
            py: 0.3,
            borderRadius: "999px",
            fontSize: "0.68rem",
            fontWeight: 700,
            color: "#0A0A0A",
            background: orangeGradient,
          }}
        >
          {badge}
        </Box>
      )}
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
        {highlight && <Sparkles size={16} color="#FB923C" />}
        <Typography sx={{ fontSize: "1rem", fontWeight: 800 }}>{title}</Typography>
      </Stack>
      <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: "1.9rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
          {price}
        </Typography>
        <Typography sx={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)" }}>
          {cadence}
        </Typography>
      </Stack>
      <Stack spacing={1.1} sx={{ flex: 1, mb: 2.5 }}>
        {features.map((f) => (
          <Stack key={f} direction="row" spacing={1} alignItems="flex-start">
            <Check size={15} color={highlight ? "#FB923C" : "rgba(255,255,255,0.5)"} style={{ marginTop: 2, flexShrink: 0 }} />
            <Typography sx={{ fontSize: "0.86rem", color: "rgba(255,255,255,0.82)", lineHeight: 1.4 }}>
              {f}
            </Typography>
          </Stack>
        ))}
      </Stack>
      {cta}
    </Box>
  );
}

function CtaButton({
  label,
  onClick,
  disabled,
  compact,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      sx={{
        width: compact ? "auto" : "100%",
        px: compact ? 2.25 : undefined,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        border: "none",
        outline: "none",
        py: 1.1,
        borderRadius: "12px",
        fontWeight: 700,
        fontSize: "0.9rem",
        color: "#0A0A0A",
        background: orangeGradient,
        boxShadow: "0 6px 18px rgba(249,115,22,0.32)",
        transition: "all 180ms ease",
        "&:hover": disabled
          ? {}
          : { transform: "translateY(-1px)", boxShadow: "0 8px 22px rgba(249,115,22,0.42)" },
      }}
    >
      {label}
    </Box>
  );
}
