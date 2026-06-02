"use client"

import { useState, useRef } from "react"
import { ImageIcon, Trash2, Upload, X } from "lucide-react"

interface GalleryManagerProps {
  venueId: string
  initialImages: string[]
}

export function GalleryManager({ venueId, initialImages }: GalleryManagerProps) {
  const [images, setImages] = useState<string[]>(initialImages)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    setError("")
    setUploading(true)
    try {
      // 1. Get a pre-signed upload URL
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to get upload URL") }
      const { uploadUrl, storedUrl } = await res.json()

      // 2. PUT directly to MinIO
      const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } })
      if (!put.ok) throw new Error("Upload failed")

      // 3. Register the public URL (returned by the server, not derived from the presigned URL)
      const publicUrl = storedUrl
      const reg = await fetch(`/api/venues/${venueId}/gallery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: publicUrl }),
      })
      if (!reg.ok) { const d = await reg.json(); throw new Error(d.error || "Failed to save") }
      const { galleryImages } = await reg.json()
      setImages(galleryImages)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const remove = async (url: string) => {
    try {
      const res = await fetch(`/api/venues/${venueId}/gallery`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) throw new Error("Failed to remove image")
      const { galleryImages } = await res.json()
      setImages(galleryImages)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove")
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--destructive-soft)] border border-[rgba(243,139,168,0.2)] text-sm text-[var(--destructive)]">
          <X className="w-4 h-4 flex-shrink-0" onClick={() => setError("")} style={{ cursor: "pointer" }} />
          {error}
        </div>
      )}

      {/* Image grid */}
      {images.length > 0 && (
        <div className="gallery">
          {images.map((url) => (
            <div key={url} className="gtile group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Gallery image" className="absolute inset-0 w-full h-full object-cover" />
              <button
                onClick={() => remove(url)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-[rgba(0,0,0,0.7)] border border-[rgba(243,139,168,0.3)] text-[var(--destructive)] p-1.5 rounded-lg hover:bg-[var(--destructive-soft)]"
                title="Remove image"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {/* Add more slot */}
          {images.length < 9 && (
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="gtile border-dashed hover:border-[var(--blue-035)] hover:bg-[var(--blue-007)] transition-colors cursor-pointer"
            >
              <Upload className="w-6 h-6 text-[var(--fg-faint)]" />
            </button>
          )}
        </div>
      )}

      {/* Empty state upload button */}
      {images.length === 0 && (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full border border-dashed border-[var(--blue-015)] rounded-xl p-8 flex flex-col items-center gap-3 text-muted-foreground hover:border-[var(--blue-035)] hover:bg-[var(--blue-007)] hover:text-foreground transition-colors cursor-pointer"
        >
          <ImageIcon className="w-8 h-8 opacity-40" />
          <div className="text-sm">
            <span className="font-medium text-[var(--xiv-blue)]">Upload photos</span> of your venue
          </div>
          <p className="text-xs opacity-60">JPEG, PNG or WebP · max 10 MB · up to 9 images</p>
        </button>
      )}

      {uploading && (
        <p className="text-xs text-[var(--xiv-blue)] text-center animate-pulse">Uploading…</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }}
      />
    </div>
  )
}
