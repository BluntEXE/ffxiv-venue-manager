import { describe, it, expect, vi, afterEach } from "vitest"
import { apiFetch, ApiError } from "./api-fetch"

function mockFetchOnce(response: { ok: boolean; status: number; body?: unknown; text?: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status,
      text: async () => response.text ?? (response.body === undefined ? "" : JSON.stringify(response.body)),
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("apiFetch", () => {
  it("returns the parsed JSON body on a 2xx response", async () => {
    mockFetchOnce({ ok: true, status: 200, body: { following: true } })
    const result = await apiFetch<{ following: boolean }>("/api/x")
    expect(result).toEqual({ following: true })
  })

  it("returns undefined for a 2xx response with an empty body", async () => {
    mockFetchOnce({ ok: true, status: 204, text: "" })
    const result = await apiFetch("/api/x")
    expect(result).toBeUndefined()
  })

  it("throws ApiError with the server's error message on a non-2xx JSON response", async () => {
    mockFetchOnce({ ok: false, status: 400, body: { error: "Missing required fields" } })
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      message: "Missing required fields",
      status: 400,
    })
  })

  it("prefers the server's message field over error when both are present", async () => {
    mockFetchOnce({
      ok: false,
      status: 429,
      body: { error: "Too many requests", message: "You have exceeded the rate limit. Please try again later." },
    })
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      message: "You have exceeded the rate limit. Please try again later.",
      status: 429,
    })
  })

  it("throws ApiError when a 2xx response has a non-JSON body", async () => {
    mockFetchOnce({ ok: true, status: 200, text: "<html>not json</html>" })
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      message: "Unexpected response from the server.",
      status: 200,
    })
  })

  it("throws ApiError with a generic message when the error response isn't JSON", async () => {
    mockFetchOnce({ ok: false, status: 500, text: "<html>Internal Server Error</html>" })
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      message: "Request failed (500)",
      status: 500,
    })
  })

  it("throws ApiError with status 0 and a network-error message when fetch itself rejects", async () => {
    const original = new TypeError("Failed to fetch")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(original))
    try {
      await apiFetch("/api/x")
      expect.unreachable()
    } catch (e) {
      expect(e).toMatchObject({
        message: "Network error, check your connection and try again.",
        status: 0,
      })
      expect((e as ApiError).cause).toBe(original)
    }
  })

  it("is an instance of ApiError so callers can narrow with instanceof", async () => {
    mockFetchOnce({ ok: false, status: 404, body: { error: "Not found" } })
    try {
      await apiFetch("/api/x")
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
    }
  })
})
