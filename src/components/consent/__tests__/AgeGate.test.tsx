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

  it("offers the email opt-in as a second, clearly optional checkbox", () => {
    const html = renderToStaticMarkup(<AgeGate onConfirmed={() => {}} />);

    expect(html).toContain("Email me chess tips and updates");
    expect(html).toContain("(Optional)");
    // Two checkboxes, both starting unchecked; the Continue button stays
    // disabled (gated by the 13+ affirmation alone, asserted above).
    expect(html.match(/type="checkbox"/g)?.length).toBe(2);
    // The opt-in label must never satisfy the e2e locator for the required
    // box (/at least 13 years old/i) — one "at least 13" per gate.
    expect(html.match(/at least 13 years old/g)?.length).toBe(1);
  });
});
