import type { GetServerSideProps } from "next";

import { PARTNER_COOKIE, PARTNER_ATTR } from "@/components/ads/PartnerSlot";
import { isTurnTwoId } from "@/components/ads/chessusaTurn2";

/**
 * /partners/chessusa/1 · /2 · /3 · /off
 *
 * The three links we send ChessUSA. Each one switches the sitewide slot to one
 * of the Turn-2 creatives and drops the viewer on the homepage, so they can
 * browse the real site with that option in place rather than judge it in a
 * frame. /off clears it.
 *
 *   1 → 2a Board Party
 *   2 → 2b Sticker
 *   3 → 2c Neon Board
 *
 * The switch is a cookie on the viewer's own browser, not a site setting: this
 * changes nothing for anyone who has not opened one of these links. See the
 * header of PartnerSlot.tsx for why it is built that way.
 *
 * `live` is a static sibling route, so Next resolves /partners/chessusa/live to
 * live.tsx rather than here. Anything else 404s rather than silently doing
 * nothing, so a mistyped link in a sales email fails loudly.
 */

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days, the length of the pitch

export default function PartnerOptionRoute() {
  // Never rendered: getServerSideProps always redirects.
  return null;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const raw = ctx.params?.option;
  const option = Array.isArray(raw) ? raw[0] : raw;

  const clearing = option === "off";
  if (!clearing && !isTurnTwoId(option)) return { notFound: true };

  // Vercel terminates TLS, so trust the forwarded proto and fall back to the
  // request's own encryption for a direct `next start`.
  const proto =
    (ctx.req.headers["x-forwarded-proto"] as string | undefined) ??
    ("encrypted" in ctx.req.socket && ctx.req.socket.encrypted
      ? "https"
      : "http");

  const attrs = [
    `Path=/`,
    `SameSite=Lax`,
    proto === "https" ? "Secure" : "",
    clearing ? "Max-Age=0" : `Max-Age=${MAX_AGE_SECONDS}`,
  ].filter(Boolean);

  // Readable by script on purpose: the boot script in _document reads it
  // before first paint to size the slot, which is what keeps the banner from
  // shifting the page when it mounts. Nothing sensitive is in it.
  ctx.res.setHeader(
    "Set-Cookie",
    `${PARTNER_COOKIE}=${clearing ? "" : option}; ${attrs.join("; ")}`
  );
  ctx.res.setHeader("X-Robots-Tag", "noindex, nofollow");
  // The response varies on the cookie it just set, and it is a redirect that
  // must not be served from a shared cache to the next visitor.
  ctx.res.setHeader("Cache-Control", "private, no-store");

  return { redirect: { destination: "/", permanent: false } };
};
