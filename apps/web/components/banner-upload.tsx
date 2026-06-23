"use client"

import { useRef, useState } from "react"
import { ImageIcon, Trash2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BannerUploadProps {
  venueId: string
  initialUrl: string | null
  onUpdate: (url: string | null) => void
}

export function BannerUpload({ venueId, initialUrl, onUpdate }: BannerUploadProps) {
  const [url, setUrl] = useState<string | null>(initialUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    setError("")
    setUploading(true)
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to get upload URL") }
      const { uploadUrl, storedUrl } = await res.json()

      const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } })
      if (!put.ok) throw new Error("Upload failed")

      const patch = await fetch(`/api/venues/${venueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerUrl: storedUrl }),
      })
      if (!patch.ok) { const d = await patch.json(); throw new Error(d.error || "Failed to save") }

      setUrl(storedUrl)
      onUpdate(storedUrl)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const remove = async () => {
    setError("")
    try {
      const patch = await fetch(`/api/venues/${venueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerUrl: null }),
      })
      if (!patch.ok) { const d = await patch.json(); throw new Error(d.error || "Failed to remove") }
      setUrl(null)
      onUpdate(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove")
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--destructive-soft)] border border-[rgba(243,139,168,0.2)] text-xs text-[var(--destructive)]">
          <X className="w-3.5 h-3.5 shrink-0 cursor-pointer" onClick={() => setError("")} />
          {error}
        </div>
      )}

      {url ? (
        <div className="relative rounded-xl overflow-hidden border border-[var(--blue-015)] bg-[var(--blue-007)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Venue banner" className="w-full h-40 object-cover" />
          <div className="absolute top-2 right-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}
              className="h-7 text-xs bg-[rgba(7,11,20,0.8)] border-[var(--blue-020)] hover:border-[var(--xiv-blue)]">
              <Upload className="w-3 h-3 mr-1" /> Change
            </Button>
            <Button size="sm" variant="outline" onClick={remove} disabled={uploading}
              className="h-7 text-xs bg-[rgba(7,11,20,0.8)] border-[rgba(243,139,168,0.3)] text-[var(--destructive)] hover:bg-[var(--destructive-soft)]">
              <Trash2 className="w-3 h-3 mr-1" /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          className="w-full border border-dashed border-[var(--blue-015)] rounded-xl p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-[var(--blue-035)] hover:bg-[var(--blue-007)] hover:text-foreground transition-colors cursor-pointer">
          <ImageIcon className="w-7 h-7 opacity-40" />
          <div className="text-sm">
            <span className="font-medium text-[var(--xiv-blue)]">Upload a banner image</span>
          </div>
          <p className="text-xs opacity-60">Recommended: 1200 × 630 px · JPEG, PNG or WebP · max 10 MB</p>
          <p className="text-xs opacity-50">Used as the preview image when sharing your venue link on Discord or social media.</p>
        </button>
      )}

      {uploading && <p className="text-xs text-[var(--xiv-blue)] text-center animate-pulse">Uploading…</p>}

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp"
        className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }} />
    </div>
  )
}
