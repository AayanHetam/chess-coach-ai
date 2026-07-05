import { describe, it, expect } from "vitest";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  homePageJsonLd,
  ORGANIZATION_ID,
  WEBSITE_ID,
  SOFTWARE_APP_ID,
} from "@/app/_seo/JsonLd";

/**
 * SSR proof that the homepage structured data links into the site-wide @id graph.
 *
 * The repo's vitest env is `node` with no jsdom / testing-library. `next/head`
 * children are NOT surfaced by renderToStaticMarkup, so we cannot prove this by
 * rendering <LandingPage/>. Instead we render the exact same script mapping the
 * homepage uses over the shared `homePageJsonLd` array — the single source of
 * truth for the @id references — and assert against the SSR HTML string.
 */

const countOccurrences = (haystack: string, needle: string) =>
  haystack.split(needle).length - 1;

// Mirror of the mapping in src/pages/index.tsx's <Head>.
const renderHomeJsonLd = () =>
  renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      ...homePageJsonLd.map((node) =>
        createElement("script", {
          key: (node as { "@id": string })["@id"],
          type: "application/ld+json",
          dangerouslySetInnerHTML: { __html: JSON.stringify(node) },
        }),
      ),
    ),
  );

describe("homepage JSON-LD @id graph", () => {
  it("emits plain <script type=application/ld+json> elements", () => {
    const html = renderHomeJsonLd();
    expect(html).toContain('<script type="application/ld+json">');
    // Three nodes: organization, website, software application.
    expect(countOccurrences(html, "<script")).toBe(3);
  });

  it("references the shared ORGANIZATION_ID and SOFTWARE_APP_ID @id constants", () => {
    const html = renderHomeJsonLd();
    expect(html).toContain(`"@id":"${ORGANIZATION_ID}"`);
    expect(html).toContain(`"@id":"${WEBSITE_ID}"`);
    expect(html).toContain(`"@id":"${SOFTWARE_APP_ID}"`);
  });

  it("links the SoftwareApplication to the Organization via a publisher @id reference (not a duplicated inline object)", () => {
    const html = renderHomeJsonLd();
    // publisher is an @id ref, not an inline Organization node.
    expect(html).toContain(`"publisher":{"@id":"${ORGANIZATION_ID}"}`);
  });

  it("carries exactly one Organization node and one WebSite node", () => {
    expect(
      homePageJsonLd.filter((n) => (n as { "@type": string })["@type"] === "Organization"),
    ).toHaveLength(1);
    expect(
      homePageJsonLd.filter((n) => (n as { "@type": string })["@type"] === "WebSite"),
    ).toHaveLength(1);
  });

  it("has a SoftwareApplication node whose @id is the shared SOFTWARE_APP_ID", () => {
    const app = homePageJsonLd.find(
      (n) => (n as { "@type": string })["@type"] === "SoftwareApplication",
    ) as { "@id": string } | undefined;
    expect(app).toBeDefined();
    expect(app?.["@id"]).toBe(SOFTWARE_APP_ID);
  });
});
