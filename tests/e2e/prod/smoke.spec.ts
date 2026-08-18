import { test, expect } from "@playwright/test";
import { bodyLuminance } from "../helpers";

/**
 * Read-only production smoke (nightly heartbeat + manual). Never creates or
 * mutates data: bad-credential signin, redirect handoffs, health endpoints.
 * Run with: E2E_NO_SERVER=1 npx playwright test --project=prod-smoke
 */

test("prod /api/version serves a commit SHA", async ({ request }) => {
  const res = await request.get("/api/version");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.sha).toMatch(/^[a-f0-9]{40}$/);
  expect(body.env).toBe("production");
});

test("prod landing is dark with hero visible (light-preference)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText(/chess coaching/i, {
    timeout: 20_000,
  });
  expect(await bodyLuminance(page)).toBeLessThan(0.2);
});

test("prod signin surfaces a clear error for bad credentials", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /sign in/i })
    .first()
    .click();
  await page
    .getByLabel(/handle or email|^email$/i)
    .fill("heartbeat-probe@example.com");
  await page.getByLabel("Password").fill("definitely-wrong-1!");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  // Wording tolerant on purpose. PR #332 changed this copy to "Invalid handle,
  // email or password." and left this spec asserting the old string — the
  // hourly heartbeat runs prod-smoke, so it went red against a healthy site.
  // What the probe actually cares about is that ONE generic rejection comes
  // back (no enumeration oracle), not the exact sentence.
  await expect(
    page.getByText(/invalid (handle, )?email or password/i)
  ).toBeVisible({ timeout: 15_000 });
});

test("prod Google OAuth start hands off to Google", async ({ request }) => {
  const res = await request.get("/api/auth/google/start?returnTo=/", {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toContain("accounts.google.com");
});

test("prod signup API enforces the age affirmation", async ({ request }) => {
  const res = await request.post("/api/auth/signup", {
    data: {
      email: "heartbeat-probe@example.com",
      password: "Longenough1!pass",
    },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  // Matches the age-affirmation message on both sides of a deploy: the old
  // copy said "date of birth", the current copy says "13 or older".
  expect(body.error).toMatch(/confirm.*to sign up/i);
});

test("prod config health reports no missing env", async ({ request }) => {
  const res = await request.get("/api/health/config");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.missing).toEqual([]);
});
