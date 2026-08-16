import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest, NextResponse } from "next/server"

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit")
  return { ...actual, checkLimit: vi.fn() }
})

import { checkLimit } from "@/lib/rate-limit"
import { withRateLimit } from "./with-rate-limit"

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/test", { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("withRateLimit", () => {
  it("calls the handler and stamps rate-limit headers on success", async () => {
    vi.mocked(checkLimit).mockResolvedValueOnce({ success: true, limit: 200, remaining: 199, reset: Date.now() + 60000 })
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }))

    const wrapped = withRateLimit(handler)
    const res = await wrapped(makeRequest())

    expect(handler).toHaveBeenCalledOnce()
    expect(res.headers.get("X-RateLimit-Limit")).toBe("200")
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("199")
    expect(res.headers.has("Retry-After")).toBe(false)
    expect(await res.json()).toEqual({ ok: true })
  })

  it("returns 429 without calling the handler when over limit", async () => {
    const reset = Date.now() + 4200
    vi.mocked(checkLimit).mockResolvedValueOnce({ success: false, limit: 200, remaining: 0, reset })
    const handler = vi.fn()

    const wrapped = withRateLimit(handler)
    const res = await wrapped(makeRequest())

    expect(handler).not.toHaveBeenCalled()
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("5")
    expect(await res.json()).toEqual({
      error: "Too many requests",
      message: "You have exceeded the rate limit. Please try again later.",
    })
  })

  it("keys the identifier off the resolved client IP by default", async () => {
    vi.mocked(checkLimit).mockResolvedValueOnce({ success: true, limit: 200, remaining: 199, reset: Date.now() })
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }))

    const wrapped = withRateLimit(handler)
    await wrapped(makeRequest({ "x-forwarded-for": "1.2.3.4" }))

    expect(checkLimit).toHaveBeenCalledWith(expect.stringContaining("ip:1.2.3.4:"), 200, 60)
  })

  it("uses a custom getIdentifier instead of the default IP-based key when provided", async () => {
    vi.mocked(checkLimit).mockResolvedValueOnce({ success: true, limit: 5, remaining: 4, reset: Date.now() })
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }))
    const getIdentifier = vi.fn().mockReturnValue("custom-key")

    const wrapped = withRateLimit(handler, { requests: 5, getIdentifier })
    await wrapped(makeRequest({ "x-forwarded-for": "1.2.3.4" }))

    expect(getIdentifier).toHaveBeenCalledOnce()
    expect(checkLimit).toHaveBeenCalledWith("custom-key", 5, 60)
  })
})
