import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface RoleBadgeProps {
    role: string
    color?: string | null
    className?: string
}

const DEFAULT_ROLE_COLORS: Record<string, string> = {
    OWNER: "#a855f7", // purple-500
    MANAGER: "#3b82f6", // blue-500
    STAFF: "#22c55e",   // green-500
}

export function RoleBadge({ role, color, className }: RoleBadgeProps) {
    // If a specific color is provided (custom role), use it.
    // Otherwise, fallback to the default role map.
    const badgeColor = color || DEFAULT_ROLE_COLORS[role] || "#a855f7"

    return (
        <Badge
            variant="outline"
            className={cn("border-current bg-transparent bg-background/50", className)}
            style={{
                borderColor: badgeColor,
                color: badgeColor
            }}
        >
            {role}
        </Badge>
    )
}
