import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockService, mockTransaction, mockEvent, mockVenue, mockMembership, mockTx } = vi.hoisted(() => ({
  mockService: { findUnique: vi.fn() },
  mockTransaction: { create: vi.fn() },
  mockEvent: { findFirst: vi.fn() },
  mockVenue: { findUnique: vi.fn() },
  mockMembership: { findFirst: vi.fn() },
  mockTx: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    service: mockService,
    transaction: mockTransaction,
    event: mockEvent,
    venue: mockVenue,
    membership: mockMembership,
    $transaction: (fn: (tx: unknown) => unknown) => {
      mockTx()
      return fn({
        service: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        transaction: mockTransaction,
      })
    },
  },
}))
vi.mock("@/lib/sse/venue-events", () => ({ venueEventBus: { emit: vi.fn() } }))
vi.mock("@/lib/discord-webhook", () => ({
  sendDiscordWebhook: vi.fn(),
  formatSaleLoggedEmbed: vi.fn(() => ({})),
  getWebhookUrlForType: vi.fn(() => null),
}))
vi.mock("@/lib/redis-cache", () => ({ invalidateCache: vi.fn() }))
vi.mock("@/lib/display-name", () => ({ resolveDisplayName: vi.fn(() => "Staffer") }))

import { createTransaction, InsufficientStockError } from "./transactions"

describe("createTransaction stock enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEvent.findFirst.mockResolvedValue(null)
    mockVenue.findUnique.mockResolvedValue(null)
    mockTransaction.create.mockResolvedValue({
      id: "txn1",
      amount: 10,
      customerName: "Bob",
      notes: null,
      createdAt: new Date(),
      service: null,
      event: null,
      staff: null,
    })
  })

  it("rejects a sale when the service is out of stock", async () => {
    mockService.findUnique.mockResolvedValue({ stockCount: 0 })

    await expect(
      createTransaction("venue1", "user1", {
        serviceId: "svc1",
        type: "SALE",
        amount: 10,
        customerName: "Bob",
      } as any)
    ).rejects.toThrow(InsufficientStockError)

    expect(mockTransaction.create).not.toHaveBeenCalled()
  })

  it("allows a sale when stockCount is null (not tracked)", async () => {
    mockService.findUnique.mockResolvedValue({ stockCount: null })

    await expect(
      createTransaction("venue1", "user1", {
        serviceId: "svc1",
        type: "SALE",
        amount: 10,
        customerName: "Bob",
      } as any)
    ).resolves.toBeDefined()

    expect(mockTransaction.create).toHaveBeenCalled()
  })

  it("allows a sale and decrements stock when stockCount is positive", async () => {
    mockService.findUnique.mockResolvedValue({ stockCount: 5 })

    await createTransaction("venue1", "user1", {
      serviceId: "svc1",
      type: "SALE",
      amount: 10,
      customerName: "Bob",
    } as any)

    expect(mockTx).toHaveBeenCalled()
    expect(mockTransaction.create).toHaveBeenCalled()
  })

  it("allows a TIP against an out-of-stock service and does not decrement stock", async () => {
    mockService.findUnique.mockResolvedValue({ stockCount: 0 })

    await expect(
      createTransaction("venue1", "user1", {
        serviceId: "svc1",
        type: "TIP",
        amount: 10,
        customerName: "Bob",
      } as any)
    ).resolves.toBeDefined()

    expect(mockService.findUnique).not.toHaveBeenCalled()
    expect(mockTransaction.create).toHaveBeenCalled()
  })
})
