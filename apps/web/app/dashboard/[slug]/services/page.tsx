"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { Breadcrumb } from "@/components/breadcrumb"
import { VenueEyebrow } from "@/components/venue-eyebrow"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { RoleBadge } from "@/components/role-badge"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { StatReadout } from "@/components/ui/stat-readout"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { PageLoading } from "@/components/ui/loading-spinner"

interface Role {
  id: string
  name: string
  color: string
}

interface Service {
  id: string
  name: string
  description: string | null
  price: number
  isActive: boolean
  roles?: Role[]
  _count?: {
    transactions: number
  }
}


export default function ServicesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const router = useRouter()
  const [slug, setSlug] = useState<string>("")
  const [services, setServices] = useState<Service[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  // Form state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    selectedRoleIds: [] as string[],
    isActive: true,
  })
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Unwrap params
  useEffect(() => {
    params.then((p) => setSlug(p.slug))
  }, [params])

  // Fetch services
  useEffect(() => {
    if (!slug) return

    const fetchServices = async () => {
      try {
        setIsLoading(true)
        setError("")

        // Get venue ID
        const venueResponse = await fetch(`/api/venues`)
        if (!venueResponse.ok) throw new Error("Failed to fetch venue")

        const venues = await venueResponse.json()
        const venue = venues.find((v: { slug: string }) => v.slug === slug)
        if (!venue) throw new Error("Venue not found")

        // Get services and roles
        const [servicesResponse, rolesResponse] = await Promise.all([
          fetch(`/api/venues/${venue.id}/services`),
          fetch(`/api/venues/${venue.id}/roles`),
        ])

        if (!servicesResponse.ok) throw new Error("Failed to fetch services")
        if (!rolesResponse.ok) throw new Error("Failed to fetch roles")

        const servicesData = await servicesResponse.json()
        const rolesData = await rolesResponse.json()
        setServices(servicesData)
        setRoles(rolesData)

      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : "Failed to load services")
      } finally {
        setIsLoading(false)
      }
    }

    fetchServices()
  }, [slug])

  const handleCreateService = async () => {
    if (!formData.name.trim() || !formData.price) {
      setFormError("Name and price are required")
      return
    }

    setIsSubmitting(true)
    setFormError("")

    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || undefined,
          price: parseFloat(formData.price),
          roleIds: formData.selectedRoleIds,
          isActive: formData.isActive,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create service")
      }

      const newService = await response.json()
      setServices([newService, ...services])
      setIsCreateDialogOpen(false)
      setFormData({ name: "", description: "", price: "", selectedRoleIds: [] as string[], isActive: true })
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to create service")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditService = async () => {
    if (!editingService || !formData.name.trim() || !formData.price) {
      setFormError("Name and price are required")
      return
    }

    setIsSubmitting(true)
    setFormError("")

    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(
        `/api/venues/${venue.id}/services/${editingService.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            description: formData.description || undefined,
            price: parseFloat(formData.price),
            roleIds: formData.selectedRoleIds,
            isActive: formData.isActive,
          }),
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update service")
      }

      const updatedService = await response.json()
      setServices(services.map((s) => (s.id === updatedService.id ? updatedService : s)))
      setIsEditDialogOpen(false)
      setEditingService(null)
      setFormData({ name: "", description: "", price: "", selectedRoleIds: [] as string[], isActive: true })
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to update service")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteService = async (service: Service) => {
    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}/services/${service.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete service")
      }

      setServices(services.filter((s) => s.id !== service.id))
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to delete service")
    }
  }

  const openEditDialog = (service: Service) => {
    setEditingService(service)
    setFormData({
      name: service.name,
      description: service.description || "",
      price: service.price.toString(),
      selectedRoleIds: service.roles?.map(r => r.id) || [],
      isActive: service.isActive,
    })
    setFormError("")
    setIsEditDialogOpen(true)
  }

  const openCreateDialog = () => {
    setFormData({ name: "", description: "", price: "", selectedRoleIds: [] as string[], isActive: true })
    setFormError("")
    setIsCreateDialogOpen(true)
  }

  const toggleRoleSelection = (roleId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedRoleIds: prev.selectedRoleIds.includes(roleId)
        ? prev.selectedRoleIds.filter(id => id !== roleId)
        : [...prev.selectedRoleIds, roleId]
    }))
  }

  if (!slug) {
    return <div className="p-4 md:p-6"><PageLoading /></div>
  }

  const activeServices = services.filter((s) => s.isActive)
  const inactiveServices = services.filter((s) => !s.isActive)

  return (
    <VenueLayoutClient slug={slug}>
      <div className="p-4 md:p-6">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Venue", href: `/dashboard/${slug}` },
            { label: "Services" },
          ]}
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 md:mb-8">
          <div>
            <VenueEyebrow slug={slug} />
            <h1 className="font-cinzel text-2xl md:text-3xl font-bold tracking-[0.02em]">Services</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your venue's products and services</p>
          </div>
          <Button onClick={openCreateDialog} size="sm" className="sm:size-default self-start">
            <span className="hidden sm:inline">Add Service</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4"><StatReadout label="Total services" value={services.length} /></Card>
          <Card className="p-4"><StatReadout label="Active" value={activeServices.length} deltaDirection="up" /></Card>
          <Card className="p-4"><StatReadout label="Inactive" value={inactiveServices.length} /></Card>
        </div>

        {/* Error Message */}
        {error && (
          <Alert className="mb-6 bg-destructive/10 border-destructive/20">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}

        {/* Services List */}
        {isLoading ? (
          <PageLoading text="Loading services..." />
        ) : services.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground mb-4">
                No services configured yet.
              </p>
              <Button onClick={openCreateDialog}>Add Your First Service</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Active Services */}
            {activeServices.length > 0 && (
              <div className="mb-8">
                <h2 className="font-cinzel text-xl font-semibold tracking-wide mb-4">Active Services</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeServices.map((service) => (
                    <Card key={service.id}>
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <CardTitle>{service.name}</CardTitle>
                            {service.roles && service.roles.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {service.roles.map((role) => (
                                  <RoleBadge
                                    key={role.id}
                                    role={role.name}
                                    color={role.color}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <Badge className="bg-emerald-500">Active</Badge>
                        </div>
                        {service.description && (
                          <CardDescription className="mt-2">
                            {service.description}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="mb-4">
                          <p className="text-2xl font-bold text-[var(--xiv-blue)]">{service.price.toLocaleString()} gil</p>
                          {service._count && (
                            <p className={`text-xs mt-1 ${service._count.transactions > 0 ? 'text-emerald-400 font-medium' : 'text-muted-foreground'}`}>
                              {service._count.transactions} {service._count.transactions === 1 ? 'sale' : 'sales'}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(service)}
                          >
                            Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Service?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{service.name}"? This action
                                  cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteService(service)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Inactive Services */}
            {inactiveServices.length > 0 && (
              <div className="mb-8">
                <h2 className="font-cinzel text-xl font-semibold tracking-wide mb-4">Inactive Services</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-60">
                  {inactiveServices.map((service) => (
                    <Card key={service.id}>
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <CardTitle>{service.name}</CardTitle>
                            {service.roles && service.roles.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {service.roles.map((role) => (
                                  <RoleBadge
                                    key={role.id}
                                    role={role.name}
                                    color={role.color}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <Badge variant="outline">Inactive</Badge>
                        </div>
                        {service.description && (
                          <CardDescription className="mt-2">
                            {service.description}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="mb-4">
                          <p className="text-2xl font-bold text-[var(--xiv-blue)]">{service.price.toLocaleString()} gil</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(service)}
                          >
                            Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Service?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{service.name}"?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteService(service)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Create Service Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Add Service</DialogTitle>
              <DialogDescription>Create a new product or service for your venue</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {formError && (
                <Alert className="bg-destructive/10 border-destructive/20">
                  <AlertDescription className="text-destructive">{formError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="create-name">Service Name *</Label>
                <Input
                  id="create-name"
                  placeholder="e.g., House Special, VIP Pass"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-price">Price (gil) *</Label>
                <Input
                  id="create-price"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="1000"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label>Roles (who can provide this service)</Label>
                {roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No roles yet. Create roles first to assign services.
                  </p>
                ) : (
                  <div className="space-y-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
                    {roles.map((role) => (
                      <div key={role.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`create-role-${role.id}`}
                          checked={formData.selectedRoleIds.includes(role.id)}
                          onCheckedChange={() => toggleRoleSelection(role.id)}
                          disabled={isSubmitting}
                        />
                        <Label
                          htmlFor={`create-role-${role.id}`}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <RoleBadge
                            role={role.name}
                            color={role.color}
                          />
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-description">Description</Label>
                <Textarea
                  id="create-description"
                  placeholder="Optional description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="create-active"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  disabled={isSubmitting}
                />
                <Label htmlFor="create-active">Active (available for sale)</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleCreateService} disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create Service"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Service Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Edit Service</DialogTitle>
              <DialogDescription>Update service details</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {formError && (
                <Alert className="bg-destructive/10 border-destructive/20">
                  <AlertDescription className="text-destructive">{formError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-name">Service Name *</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-price">Price (gil) *</Label>
                <Input
                  id="edit-price"
                  type="number"
                  min="0"
                  step="1"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label>Roles (who can provide this service)</Label>
                {roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No roles yet. Create roles first to assign services.
                  </p>
                ) : (
                  <div className="space-y-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
                    {roles.map((role) => (
                      <div key={role.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-role-${role.id}`}
                          checked={formData.selectedRoleIds.includes(role.id)}
                          onCheckedChange={() => toggleRoleSelection(role.id)}
                          disabled={isSubmitting}
                        />
                        <Label
                          htmlFor={`edit-role-${role.id}`}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <RoleBadge
                            role={role.name}
                            color={role.color}
                          />
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-active"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  disabled={isSubmitting}
                />
                <Label htmlFor="edit-active">Active (available for sale)</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleEditService} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </VenueLayoutClient>
  )
}
