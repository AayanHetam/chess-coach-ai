"use client";

/**
 * /partners/chessusa — the preview shell.
 *
 * A sales asset. It shows ChessUSA their creative inside the real Chess Masti
 * page, at real breakpoints, and it is sent to them as a link. Everything on
 * this page that is not the iframe is preview apparatus and is styled to be
 * unmistakably not part of the site: neutral slate, a hazard rule, monospace,
 * none of the brand's orange.
 *
 * WHY AN IFRAME AND NOT A SCALED DIV: a div under `transform: scale()` still
 * reports the PARENT viewport width, so `@media (max-width: 640px)` never
 * fires and the "mobile" preview quietly shows desktop layout at a smaller
 * size. That is the exact failure this page exists to rule out, so the frame
 * carries a real width attribute and the breakpoints are real.
 *
 * Route registration: listed in BARE_ROUTES in src/sections/layout/index.tsx
 * so the site nav and footer do not render around the controls.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import { Box, Stack } from "@mui/material";

import {
  PAGE_FIDELITY,
  PAGE_IDS,
  PAGE_LABELS,
  VARIANT_IDS,
  VARIANT_LABELS,
  isPageId,
  isVariantId,
  type PageId,
  type VariantId,
} from "@/components/ads/previewOptions";

/** Real widths, not approximations: laptop, tablet portrait, iPhone 14/15. */
const DEVICES = [
  { id: "desktop", label: "Desktop", width: 1280 },
  { id: "tablet", label: "Tablet", width: 768 },
  { id: "mobile", label: "Mobile", width: 390 },
] as const;

type DeviceId = (typeof DEVICES)[number]["id"];

const BAR_HEIGHT = 92;

interface ShellProps {
  variant: VariantId;
  page: PageId;
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box
        component="span"
        sx={{
          fontSize: "0.62rem",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.4)",
        }}
      >
        {label}
      </Box>
      <Stack
        direction="row"
        sx={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: "6px",
          overflow: "hidden",
        }}
      >
        {options.map((opt) => {
          const active = opt.id === value;
          return (
            <Box
              key={opt.id}
              component="button"
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.id)}
              sx={{
                cursor: "pointer",
                border: "none",
                font: "inherit",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: "0.72rem",
                fontWeight: active ? 700 : 500,
                px: 1.5,
                py: 0.75,
                background: active ? "#E2E8F0" : "transparent",
                color: active ? "#0F172A" : "rgba(255,255,255,0.7)",
                transition: "background 140ms ease, color 140ms ease",
                "&:hover": {
                  background: active ? "#E2E8F0" : "rgba(255,255,255,0.08)",
                },
              }}
            >
              {opt.label}
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}

export default function PartnerPreviewShell({
  variant: initialVariant,
  page: initialPage,
}: ShellProps) {
  const [variant, setVariant] = useState<VariantId>(initialVariant);
  const [page, setPage] = useState<PageId>(initialPage);
  const [device, setDevice] = useState<DeviceId>("desktop");

  const width = useMemo(
    () => DEVICES.find((d) => d.id === device)?.width ?? 1280,
    [device]
  );

  const frameSrc = useMemo(
    () => `/partners/chessusa/live?v=${variant}&page=${page}`,
    [variant, page]
  );

  /**
   * Keep the shell's own URL in step so the link can be sent pre-set to a
   * creative. history.replaceState rather than router.replace: this page has
   * getServerSideProps, so a Next navigation would round-trip the server and
   * reload the frame for a change the frame does not need.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = `${window.location.pathname}?v=${variant}&page=${page}`;
    window.history.replaceState(window.history.state, "", url);
  }, [variant, page]);

  const onVariant = useCallback((id: VariantId) => setVariant(id), []);
  const onPage = useCallback((id: PageId) => setPage(id), []);
  const onDevice = useCallback((id: DeviceId) => setDevice(id), []);

  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>ChessUSA placement preview — Chess Masti</title>
      </Head>

      {/* ── preview apparatus ────────────────────────────────────────────
          Fixed, walled off, and captioned. Nothing below this bar is on the
          live site, and the bar says so in words rather than relying on the
          viewer to infer it from the styling. */}
      <Box
        component="header"
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 2147483000,
          height: `${BAR_HEIGHT}px`,
          boxSizing: "border-box",
          background: "#0F1115",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          backgroundImage:
            "repeating-linear-gradient(135deg, #FACC15 0 10px, #0F1115 10px 20px)",
          backgroundSize: "100% 4px",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "top left",
          px: { xs: 2, md: 3 },
          pt: "10px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 1,
        }}
      >
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <Box
            sx={{
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "#FACC15",
              whiteSpace: "nowrap",
            }}
          >
            PLACEMENT PREVIEW · NOT LIVE ON CHESSMASTI.COM
          </Box>

          <Segmented
            label="Device"
            options={DEVICES}
            value={device}
            onChange={onDevice}
          />
          <Segmented
            label="Creative"
            options={VARIANT_IDS.map((id) => ({
              id,
              label: VARIANT_LABELS[id],
            }))}
            value={variant}
            onChange={onVariant}
          />
          <Segmented
            label="Page"
            options={PAGE_IDS.map((id) => ({ id, label: PAGE_LABELS[id] }))}
            value={page}
            onChange={onPage}
          />
        </Stack>

        <Box
          sx={{
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: "0.66rem",
            color: "rgba(255,255,255,0.45)",
          }}
        >
          {width}px viewport · {PAGE_FIDELITY[page]} · controls above the rule
          are preview-only and render on no page of the live site
        </Box>
      </Box>

      {/* ── the honest render ──────────────────────────────────────────── */}
      <Box
        sx={{
          position: "fixed",
          inset: `${BAR_HEIGHT}px 0 0 0`,
          background: "#1E2128",
          overflow: "auto",
          display: "flex",
          justifyContent: "center",
          p: 2,
          boxSizing: "border-box",
        }}
      >
        {/* A plain <iframe>, deliberately not <Box component="iframe">: Box
            treats `width` as an MUI system STYLE prop and consumes it, so the
            element ships with no width ATTRIBUTE at all. Verified on the
            rendered HTML, not assumed. The CSS width alone would size the
            frame correctly, but the attribute is what sizes it before CSS
            applies, and this page's whole claim is that the frame is a real
            viewport at a real width. */}
        <iframe
          key={frameSrc}
          src={frameSrc}
          title={`Chess Masti ${PAGE_LABELS[page]} with the ${VARIANT_LABELS[variant]} ChessUSA placement, at ${width}px`}
          width={width}
          style={{
            width: `${width}px`,
            minWidth: `${width}px`,
            height: "100%",
            minHeight: 0,
            flexShrink: 0,
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: "4px",
            background: "#08090C",
            display: "block",
          }}
        />
      </Box>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ShellProps> = async (
  ctx
) => {
  ctx.res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const rawVariant = ctx.query.v;
  const rawPage = ctx.query.page;
  const v = Array.isArray(rawVariant) ? rawVariant[0] : rawVariant;
  const p = Array.isArray(rawPage) ? rawPage[0] : rawPage;
  return {
    props: {
      variant: isVariantId(v) ? v : "editorial",
      page: isPageId(p) ? p : "home",
    },
  };
};
