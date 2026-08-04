import { describe, it, expect } from "vitest"
import { patronTag } from "./patron-profiles-table"

describe("patronTag", () => {
  it("returns vip when isVip is true, regardless of visit count", () => {
    expect(patronTag(1, true)).toBe("vip")
  })

  it("returns regular for 3+ visits when not VIP", () => {
    expect(patronTag(3, false)).toBe("regular")
    expect(patronTag(10, false)).toBe("regular")
  })

  it("returns new for under 3 visits when not VIP", () => {
    expect(patronTag(0, false)).toBe("new")
    expect(patronTag(2, false)).toBe("new")
  })
})
