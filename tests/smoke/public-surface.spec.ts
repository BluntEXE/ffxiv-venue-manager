import { test, expect } from "@playwright/test"

// Smoke suite for prod public surfaces. These run unauthenticated so the
// CI job needs no secrets, and the assertions are deliberately loose: we
// catch whole-deploy regressions (build broke, container down, route
// allowlist regressed, CDN misconfigured), not pixel-level UI changes.

test.describe("public surfaces", () => {
  test("landing page renders with live stats", async ({ page }) => {
    const response = await page.goto("/")
    expect(response?.status()).toBe(200)

    await expect(page).toHaveTitle(/XIV Venue Manager/)

    // The four landing-strip tiles read from /api/stats. If the SSR fetch
    // breaks they fall back to em-dashes; assert the labels render so we
    // know the section is present even on a fallback.
    await expect(page.getByText("Active venues", { exact: true })).toBeVisible()
    await expect(page.getByText("Events tracked", { exact: true })).toBeVisible()
    await expect(page.getByText("Gil tracked", { exact: true })).toBeVisible()
    await expect(page.getByText("Last activity", { exact: true })).toBeVisible()

    await expect(page.getByRole("link", { name: /See full usage stats/i })).toBeVisible()
  })

  test("/stats page renders without console errors", async ({ page }) => {
    const consoleErrors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text())
    })

    const response = await page.goto("/stats")
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle(/Usage stats/)

    await expect(page.getByRole("heading", { name: /Real venues/i })).toBeVisible()
    await expect(page.getByText("Live data", { exact: true })).toBeVisible()
    await expect(page.getByText("All-time totals", { exact: true })).toBeVisible()

    expect(consoleErrors, "console errors on /stats").toEqual([])
  })

  test("/api/stats returns the expected JSON shape", async ({ request }) => {
    const response = await request.get("/api/stats")
    expect(response.status()).toBe(200)

    const body = await response.json()
    // Spot-check the keys and types; do not assert on values, those drift.
    for (const key of [
      "venuesTotal",
      "venuesActive30d",
      "pluginInstalls",
      "eventsTotal",
      "patronEntriesTotal",
      "salesTotal",
      "shiftsTotal",
      "tasksCompleted",
      "partakeEventsSynced",
      "gilTracked",
      "dataCenters",
    ] as const) {
      expect(typeof body[key], `key ${key}`).toBe("number")
    }
    expect(body.generatedAt, "generatedAt").toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test("auth signin page is reachable (no redirect loop)", async ({ page }) => {
    const response = await page.goto("/auth/signin")
    expect(response?.status()).toBe(200)
    await expect(page.getByRole("button", { name: /Discord/i })).toBeVisible()
  })
})
