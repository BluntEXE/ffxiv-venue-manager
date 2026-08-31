import { describe, it, expect, vi, beforeEach } from "vitest"

import { listTasks, createTask, updateTask, assignTask, startTask, completeTask, cancelTask, type TaskRow } from "./xvm-api"

function mockFetchOnce({ ok, status, body }: { ok: boolean; status: number; body: unknown }) {
  ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response)
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn())
})

describe("Tasks API", () => {
  const sampleTask: TaskRow = {
    id: 1,
    title: "Restock bar",
    description: null,
    priority: 2,
    due_at: null,
    category_id: null,
    assigned_membership_id: null,
    assigned_position_id: null,
    started_at: null,
    completed_at: null,
    completed_by_person_id: null,
    cancelled_at: null,
    cancel_reason: null,
    created_by_person_id: 1,
    created_at: "2026-08-31T00:00:00Z",
    updated_at: "2026-08-31T00:00:00Z",
  }

  it("listTasks GETs the venue's tasks with query params", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [sampleTask] })
    const result = await listTasks("token", "venue-1", { includeCancelled: true })
    expect(result).toEqual([sampleTask])
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("include_cancelled=true")
  })

  it("createTask POSTs to /venues/{venueId}/tasks", async () => {
    mockFetchOnce({ ok: true, status: 201, body: sampleTask })
    const result = await createTask("token", "venue-1", { title: "Restock bar", priority: 2 })
    expect(result).toEqual(sampleTask)
  })

  it("updateTask PATCHes /{id}", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleTask })
    const result = await updateTask("token", "venue-1", 1, { title: "Restock bar urgently" })
    expect(result).toEqual(sampleTask)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/tasks/1")
    expect(options.method).toBe("PATCH")
  })

  it("assignTask POSTs to /{id}/assign", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleTask })
    await assignTask("token", "venue-1", 1, { position_id: 5 })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/tasks/1/assign")
  })

  it("startTask POSTs to /{id}/start", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleTask })
    await startTask("token", "venue-1", 1)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/tasks/1/start")
  })

  it("completeTask POSTs to /{id}/complete", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleTask })
    await completeTask("token", "venue-1", 1)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/tasks/1/complete")
  })

  it("cancelTask POSTs to /{id}/cancel with an optional reason", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleTask })
    await cancelTask("token", "venue-1", 1, "No longer needed")
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/tasks/1/cancel")
    expect(JSON.parse(options.body)).toEqual({ reason: "No longer needed" })
  })
})
