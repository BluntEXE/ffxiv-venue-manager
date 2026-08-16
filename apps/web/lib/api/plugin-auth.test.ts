import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue(undefined) },
    membership: { findMany: vi.fn() },
  },
}))
vi.mock("@/lib/api/plugin-rate-limit", () => ({
  enforcePluginIpRateLimit: vi.fn().mockResolvedValue(null),
  enforcePluginRateLimit: vi.fn().mockResolvedValue(null),
}))

import { prisma } from "@/lib/prisma"
import { enforcePluginIpRateLimit, enforcePluginRateLimit } from "@/lib/api/plugin-rate-limit"
import { pluginAuthGate } from "./plugin-auth"

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/plugin/test", { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("pluginAuthGate", () => {
  it("returns 429 without checking the API key when IP-limited", async () => {
    vi.mocked(enforcePluginIpRateLimit).mockResolvedValueOnce(
      new Response(null, { status: 429 }) as any
    )
    const result = await pluginAuthGate(makeRequest({ "x-api-key": "vm_x" }), "read")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(429)
    expect(prisma.apiKey.findFirst).not.toHaveBeenCalled()
  })

  it("returns 401 Unauthorized when x-api-key header is missing", async () => {
    const result = await pluginAuthGate(makeRequest(), "read")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
      const body = await result.response.json()
      expect(body).toEqual({ error: "Unauthorized" })
    }
  })

  it("returns 401 Unauthorized when the API key doesn't resolve to a user", async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce(null)
    const result = await pluginAuthGate(makeRequest({ "x-api-key": "vm_bad" }), "read")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
      const body = await result.response.json()
      expect(body).toEqual({ error: "Unauthorized" })
    }
  })

  it("returns the per-key rate-limit response when over budget", async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce({
      id: "k1", userId: "u1", venueId: null, user: { id: "u1" },
    } as any)
    vi.mocked(prisma.membership.findMany).mockResolvedValueOnce([{ venueId: "v1" }] as any)
    vi.mocked(enforcePluginRateLimit).mockResolvedValueOnce(
      new Response(null, { status: 429 }) as any
    )
    const result = await pluginAuthGate(makeRequest({ "x-api-key": "vm_ok" }), "write")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(429)
    expect(enforcePluginRateLimit).toHaveBeenCalledWith("vm_ok", "write")
  })

  it("returns ok:true with userId/venues when everything passes", async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce({
      id: "k1", userId: "u1", venueId: null, user: { id: "u1", name: "Test" },
    } as any)
    vi.mocked(prisma.membership.findMany).mockResolvedValueOnce([{ venueId: "v1" }, { venueId: "v2" }] as any)
    const result = await pluginAuthGate(makeRequest({ "x-api-key": "vm_ok" }), "read")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.auth.userId).toBe("u1")
      expect(result.auth.venues).toEqual(["v1", "v2"])
    }
  })
})
