// The chess-basics page, as the site ships it.
//
// The page exists because a reader said the site lacked exactly this. Two
// things about it must hold whatever the copy says: every fact on it names a
// source someone actually fetched, and nothing marked unverified reaches a
// learner — a wrong rating floor on a page called "basics" is worse than no
// page. The rest is structure the nav and the sitemap depend on.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import sitemap from "@/app/sitemap";
import ChessBasicsPage from "@/app/chess-basics/page";
import { BASICS } from "@/app/chess-basics/content";

const html = renderToStaticMarkup(<ChessBasicsPage />);

describe("/chess-basics", () => {
  it("covers the four things the reader asked for, in that order", () => {
    expect(BASICS.sections.map((s) => s.id)).toEqual(["organised", "time", "rating", "titles"]);
    for (const s of BASICS.sections) expect(html).toContain(s.heading);
  });

  it("names a fetched official source for every section", () => {
    for (const s of BASICS.sections) {
      const fetched = s.sources.filter((x) => x.fetched);
      expect(fetched.length, s.id).toBeGreaterThan(0);
      for (const x of fetched) expect(x.url, s.id).toMatch(/^https:\/\//);
    }
  });

  it("ships no claim it could not verify", () => {
    expect(html).not.toMatch(/unverified|TODO|\[citation/i);
  });

  it("dates its own checking", () => {
    expect(BASICS.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(html).toContain(`Last checked on ${BASICS.checkedOn}`);
  });

  it("marks every outbound link as such", () => {
    const anchors = html.match(/<a [^>]*href="https?:\/\/[^"]+"[^>]*>/g) ?? [];
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      if (a.includes("chessmasti.com")) continue;
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer"');
    }
  });

  it("is in the sitemap", () => {
    expect(sitemap().map((e) => new URL(e.url).pathname)).toContain("/chess-basics");
  });
});
