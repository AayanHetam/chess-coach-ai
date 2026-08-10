import type { GetServerSideProps } from "next";

/**
 * /preview/placement — server-side 308 redirect to /placement after the preview
 * cleanup (2026-08-10). Same pattern as /preview/analysis and
 * /preview/launch: permanent, query string preserved, kept as a redirect
 * (not deleted) so old bookmarks and cached links don't 404.
 */

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const queryString = ctx.req.url?.split("?")[1] ?? "";
  const destination = queryString ? "/placement?" + queryString : "/placement";
  return {
    redirect: {
      destination,
      permanent: true,
    },
  };
};

// Required by Next.js even though we never render — getServerSideProps
// always returns a redirect.
export default function PreviewPlacementRedirect() {
  return null;
}
