"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// FFXIV Data Centers and Worlds
const DATA_CENTERS = {
  "North America": ["Aether", "Primal", "Crystal", "Dynamis"],
  "Europe": ["Chaos", "Light"],
  "Japan": ["Elemental", "Gaia", "Mana", "Meteor"],
  "Oceania": ["Materia"],
}

const WORLDS_BY_DC: Record<string, string[]> = {
  // North America
  Aether: ["Adamantoise", "Cactuar", "Faerie", "Gilgamesh", "Jenova", "Midgardsormr", "Sargatanas", "Siren"],
  Primal: ["Behemoth", "Excalibur", "Exodus", "Famfrit", "Hyperion", "Lamia", "Leviathan", "Ultros"],
  Crystal: ["Balmung", "Brynhildr", "Coeurl", "Diabolos", "Goblin", "Malboro", "Mateus", "Zalera"],
  Dynamis: ["Halicarnassus", "Maduin", "Marilith", "Seraph"],

  // Europe
  Chaos: ["Cerberus", "Louisoix", "Moogle", "Omega", "Phantom", "Ragnarok", "Sagittarius", "Spriggan"],
  Light: ["Alpha", "Lich", "Odin", "Phoenix", "Raiden", "Shiva", "Twintania", "Zodiark"],

  // Japan
  Elemental: ["Aegis", "Atomos", "Carbuncle", "Garuda", "Gungnir", "Kujata", "Tonberry", "Typhon"],
  Gaia: ["Alexander", "Bahamut", "Durandal", "Fenrir", "Ifrit", "Ridill", "Tiamat", "Ultima"],
  Mana: ["Anima", "Asura", "Chocobo", "Hades", "Ixion", "Masamune", "Pandaemonium", "Titan"],
  Meteor: ["Belias", "Mandragora", "Ramuh", "Shinryu", "Unicorn", "Valefor", "Yojimbo", "Zeromus"],

  // Oceania
  Materia: ["Bismarck", "Ravana", "Sephirot", "Sophia", "Zurvan"],
}

export default function NewVenuePage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [selectedDataCenter, setSelectedDataCenter] = useState("")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError("")

    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get("name"),
      slug: formData.get("slug"),
      description: formData.get("description"),
      dataCenter: formData.get("dataCenter"),
      world: formData.get("world"),
      location: formData.get("location"),
    }

    try {
      const response = await fetch("/api/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create venue")
      }

      const venue = await response.json()
      router.push(`/dashboard/${venue.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  }

  return (
    <div className="container mx-auto p-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Create New Venue</CardTitle>
          <CardDescription>
            Set up your FFXIV venue. You'll be able to add staff, events, and services after creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Venue Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Venue Name *</Label>
              <Input
                id="name"
                name="name"
                placeholder="The Gilded Rose"
                required
                onChange={(e) => {
                  const slugInput = document.getElementById("slug") as HTMLInputElement
                  if (slugInput && !slugInput.value) {
                    slugInput.value = generateSlug(e.target.value)
                  }
                }}
              />
            </div>

            {/* URL */}
            <div className="space-y-2">
              <Label htmlFor="slug">URL *</Label>
              <Input
                id="slug"
                name="slug"
                placeholder="the-gilded-rose"
                required
                pattern="[a-z0-9-]+"
              />
              <p className="text-sm text-muted-foreground">
                Cannot contain spaces, uppercase letters, or special characters (e.g., my-venue-name)
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="A cozy tavern in Ul'dah offering drinks, performances, and good company..."
                rows={4}
              />
            </div>

            {/* Data Center */}
            <div className="space-y-2">
              <Label htmlFor="dataCenter">Data Center *</Label>
              <Select
                name="dataCenter"
                required
                onValueChange={setSelectedDataCenter}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select data center" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DATA_CENTERS).map(([region, dcs]) => (
                    <div key={region}>
                      <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                        {region}
                      </div>
                      {dcs.map((dc) => (
                        <SelectItem key={dc} value={dc}>
                          {dc}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* World */}
            <div className="space-y-2">
              <Label htmlFor="world">World (Server) *</Label>
              <Select name="world" required disabled={!selectedDataCenter}>
                <SelectTrigger>
                  <SelectValue placeholder={selectedDataCenter ? "Select world" : "Select data center first"} />
                </SelectTrigger>
                <SelectContent>
                  {selectedDataCenter && WORLDS_BY_DC[selectedDataCenter]?.map((world) => (
                    <SelectItem key={world} value={world}>
                      {world}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location">In-Game Location</Label>
              <Input
                id="location"
                name="location"
                placeholder="Ul'dah - Steps of Nald, Plot 12, Ward 5"
              />
              <p className="text-sm text-muted-foreground">
                Help visitors find your venue in-game
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex gap-4">
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Creating..." : "Create Venue"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
