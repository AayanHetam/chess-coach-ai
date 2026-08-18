# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: prod/smoke.spec.ts >> prod signup API enforces the age affirmation
- Location: tests/e2e/prod/smoke.spec.ts:69:5

# Error details

```
Error: expect(received).toMatch(expected)

Expected pattern: /date of birth/i
Received string:  "Please confirm you're 13 or older to sign up."
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { bodyLuminance } from "../helpers";
  3  | 
  4  | /**
  5  |  * Read-only production smoke. Never creates or mutates data: bad-credential
  6  |  * signin, redirect handoffs, health endpoints.
  7  |  *
  8  |  * RUNS DAILY via .github/workflows/prod-smoke.yml, plus on demand. It said
  9  |  * "nightly heartbeat + manual" for eight days while running in NO workflow at
  10 |  * all — the heartbeat is curl-only and never invoked Playwright. That is how
  11 |  * PR #332's copy change sat here red against a healthy site, found by hand.
  12 |  *
  13 |  * Keep the cheap assertions in the heartbeat, which runs hourly for free.
  14 |  * What belongs HERE is only what needs a browser: that pages render, and that
  15 |  * errors reach the screen.
  16 |  *
  17 |  * Run with: E2E_NO_SERVER=1 npx playwright test --project=prod-smoke
  18 |  */
  19 | 
  20 | test("prod /api/version serves a commit SHA", async ({ request }) => {
  21 |   const res = await request.get("/api/version");
  22 |   expect(res.status()).toBe(200);
  23 |   const body = await res.json();
  24 |   expect(body.sha).toMatch(/^[a-f0-9]{40}$/);
  25 |   expect(body.env).toBe("production");
  26 | });
  27 | 
  28 | test("prod landing is dark with hero visible (light-preference)", async ({
  29 |   page,
  30 | }) => {
  31 |   await page.goto("/");
  32 |   await expect(page.locator("h1")).toContainText(/chess coaching/i, {
  33 |     timeout: 20_000,
  34 |   });
  35 |   expect(await bodyLuminance(page)).toBeLessThan(0.2);
  36 | });
  37 | 
  38 | test("prod signin surfaces a clear error for bad credentials", async ({
  39 |   page,
  40 | }) => {
  41 |   await page.goto("/");
  42 |   await page
  43 |     .getByRole("button", { name: /sign in/i })
  44 |     .first()
  45 |     .click();
  46 |   await page
  47 |     .getByLabel(/handle or email|^email$/i)
  48 |     .fill("heartbeat-probe@example.com");
  49 |   await page.getByLabel("Password").fill("definitely-wrong-1!");
  50 |   await page.getByRole("button", { name: /^sign in$/i }).click();
  51 |   // Wording tolerant on purpose. PR #332 changed this copy to "Invalid handle,
  52 |   // email or password." and left this spec asserting the old string — the
  53 |   // hourly heartbeat runs prod-smoke, so it went red against a healthy site.
  54 |   // What the probe actually cares about is that ONE generic rejection comes
  55 |   // back (no enumeration oracle), not the exact sentence.
  56 |   await expect(
  57 |     page.getByText(/invalid (handle, )?email or password/i)
  58 |   ).toBeVisible({ timeout: 15_000 });
  59 | });
  60 | 
  61 | test("prod Google OAuth start hands off to Google", async ({ request }) => {
  62 |   const res = await request.get("/api/auth/google/start?returnTo=/", {
  63 |     maxRedirects: 0,
  64 |   });
  65 |   expect(res.status()).toBe(307);
  66 |   expect(res.headers()["location"]).toContain("accounts.google.com");
  67 | });
  68 | 
  69 | test("prod signup API enforces the age affirmation", async ({ request }) => {
  70 |   const res = await request.post("/api/auth/signup", {
  71 |     data: {
  72 |       email: "heartbeat-probe@example.com",
  73 |       password: "Longenough1!pass",
  74 |     },
  75 |   });
  76 |   expect(res.status()).toBe(400);
  77 |   const body = await res.json();
> 78 |   expect(body.error).toMatch(/date of birth/i);
     |                      ^ Error: expect(received).toMatch(expected)
  79 | });
  80 | 
  81 | test("prod config health reports no missing env", async ({ request }) => {
  82 |   const res = await request.get("/api/health/config");
  83 |   expect(res.status()).toBe(200);
  84 |   const body = await res.json();
  85 |   expect(body.ok).toBe(true);
  86 |   expect(body.missing).toEqual([]);
  87 | });
  88 | 
```