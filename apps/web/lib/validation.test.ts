import { describe, it, expect } from "vitest"
import { validators } from "./validation"

describe("validators.feedbackStatus", () => {
  it("accepts each real FeedbackStatus enum value", () => {
    for (const status of ["NEW", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "COMPLETED", "WONT_FIX"]) {
      expect(validators.feedbackStatus.safeParse(status).success).toBe(true)
    }
  })

  it("rejects a value not in the enum", () => {
    expect(validators.feedbackStatus.safeParse("ARCHIVED").success).toBe(false)
  })
})

describe("validators.feedbackCategory", () => {
  it("accepts each real FeedbackCategory enum value", () => {
    for (const category of ["BUG_REPORT", "FEATURE_REQUEST", "IMPROVEMENT", "GENERAL"]) {
      expect(validators.feedbackCategory.safeParse(category).success).toBe(true)
    }
  })

  it("rejects a value not in the enum", () => {
    expect(validators.feedbackCategory.safeParse("OTHER").success).toBe(false)
  })
})

describe("validators.adminNotes", () => {
  it("accepts a reasonable-length string", () => {
    expect(validators.adminNotes.safeParse("Looks good, ship it.").success).toBe(true)
  })

  it("accepts undefined (optional field)", () => {
    expect(validators.adminNotes.safeParse(undefined).success).toBe(true)
  })

  it("rejects a string over 2000 characters", () => {
    expect(validators.adminNotes.safeParse("a".repeat(2001)).success).toBe(false)
  })
})
