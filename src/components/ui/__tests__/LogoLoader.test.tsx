import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Loader } from "@/components/ui/Loader";

/**
 * Public-API tests for the 3D bullseye Loader.
 *
 * The repo's vitest env is `node` with no jsdom / testing-library and no JSX
 * transform in test files, so we render via createElement + renderToStaticMarkup
 * and assert against the SSR HTML string. Both components are pure, hookless
 * functions, so this exercises their real render path with zero new deps.
 */

const countOccurrences = (haystack: string, needle: string) =>
  haystack.split(needle).length - 1;

const renderLoader = (props?: Parameters<typeof Loader>[0]) =>
  renderToStaticMarkup(createElement(Loader, props));

describe("Loader", () => {
  it("renders without throwing and shows the default caption", () => {
    const html = renderLoader();
    expect(html).toContain("<div");
    expect(html).toContain("Loading");
  });

  it("shows a custom label", () => {
    const html = renderLoader({ label: "Analyzing" });
    expect(html).toContain("Analyzing");
  });

  it("omits the label text when showLabel={false}", () => {
    const html = renderLoader({ showLabel: false, label: "Loading" });
    expect(html).not.toContain("Loading");
  });

  it("scales with the size prop", () => {
    const html = renderLoader({ size: 120, showLabel: false });
    expect(html).toContain("width:120px");
  });

  it("propagates a custom color into the rendered styles", () => {
    const html = renderLoader({ color: "#123456", showLabel: false });
    // hexA() expands #123456 -> rgba(18,52,86,...) in the glow/shadow styles
    expect(html).toContain("rgba(18,52,86");
  });
});
