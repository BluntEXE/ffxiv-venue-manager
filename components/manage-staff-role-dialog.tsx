"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"

interface StaffMember {
  id: string
  role: "OWNER" | "MANAGER" | "STAFF"
  temporaryRole: "OWNER" | "MANAGER" | "STAFF" | null
  temporaryRoleExpiresAt: Date | null
  permanentRole: "OWNER" | "MANAGER" | "STAFF" | null
  user: {
    id: string
    name: string | null
    image: string | null
  } | null
}

interface ManageStaffRoleDialogProps {
  member: StaffMember | null
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
  slug: string
  currentUserRole: string
}

export function ManageStaffRoleDialog({
  member,
  isOpen,
  onClose,
  onUpdate,
  slug,
  currentUserRole,
}: ManageStaffRoleDialogProps) {
  const [permanentRole, setPermanentRole] = useState<string>("")
  const [temporaryRole, setTemporaryRole] = useState<string>("")
  const [expiresAt, setExpiresAt] = useState<string>("")
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState("")

  // Initialize form when member changes
  useState(() => {
    if (member) {
      // If they have a temporary role, show their permanent role
      setPermanentRole(member.permanentRole || member.role)
      setTemporaryRole(member.temporaryRole || "")
      setExpiresAt(
        member.temporaryRoleExpiresAt
          ? format(new Date(member.temporaryRoleExpiresAt), "yyyy-MM-dd'T'HH:mm")
          : ""
      )
    }
  })

  const handleUpdate = async () => {
    if (!member) return

    setIsUpdating(true)
    setError("")

    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const updateData: any = {}

      // If setting a temporary role
      if (temporaryRole && expiresAt) {
        updateData.temporaryRole = temporaryRole
        updateData.temporaryRoleExpiresAt = new Date(expiresAt).toISOString()
        updateData.permanentRole = permanentRole
        updateData.role = temporaryRole // Active role becomes the temporary one
      }
      // If clearing temporary role
      else if (!temporaryRole && member.temporaryRole) {
        updateData.role = permanentRole
        updateData.temporaryRole = null
        updateData.temporaryRoleExpiresAt = null
        updateData.permanentRole = null
      }
      // If just updating permanent role (no temporary role)
      else {
        updateData.role = permanentRole
      }

      const response = await fetch(`/api/venues/${venue.id}/staff/${member.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update role")
      }

      onUpdate()
      onClose()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to update role")
    } finally {
      setIsUpdating(false)
    }
  }

  const clearTemporaryRole = () => {
    setTemporaryRole("")
    setExpiresAt("")
  }

  if (!member) return null

  const effectiveRole = member.temporaryRole || member.role
  const isDeputized = !!member.temporaryRole

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Role: {member.user?.name || "Unknown"}</DialogTitle>
          <DialogDescription>
            Change permanent role or deputize with temporary elevated permissions
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert className="bg-red-50 border-red-200">
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          {/* Current Status */}
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Current Role:</span>
              <Badge>{effectiveRole}</Badge>
            </div>
            {isDeputized && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Permanent Role:</span>
                  <Badge variant="outline">{member.permanentRole}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Expires:</span>
                  <span className="text-sm">
                    {member.temporaryRoleExpiresAt
                      ? format(new Date(member.temporaryRoleExpiresAt), "PPP p")
                      : "Never"}
                  </span>
                </div>
                <Badge variant="secondary" className="w-full justify-center">
                  🔓 Deputized
                </Badge>
              </>
            )}
          </div>

          {/* Permanent Role */}
          <div className="space-y-2">
            <Label htmlFor="permanent-role">Permanent Role</Label>
            <Select value={permanentRole} onValueChange={setPermanentRole} disabled={isUpdating}>
              <SelectTrigger id="permanent-role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STAFF">Staff</SelectItem>
                <SelectItem value="MANAGER">Manager</SelectItem>
                {currentUserRole === "OWNER" && <SelectItem value="OWNER">Owner</SelectItem>}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The standard role this person will have
            </p>
          </div>

          {/* Temporary Role (Deputize) */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>Temporary Elevated Role (Optional)</Label>
              {temporaryRole && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearTemporaryRole}
                  disabled={isUpdating}
                >
                  Clear
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="temporary-role">Deputize As</Label>
              <Select
                value={temporaryRole}
                onValueChange={setTemporaryRole}
                disabled={isUpdating}
              >
                <SelectTrigger id="temporary-role">
                  <SelectValue placeholder="No temporary role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {permanentRole === "STAFF" && <SelectItem value="MANAGER">Manager</SelectItem>}
                  {currentUserRole === "OWNER" && permanentRole !== "OWNER" && (
                    <SelectItem value="OWNER">Owner</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Temporarily elevate permissions for this person
              </p>
            </div>

            {temporaryRole && (
              <div className="space-y-2">
                <Label htmlFor="expires-at">Expires At</Label>
                <Input
                  id="expires-at"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  disabled={isUpdating}
                  required={!!temporaryRole}
                />
                <p className="text-xs text-muted-foreground">
                  When the temporary role should expire and revert to permanent role
                </p>
              </div>
            )}
          </div>

          {/* Info Box */}
          <Alert className="bg-blue-50 border-blue-200">
            <AlertDescription className="text-blue-800 text-sm space-y-1">
              <p>
                <strong>💡 Tip:</strong> Use temporary roles to deputize someone while you're away.
              </p>
              <p>• They'll automatically revert to their permanent role when it expires</p>
              <p>• Perfect for temporary managers or backup owners</p>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isUpdating}>
            Cancel
          </Button>
          <Button onClick={handleUpdate} disabled={isUpdating || !permanentRole}>
            {isUpdating ? "Updating..." : "Update Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
