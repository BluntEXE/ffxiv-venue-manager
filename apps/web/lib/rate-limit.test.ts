import { describe, it, expect } from "vitest"
import { NextRequest } from "next/server"
import { getIp, buildRateLimitResponse, type RateLimitResult } from "./rate-limit"

describe("getIp", () => {
  it("prefers the first entry of x-forwarded-for when present", () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    })
    expect(getIp(req)).toBe("1.2.3.4")
  })

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { "x-real-ip": "9.9.9.9" },
    })
    expect(getIp(req)).toBe("9.9.9.9")
  })

  it("falls back to cf-connecting-ip when neither of the above is present", () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { "cf-connecting-ip": "8.8.8.8" },
    })
    expect(getIp(req)).toBe("8.8.8.8")
  })

  it("falls back to 'anonymous' when no IP header is present", () => {
    const req = new NextRequest("http://localhost/api/test")
    expect(getIp(req)).toBe("anonymous")
  })
})

describe("buildRateLimitResponse", () => {
  it("returns a 429 with the rate-limit headers and given message", async () => {
    const rl: RateLimitResult = { success: false, limit: 60, remaining: 0, reset: Date.now() + 5000 }
    const res = buildRateLimitResponse(rl, "Rate limit 60/60s exceeded")
    expect(res.status).toBe(429)
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60")
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0")
    expect(res.headers.get("X-RateLimit-Reset")).toBe(String(rl.reset))
    const body = await res.json()
    expect(body).toEqual({ error: "Too many requests", message: "Rate limit 60/60s exceeded" })
  })

  it("computes Retry-After as the ceiling of seconds until reset", async () => {
    const reset = Date.now() + 4200
    const rl: RateLimitResult = { success: false, limit: 10, remaining: 0, reset }
    const res = buildRateLimitResponse(rl, "x")
    expect(res.headers.get("Retry-After")).toBe("5")
  })
})
