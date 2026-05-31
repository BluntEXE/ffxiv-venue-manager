import * as React from "react"
import { cn } from "@/lib/utils"

function CrystalDivider({ className }: { className?: string }) {
  return (
    <div className={cn("xiv-divider", className)} aria-hidden="true">
      <div
        className="size-2 rotate-45 bg-[var(--xiv-blue)] opacity-70"
        style={{ boxShadow: "0 0 8px rgba(0,180,255,0.6)" }}
      />
    </div>
  )
}

export { CrystalDivider }
