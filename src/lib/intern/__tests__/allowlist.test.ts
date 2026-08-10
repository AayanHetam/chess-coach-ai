import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isAllowlistedIntern,
  __resetAllowlistCacheForTests,
} from "../allowlist";
import { getInternSupabase } from "../supabase";

vi.mock("../supabase", () => ({
  getInternSupabase: vi.fn(),
}));

const mockedGetInternSupabase = vi.mocked(getInternSupabase);

function supabaseReturning(result: { data: unknown; error: { message: string } | null }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => result,
        }),
      }),
    }),
  } as unknown as Awaited<ReturnType<typeof getInternSupabase>>;
}

describe("isAllowlistedIntern", () => {
  beforeEach(() => {
    __resetAllowlistCacheForTests();
    vi.clearAllMocks();
  });

  it("returns false for empty email without touching Supabase", async () => {
    await expect(isAllowlistedIntern("")).resolves.toBe(false);
    expect(mockedGetInternSupabase).not.toHaveBeenCalled();
  });

  it("returns true for an allowlisted email", async () => {
    mockedGetInternSupabase.mockResolvedValue(
      supabaseReturning({ data: { email: "intern@x.com" }, error: null })
    );
    await expect(isAllowlistedIntern("Intern@X.com")).resolves.toBe(true);
  });

  it("returns false when the email is not on the allowlist", async () => {
    mockedGetInternSupabase.mockResolvedValue(
      supabaseReturning({ data: null, error: null })
    );
    await expect(isAllowlistedIntern("someone@x.com")).resolves.toBe(false);
  });

  it("fails closed (false) on a Supabase query error", async () => {
    mockedGetInternSupabase.mockResolvedValue(
      supabaseReturning({ data: null, error: { message: "boom" } })
    );
    await expect(isAllowlistedIntern("someone@x.com")).resolves.toBe(false);
  });

  it("fails closed (false, no throw) when getInternSupabase throws — e.g. SUPABASE_URL unset", async () => {
    // This is the bug that bricked new-user signup: the config throw from
    // assertAuthSecrets({needsSupabase:true}) escaped to the auth routes'
    // generic 500 handlers AFTER the user doc was already created.
    mockedGetInternSupabase.mockRejectedValue(
      new Error("Missing required auth env: SUPABASE_URL")
    );
    await expect(isAllowlistedIntern("newuser@x.com")).resolves.toBe(false);
  });

  it("does not cache failure results", async () => {
    mockedGetInternSupabase.mockRejectedValueOnce(new Error("transient"));
    await expect(isAllowlistedIntern("intern@x.com")).resolves.toBe(false);

    mockedGetInternSupabase.mockResolvedValue(
      supabaseReturning({ data: { email: "intern@x.com" }, error: null })
    );
    await expect(isAllowlistedIntern("intern@x.com")).resolves.toBe(true);
  });
});
