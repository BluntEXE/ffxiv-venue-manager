"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { PageLoading } from "@/components/ui/loading-spinner"
import { VenueLayoutClient } from "@/components/venue-layout-client"

interface StaffMember {
  id: string
  role: "OWNER" | "MANAGER" | "STAFF"
  roleId: string | null
  createdAt: string
  user: {
    id: string
    name: string | null
    email: string | null
    image: string | null
    discordId: string | null
  }
  customRole: {
    id: string
    name: string
    responsibilities: string | null
  } | null
  additionalRoles: { role: CustomRole }[]
}

interface CustomRole {
  id: string
  name: string
  responsibilities: string | null
  _count?: {
    memberships: number
  }
}

const roleColors = {
  OWNER: "bg-purple-500",
  MANAGER: "bg-blue-500",
  STAFF: "bg-emerald-500",
}

export default function ManageStaffMemberPage({
  params,
}: {
  params: Promise<{ slug: string; membershipId: string }>
}) {
  const router = useRouter()
  const [slug, setSlug] = useState<string>("")
  const [membershipId, setMembershipId] = useState<string>("")
  const [staffMember, setStaffMember] = useState<StaffMember | null>(null)
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Form state
  const [selectedRole, setSelectedRole] = useState<"OWNER" | "MANAGER" | "STAFF">("STAFF")
  const [selectedCustomRole, setSelectedCustomRole] = useState<string | null>(null)
  const [selectedAdditionalRoleIds, setSelectedAdditionalRoleIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Unwrap params
  useEffect(() => {
    params.then((p) => {
      setSlug(p.slug)
      setMembershipId(p.membershipId)
    })
  }, [params])

  // Fetch staff member and custom roles
  useEffect(() => {
    if (!slug || !membershipId) return

    const fetchData = async () => {
      try {
        setIsLoading(true)
        setError("")

        // Get venue ID
        const venueResponse = await fetch(`/api/venues?slug=${slug}`)
        if (!venueResponse.ok) throw new Error("Failed to fetch venue")

        const venues = await venueResponse.json()
        const venue = venues.find((v: { slug: string }) => v.slug === slug)
        if (!venue) throw new Error("Venue not found")

        // Get staff member
        const staffResponse = await fetch(`/api/venues/${venue.id}/staff`)
        if (!staffResponse.ok) throw new Error("Failed to fetch staff")

        const staffData = await staffResponse.json()
        const member = staffData.find((s: any) => s.id === membershipId)

        if (!member) {
          throw new Error("Staff member not found")
        }

        setStaffMember(member)
        setSelectedRole(member.role)
        setSelectedCustomRole(member.roleId)
        setSelectedAdditionalRoleIds(member.additionalRoles.map((ar: { role: CustomRole }) => ar.role.id))

        // Get custom roles
        const rolesResponse = await fetch(`/api/venues/${venue.id}/roles`)
        if (rolesResponse.ok) {
          const rolesData = await rolesResponse.json()
          setCustomRoles(rolesData)
        }
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : "Failed to load staff member")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [slug, membershipId])

  const handleSave = async () => {
    if (!staffMember) return

    setIsSaving(true)
    setError("")
    setSuccess("")

    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(
        `/api/venues/${venue.id}/staff/${membershipId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: selectedRole,
            roleId: selectedCustomRole,
            additionalRoleIds: selectedAdditionalRoleIds,
          }),
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update staff member")
      }

      const updatedMember = await response.json()
      setStaffMember(updatedMember)
      setSuccess("Staff member updated successfully!")

      // Refresh after 1.5 seconds
      setTimeout(() => {
        router.refresh()
      }, 1500)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to update staff member")
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!staffMember) return

    setIsDeleting(true)
    setError("")

    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(
        `/api/venues/${venue.id}/staff/${membershipId}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to remove staff member")
      }

      // Redirect to staff page
      router.push(`/dashboard/${slug}/staff`)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to remove staff member")
      setIsDeleting(false)
    }
  }

  if (!slug || !membershipId) {
    return <VenueLayoutClient slug={slug}><div className="page-inner"><PageLoading /></div></VenueLayoutClient>
  }

  if (isLoading) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="page-inner"><PageLoading text="Loading staff member..." /></div>
      </VenueLayoutClient>
    )
  }

  if (!staffMember) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="page-inner">
          <Alert className="bg-destructive/10 border-destructive/20">
            <AlertDescription className="text-destructive">Staff member not found</AlertDescription>
          </Alert>
          <Button asChild className="mt-4">
            <Link href={`/dashboard/${slug}/staff`}>← Back to Staff</Link>
          </Button>
        </div>
      </VenueLayoutClient>
    )
  }

  return (
    <VenueLayoutClient slug={slug}>
    <div className="page-inner max-w-3xl">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-4xl font-bold">Manage Staff Member</h1>
        <p className="text-muted-foreground mt-2">
          Update roles and permissions for this team member
        </p>
      </div>

      {/* Success Message */}
      {success && (
        <Alert className="mb-6 bg-emerald-500/10 border-emerald-500/20">
          <AlertDescription className="text-emerald-400">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {/* Error Message */}
      {error && (
        <Alert className="mb-6 bg-destructive/10 border-destructive/20">
          <AlertDescription className="text-destructive">{error}</AlertDescription>
        </Alert>
      )}

      {/* Staff Member Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Staff Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={staffMember.user.image || undefined} />
              <AvatarFallback>
                {staffMember.user.name?.substring(0, 2).toUpperCase() || "??"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="text-xl font-semibold">{staffMember.user.name}</p>
              {staffMember.user.discordId && (
                <p className="text-sm text-muted-foreground">
                  Discord ID: {staffMember.user.discordId}
                </p>
              )}
            </div>
            <div>
              <Badge className={roleColors[staffMember.role]}>
                {staffMember.role}
              </Badge>
              {staffMember.customRole && (
                <Badge variant="outline" className="ml-2">
                  {staffMember.customRole.name}
                </Badge>
              )}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Joined {format(new Date(staffMember.createdAt), "PPP")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Role Management */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Role Management</CardTitle>
          <CardDescription>
            Update this staff member's base role and custom role
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Base Role */}
          <div className="space-y-2">
            <Label htmlFor="base-role">Base Role</Label>
            <Select
              value={selectedRole}
              onValueChange={(value: string) => setSelectedRole(value as "OWNER" | "MANAGER" | "STAFF")}
              disabled={isSaving}
            >
              <SelectTrigger id="base-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STAFF">Staff</SelectItem>
                <SelectItem value="MANAGER">Manager</SelectItem>
                <SelectItem value="OWNER">Owner</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                <strong>Staff:</strong> Can view events, log sales, view tasks
              </p>
              <p>
                <strong>Manager:</strong> Can create/edit events, manage tasks,
                view reports
              </p>
              <p>
                <strong>Owner:</strong> Full access to all venue features
              </p>
            </div>
          </div>

          {/* Custom Role */}
          <div className="space-y-2">
            <Label htmlFor="custom-role">Custom Role (Optional)</Label>
            <Select
              value={selectedCustomRole || "none"}
              onValueChange={(value) =>
                setSelectedCustomRole(value === "none" ? null : value)
              }
              disabled={isSaving}
            >
              <SelectTrigger id="custom-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No custom role</SelectItem>
                {customRoles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                    {role.responsibilities && ` - ${role.responsibilities}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {customRoles.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No custom roles available.{" "}
                <Link
                  href={`/dashboard/${slug}/staff/roles`}
                  className="text-blue-600 hover:underline"
                >
                  Create one
                </Link>
              </p>
            )}
          </div>

          {/* Additional Roles */}
          <div className="space-y-2">
            <Label>Additional Roles</Label>
            <p className="text-xs text-muted-foreground">
              Lets this person provide services and fill shifts for these roles too,
              on top of their custom role above.
            </p>
            <div className="flex flex-wrap gap-2">
              {customRoles
                .filter((role) => role.id !== selectedCustomRole)
                .map((role) => {
                  const checked = selectedAdditionalRoleIds.includes(role.id)
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() =>
                        setSelectedAdditionalRoleIds((prev) =>
                          checked ? prev.filter((id) => id !== role.id) : [...prev, role.id]
                        )
                      }
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                        checked
                          ? "border-[var(--xiv-blue)] bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)]"
                          : "border-[var(--blue-015)] text-muted-foreground hover:border-[var(--blue-028)]"
                      }`}
                    >
                      {role.name}
                    </button>
                  )
                })}
            </div>
            {customRoles.length <= 1 && (
              <p className="text-xs text-muted-foreground">
                Create more roles in Staff settings to assign additional roles.
              </p>
            )}
          </div>

          {/* Save Button */}
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-400">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions for this staff member
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Remove Staff Member</p>
              <p className="text-sm text-muted-foreground">
                This will revoke their access to the venue
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isDeleting}>
                  Remove Staff
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove Staff Member?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to remove {staffMember.user.name} from
                    this venue? They will lose all access immediately. This
                    action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRemove}>
                    Remove Staff Member
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Back Button */}
      <div className="mt-6">
        <Button variant="outline" asChild>
          <Link href={`/dashboard/${slug}/staff`}>← Back to Staff</Link>
        </Button>
      </div>
    </div>
    </VenueLayoutClient>
  )
}
