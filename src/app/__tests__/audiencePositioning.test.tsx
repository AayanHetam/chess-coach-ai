import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { homePageJsonLd } from "@/app/_seo/JsonLd";
import { metadata as indiaMetadata } from "@/app/ai-chess-coach-for-india/page";
import PrivacyPage from "@/app/privacy/page";
import sitemap from "@/app/sitemap";
import TermsPage from "@/app/terms/page";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal/versions";

const root = process.cwd();
const retiredKidsRoute = "/ai-chess-coach-for-kids";

function pageText(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

describe("13+ public audience positioning", () => {
  it("removes the former kids route", () => {
    expect(
      fs.existsSync(path.join(root, "src/app/ai-chess-coach-for-kids/page.tsx"))
    ).toBe(false);
  });

  it("does not publish the former kids route in the sitemap", () => {
    expect(sitemap().map((entry) => new URL(entry.url).pathname)).not.toContain(
      retiredKidsRoute
    );
  });

  it("does not advertise an under-13 audience in active metadata or structured data", () => {
    const discoveryData = JSON.stringify({
      indiaMetadata,
      homePageJsonLd,
      indiaSource: fs.readFileSync(
        path.join(root, "src/app/ai-chess-coach-for-india/page.tsx"),
        "utf8"
      ),
      homepageSource: fs.readFileSync(
        path.join(root, "src/pages/index.tsx"),
        "utf8"
      ),
      analysisMetadataSource: fs.readFileSync(
        path.join(root, "src/components/preview-analysis/AnalysisImpl.tsx"),
        "utf8"
      ),
    });

    expect(discoveryData).not.toMatch(
      /AI Chess Coach for Kids|kid-friendly|parent-friendly|9-year-old|school students|kid in Pune|after-school/i
    );
    expect(discoveryData).not.toContain(retiredKidsRoute);
  });

  it("states the 13+ rule and lack of an informal parental exception in Terms", () => {
    const text = pageText(<TermsPage />);

    expect(text).toContain("Last updated August 21, 2026.");
    expect(text).toContain(
      "You must be at least 13 years old to use Chess Masti."
    );
    expect(text).toContain(
      "Children under 13 may not create an account or use the service."
    );
    expect(text).toContain(
      "Permission from a parent or guardian does not create an exception."
    );
    expect(text).toContain(
      "Chess Masti does not currently operate a verified parental-consent system for users under 13."
    );
  });

  it("states the 13+ privacy position and discloses saved-chat content", () => {
    const text = pageText(<PrivacyPage />);

    expect(text).toContain("Last updated August 21, 2026.");
    expect(text).toContain(
      "Chess Masti is intended for users aged 13 and older."
    );
    expect(text).toContain(
      "We do not knowingly collect personal information from children under 13."
    );
    expect(text).toContain(
      "when you choose to save a coaching chat, its chat record, related game reference, and user and assistant message content are stored with your account in Firestore"
    );
    expect(text).not.toContain("without a parent's involvement");
  });

  it("publishes the new signup document versions", () => {
    expect(TERMS_VERSION).toBe("2026-08-21");
    expect(PRIVACY_VERSION).toBe("2026-08-21");
  });
});
