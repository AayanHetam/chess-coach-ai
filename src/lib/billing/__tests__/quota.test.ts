import { describe, it, expect } from "vitest";
import { dateKeyUTC } from "../quota";

describe("dateKeyUTC", () => {
  it("formats epoch ms as a UTC YYYY-MM-DD key", () => {
    // 1_700_000_000_000 = 2023-11-14T22:13:20.000Z
    expect(dateKeyUTC(1_700_000_000_000)).toBe("2023-11-14");
  });

  it("rolls to the next day at UTC midnight", () => {
    const utcMidnight = Date.UTC(2026, 5, 22, 0, 0, 0); // 2026-06-22T00:00:00Z
    expect(dateKeyUTC(utcMidnight)).toBe("2026-06-22");
    expect(dateKeyUTC(utcMidnight - 1)).toBe("2026-06-21");
  });
});
