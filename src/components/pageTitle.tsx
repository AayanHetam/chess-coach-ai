import Head from "next/head";

const SITE_NAME = "Chess Masti AI";
const DEFAULT_DESCRIPTION =
  "Chess Masti AI — engine-grounded chess coaching. Stockfish 17 evaluates first, Claude explains, a hallucination validator checks every claim. 100,000+ Lichess puzzles in a Neo4j graph. Free.";
const DEFAULT_OG_IMAGE = "https://chessmasti.com/social-networks-1200x630.png";
const TWITTER_HANDLE = "@ChessMastiAI";

interface PageTitleProps {
  title: string;
  description?: string;
  url?: string;
  image?: string;
}

export const PageTitle = ({
  title,
  description = DEFAULT_DESCRIPTION,
  url,
  image = DEFAULT_OG_IMAGE,
}: PageTitleProps) => {
  return (
    <Head>
      <title key="title">{title}</title>
      <meta key="description" name="description" content={description} />

      <meta key="og:type" property="og:type" content="website" />
      <meta key="og:site_name" property="og:site_name" content={SITE_NAME} />
      <meta key="og:title" property="og:title" content={title} />
      <meta
        key="og:description"
        property="og:description"
        content={description}
      />
      {url && <meta key="og:url" property="og:url" content={url} />}
      <meta key="og:image" property="og:image" content={image} />
      <meta key="og:image:width" property="og:image:width" content="1200" />
      <meta key="og:image:height" property="og:image:height" content="630" />

      <meta
        key="twitter:card"
        name="twitter:card"
        content="summary_large_image"
      />
      <meta key="twitter:site" name="twitter:site" content={TWITTER_HANDLE} />
      <meta
        key="twitter:creator"
        name="twitter:creator"
        content={TWITTER_HANDLE}
      />
      <meta key="twitter:title" name="twitter:title" content={title} />
      <meta
        key="twitter:description"
        name="twitter:description"
        content={description}
      />
      <meta key="twitter:image" name="twitter:image" content={image} />
    </Head>
  );
};
