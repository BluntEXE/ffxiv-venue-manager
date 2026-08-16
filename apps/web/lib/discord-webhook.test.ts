import { describe, it, expect } from "vitest"
import { extractPartakeTextBody } from "./discord-webhook"

describe("extractPartakeTextBody", () => {
  it("strips heading markers and empty bold runs from real Partake output", () => {
    const description = [
      "# **💎 Black Sapphire — Coming Soon 💎**",
      "",
      "![](https://cdn.partake.gg/assets/16a2bffe3f1e448cb3e553d90d72540e.webp)",
      "",
      "****https://discord.gg/vuD5DF266j",
      "****",
      "",
      "## ****",
      "",
      "August 23, 2026 at 5:00 PM UTC",
      "",
      "****",
      "## ****",
      "****",
    ].join("\n")

    expect(extractPartakeTextBody(description)).toBe(
      ["**💎 Black Sapphire — Coming Soon 💎**", "https://discord.gg/vuD5DF266j", "August 23, 2026 at 5:00 PM UTC"].join(
        "\n"
      )
    )
  })
})
