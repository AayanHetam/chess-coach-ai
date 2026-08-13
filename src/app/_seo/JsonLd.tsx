const BASE = "https://chessmasti.com";

// Stable @id identifiers so per-page WebPage/FAQPage/HowTo entities can
// reference the canonical site entities via isPartOf and publisher.
export const ORGANIZATION_ID = `${BASE}/#organization`;
export const WEBSITE_ID = `${BASE}/#website`;
export const SOFTWARE_APP_ID = `${BASE}/#software-app`;

export const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: "Chess Masti AI",
  url: BASE,
  logo: `${BASE}/logo.svg`,
  founder: {
    "@type": "Person",
    name: "Aayan Hetamsaria",
  },
};

export const website = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  name: "Chess Masti AI",
  url: BASE,
  description:
    "Free engine-first AI chess coach: Stockfish analysis, Claude explanations, validated chess claims, mistake-based puzzles, and opponent scouting.",
  publisher: { "@id": ORGANIZATION_ID },
};

const softwareApplication = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": SOFTWARE_APP_ID,
  name: "Chess Masti AI",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  url: BASE,
  description:
    "Free AI chess coach combining Stockfish engine analysis with Claude AI explanations. Analyze games, train from your mistakes, and scout opponents — free.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  creator: {
    "@type": "Person",
    name: "Aayan Hetamsaria",
  },
  publisher: { "@id": ORGANIZATION_ID },
};

// Homepage-specific SoftwareApplication node. Same @id as `softwareApplication`
// so the Pages Router homepage graph merges into the site-wide entity instead of
// forming a disconnected island. Richer (featureList) and links to the shared
// Organization via publisher @id reference.
export const homeSoftwareApplication = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": SOFTWARE_APP_ID,
  name: "Chess Masti AI",
  url: BASE,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  description:
    "Free conversational chess coaching: Stockfish 17 evaluates, Claude explains, a hallucination validator checks every claim, and adaptive puzzles come from a 100,000+ position Neo4j graph.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Engine-grounded coaching using Stockfish 17 WASM",
    "Two-tier Anthropic Claude (Sonnet for analysis, Haiku for chat)",
    "Hallucination validator backed by chess.js",
    "Maia-2 humanlike opponent (Twin Bot)",
    "Adaptive puzzles from a 100,000+ position Neo4j graph",
    "FEN cosine-similarity puzzle re-ranking",
    "Lichess OAuth 2.0 PKCE live play",
    "Opponent scouting with a Tells readout",
  ],
  creator: { "@type": "Person", name: "Aayan Hetamsaria" },
  publisher: { "@id": ORGANIZATION_ID },
};

// Node set the (Pages Router) homepage emits. Reuses the shared organization +
// website nodes so their @id identities match the site-wide SiteJsonLd graph.
export const homePageJsonLd = [organization, website, homeSoftwareApplication];

function JsonLdScript({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function SiteJsonLd() {
  return (
    <>
      <JsonLdScript data={organization} />
      <JsonLdScript data={website} />
      <JsonLdScript data={softwareApplication} />
    </>
  );
}
