import * as React from "react"
import { ArrowUp, ArrowDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

type IconVariant = "blue" | "success" | "warning" | "default"

interface StatReadoutProps {
  label: string
  value: React.ReactNode
  delta?: string
  deltaDirection?: "up" | "down" | "neutral"
  subtext?: string
  icon?: React.ReactNode
  iconVariant?: IconVariant
  className?: string
}

const iconBadgeClass: Record<IconVariant, string> = {
  blue:    "bg-[var(--blue-010)] border border-[var(--blue-018)] text-[var(--xiv-blue)]",
  success: "bg-[var(--success-soft)] border border-[rgba(16,185,129,0.25)] text-[var(--success-text)]",
  warning: "bg-[rgba(249,226,175,0.08)] border border-[rgba(249,226,175,0.25)] text-[var(--warning)]",
  default: "bg-[var(--blue-010)] border border-[var(--blue-018)] text-[var(--xiv-blue)]",
}

function StatReadout({
  label,
  value,
  delta,
  deltaDirection = "neutral",
  subtext,
  icon,
  iconVariant = "blue",
  className,
}: StatReadoutProps) {
  const DeltaIcon =
    deltaDirection === "up" ? ArrowUp :
    deltaDirection === "down" ? ArrowDown :
    Minus

  const deltaColor =
    deltaDirection === "up" ? "text-[var(--success-text)]" :
    deltaDirection === "down" ? "text-[var(--destructive)]" :
    "text-muted-foreground"

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {icon && (
        <div className="mb-1">
          <span className={cn(
            "w-[30px] h-[30px] rounded-[calc(0.75rem-4px)] flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4",
            iconBadgeClass[iconVariant]
          )}>
            {icon}
          </span>
        </div>
      )}
      <span className="text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-[var(--fg-faint)] mt-[14px] block">{label}</span>
      <div className="font-[var(--font-heading)] font-bold text-[1.7rem] leading-none mt-1">
        {value}
      </div>
      {(delta || subtext) && (
        <div className={cn("flex items-center gap-1 text-xs mt-0.5", deltaColor)}>
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
export type { StatReadoutProps, IconVariant }
