import { describe, it, expect, vi, afterEach } from "vitest"
import { priorityToInt, intToPriority, resolveCategoryId } from "./task-convert"

describe("priorityToInt / intToPriority round-trip", () => {
  it.each([
    ["LOW", 0],
    ["MEDIUM", 1],
    ["HIGH", 2],
    ["URGENT", 3],
  ] as const)("%s <-> %d", (label, int) => {
    expect(priorityToInt(label)).toBe(int)
    expect(intToPriority(int)).toBe(label)
  })
})

function mockFetchSequence(responses: Array<{ ok: boolean; status: number; body?: unknown }>) {
  const fn = vi.fn()
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok,
      status: r.status,
      text: async () => (r.body === undefined ? "" : JSON.stringify(r.body)),
      json: async () => r.body,
    })
  }
  vi.stubGlobal("fetch", fn)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("resolveCategoryId", () => {
  it("returns the existing category's id on a case-insensitive name match", async () => {
    mockFetchSequence([{ ok: true, status: 200, body: [{ id: 5, name: "Setup", sort_order: 0 }] }])
    const id = await resolveCategoryId("token", "venue-1", "setup")
    expect(id).toBe(5)
  })

  it("creates a new category when no match exists", async () => {
    mockFetchSequence([
      { ok: true, status: 200, body: [] },
      { ok: true, status: 201, body: { id: 9, name: "Promo", sort_order: 0 } },
    ])
    const id = await resolveCategoryId("token", "venue-1", "Promo")
    expect(id).toBe(9)
  })

  it("refetches and uses the winner on a 409 race", async () => {
    mockFetchSequence([
      { ok: true, status: 200, body: [] },
      { ok: false, status: 409, body: { detail: "A category with this name already exists." } },
      { ok: true, status: 200, body: [{ id: 3, name: "Cleanup", sort_order: 0 }] },
    ])
    const id = await resolveCategoryId("token", "venue-1", "Cleanup")
    expect(id).toBe(3)
  })
})
