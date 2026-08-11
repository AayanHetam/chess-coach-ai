import type { Page } from "@playwright/test";

/** Relative luminance (0=black, 1=white) of the computed body background. */
export async function bodyLuminance(page: Page): Promise<number> {
  return page.evaluate(() => {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
    if (!m) return 1;
    return (0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2]) / 255;
  });
}

/** Pixels of horizontal overflow — >1 means the page scrolls sideways. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
}

/** A DOB string (yyyy-mm-dd) for someone `years` old today. */
export function dobYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 1); // safely past the birthday
  return d.toISOString().slice(0, 10);
}
