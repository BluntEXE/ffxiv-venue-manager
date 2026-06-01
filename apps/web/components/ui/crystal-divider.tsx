import * as React from "react"
import { cn } from "@/lib/utils"

function CrystalDivider({ className }: { className?: string }) {
  return (
    <div className={cn("xiv-divider", className)} aria-hidden="true">
      <div
        className="size-2 rotate-45 bg-[var(--xiv-blue)] opacity-70 crystal-glow"
      />
    </div>
  )
}

export { CrystalDivider }
