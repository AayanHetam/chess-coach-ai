const BASE = "https://chessmasti.com";

// Stable @id identifiers so per-page WebPage/FAQPage/HowTo entities can
// reference the canonical site entities via isPartOf and publisher.
export const ORGANIZATION_ID = `${BASE}/#organization`;
export const WEBSITE_ID = `${BASE}/#website`;
export const SOFTWARE_APP_ID = `${BASE}/#software-app`;

const organization = {
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

const website = {
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
  creator: {
    "@type": "Person",
    name: "Aayan Hetamsaria",
  },
  publisher: { "@id": ORGANIZATION_ID },
};

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
