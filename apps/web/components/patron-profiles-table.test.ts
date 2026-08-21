import { describe, it, expect } from "vitest"
import { patronTag } from "./patron-profiles-table"

describe("patronTag", () => {
  it("returns regular for 3+ visits", () => {
    expect(patronTag(3)).toBe("regular")
    expect(patronTag(10)).toBe("regular")
  })

  it("returns new for under 3 visits", () => {
    expect(patronTag(0)).toBe("new")
    expect(patronTag(2)).toBe("new")
  })
})
