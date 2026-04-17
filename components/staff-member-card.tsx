"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ManageStaffRoleDialog } from "@/components/manage-staff-role-dialog"
import { format } from "date-fns"
import { Clock, Unlock } from "lucide-react"

interface StaffMember {
  id: string
  role: "OWNER" | "MANAGER" | "STAFF"
  temporaryRole: "OWNER" | "MANAGER" | "STAFF" | null
  temporaryRoleExpiresAt: Date | null
  permanentRole: "OWNER" | "MANAGER" | "STAFF" | null
  createdAt: Date
  user: {
    id: string
    name: string | null
    image: string | null
  } | null
  customRole: {
    id: string
    name: string
  } | null
}

interface StaffMemberCardProps {
  member: StaffMember
  canManageStaff: boolean
  currentUserRole: string
  slug: string
  onUpdate: () => void
}

const roleColors = {
  OWNER: "bg-purple-500",
  MANAGER: "bg-blue-500",
  STAFF: "bg-emerald-500",
}

export function StaffMemberCard({
  member,
  canManageStaff,
  currentUserRole,
  slug,
  onUpdate,
}: StaffMemberCardProps) {
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false)

  const effectiveRole = member.temporaryRole || member.role
  const isDeputized = !!member.temporaryRole
  const isExpiringSoon =
    member.temporaryRoleExpiresAt &&
    new Date(member.temporaryRoleExpiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000 // Less than 24 hours

  return (
    <>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12">
                <AvatarImage src={member.user?.image || undefined} />
                <AvatarFallback>
                  {member.user?.name?.substring(0, 2).toUpperCase() || "??"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{member.user?.name || "Unknown"}</p>
                <p className="text-xs text-muted-foreground">
                  Joined {format(new Date(member.createdAt), "PPP")}
                </p>
                {isDeputized && member.temporaryRoleExpiresAt && (
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3 text-yellow-600" />
                    <span
                      className={`text-xs ${isExpiringSoon ? "text-yellow-600 font-medium" : "text-muted-foreground"}`}
                    >
                      Deputized until {format(new Date(member.temporaryRoleExpiresAt), "PPP p")}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-2 items-end">
                <Badge className={roleColors[effectiveRole as keyof typeof roleColors]}>
                  {effectiveRole}
                </Badge>
                {isDeputized && (
                  <Badge variant="secondary" className="bg-yellow-400/10 text-yellow-600 gap-1">
                    <Unlock className="h-3 w-3" aria-hidden="true" />
                    Deputized
                  </Badge>
                )}
                {member.permanentRole && isDeputized && (
                  <Badge variant="outline" className="text-xs">
                    Permanent: {member.permanentRole}
                  </Badge>
                )}
                {member.customRole && <Badge variant="outline">{member.customRole.name}</Badge>}
              </div>
              {canManageStaff && (
                <Button variant="outline" size="sm" onClick={() => setIsRoleDialogOpen(true)}>
                  Manage
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <ManageStaffRoleDialog
        member={member}
        isOpen={isRoleDialogOpen}
        onClose={() => setIsRoleDialogOpen(false)}
        onUpdate={onUpdate}
        slug={slug}
        currentUserRole={currentUserRole}
      />
    </>
  )
}
