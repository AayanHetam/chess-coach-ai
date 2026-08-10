import type { GetServerSideProps } from "next";

/**
 * /preview/launch — server-side 308 redirect to / after the homepage
 * cutover (2026-08-09). The dark Obsidian-Glass landing that used to live
 * here is now the canonical homepage at /.
 *
 * 308 preserves the request method and is permanent — search engines +
 * AI crawlers will treat / as the new canonical URL. Query string is
 * preserved verbatim so any deep links keep working.
 *
 * Kept as a redirect (not deleted) because the in-app logo links pointed
 * here until this cutover; cached share-card URLs and bookmarks may
 * reference /preview/launch until they expire.
 */

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const queryString = ctx.req.url?.split("?")[1] ?? "";
  const destination = queryString ? `/?${queryString}` : "/";
  return {
    redirect: {
      destination,
      permanent: true,
    },
  };
};

// Required by Next.js even though we never render — getServerSideProps
// always returns a redirect.
export default function PreviewLaunchRedirect() {
  return null;
}
