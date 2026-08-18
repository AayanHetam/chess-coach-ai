import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AgeGate from "../AgeGate";

describe("signup consent gate", () => {
  it("starts unchecked and exposes the existing legal pages as new-tab links", () => {
    const html = renderToStaticMarkup(<AgeGate onConfirmed={() => {}} />);

    expect(html).toContain("I confirm that I am at least 13 years old");
    expect(html).not.toContain('checked=""');
    expect(html).toContain('disabled=""');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('target="_blank"');
  });
});
