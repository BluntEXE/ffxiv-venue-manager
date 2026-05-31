import * as React from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatReadoutProps {
  label: string
  value: React.ReactNode
  delta?: string
  deltaDirection?: "up" | "down" | "neutral"
  subtext?: string
  icon?: React.ReactNode
  className?: string
}

function StatReadout({
  label,
  value,
  delta,
  deltaDirection = "neutral",
  subtext,
  icon,
  className,
}: StatReadoutProps) {
  const DeltaIcon =
    deltaDirection === "up" ? TrendingUp :
    deltaDirection === "down" ? TrendingDown :
    Minus

  const deltaColor =
    deltaDirection === "up" ? "text-[var(--success-text)]" :
    deltaDirection === "down" ? "text-[var(--destructive)]" :
    "text-muted-foreground"

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <span className="stat-label">{label}</span>
      </div>
      <div className="text-2xl font-semibold font-[var(--font-heading)] leading-none">
        {value}
      </div>
      {(delta || subtext) && (
        <div className={cn("flex items-center gap-1 text-xs", deltaColor)}>
          {delta && (
            <>
              <DeltaIcon className="size-3" />
              <span>{delta}</span>
            </>
          )}
          {subtext && !delta && (
            <span className="text-muted-foreground">{subtext}</span>
          )}
        </div>
      )}
    </div>
  )
}

export { StatReadout }
export type { StatReadoutProps }
