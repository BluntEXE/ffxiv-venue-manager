"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { ImageIcon, Trash2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const CONTAINER_W = 320
const CONTAINER_H = 220
const FRAME_SIZE  = 200
const FRAME_LEFT  = (CONTAINER_W - FRAME_SIZE) / 2  // 60
const FRAME_TOP   = (CONTAINER_H - FRAME_SIZE) / 2  // 10
const OUTPUT_SIZE = 256

interface LogoUploadProps {
  venueId: string
  initialUrl: string | null
  galleryImages: string[]
  onUpdate: (url: string | null) => void
}

type Tab = "upload" | "gallery"
type Stage = "idle" | "cropping" | "saving"

interface CropState {
  imgEl: HTMLImageElement
  renderedW: number
  renderedH: number
  imgX: number
  imgY: number
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

export function LogoUpload({ venueId, initialUrl, galleryImages, onUpdate }: LogoUploadProps) {
  const [savedUrl, setSavedUrl]   = useState<string | null>(initialUrl)
  const [tab, setTab]             = useState<Tab>("upload")
  const [stage, setStage]         = useState<Stage>("idle")
  const [crop, setCrop]           = useState<CropState | null>(null)
  const [error, setError]         = useState("")
  const fileInputRef              = useRef<HTMLInputElement>(null)
  const dragRef                   = useRef<{ startX: number; startY: number; origImgX: number; origImgY: number } | null>(null)

  // ── Load image into crop UI ────────────────────────────────────────────
  const loadImage = useCallback((src: string) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const scale = Math.max(FRAME_SIZE / img.naturalWidth, FRAME_SIZE / img.naturalHeight)
      const rW = img.naturalWidth  * scale
      const rH = img.naturalHeight * scale
      setCrop({
        imgEl:     img,
        renderedW: rW,
        renderedH: rH,
        imgX:      (CONTAINER_W - rW) / 2,
        imgY:      (CONTAINER_H - rH) / 2,
      })
      setStage("cropping")
    }
    img.onerror = () => setError("Failed to load image")
    img.src = src
  }, [])

  const handleFile = (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("JPEG, PNG or WebP only"); return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Max 10 MB"); return
    }
    setError("")
    loadImage(URL.createObjectURL(file))
  }

  const handleGalleryPick = (url: string) => {
    setError("")
    loadImage(`/api/proxy-image?url=${encodeURIComponent(url)}`)
  }

  // ── Drag handlers ───────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    if (!crop) return
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origImgX: crop.imgX, origImgY: crop.imgY }
  }

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current || !crop) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const minX = FRAME_LEFT + FRAME_SIZE - crop.renderedW
    const maxX = FRAME_LEFT
    const minY = FRAME_TOP  + FRAME_SIZE - crop.renderedH
    const maxY = FRAME_TOP
    setCrop(c => c ? {
      ...c,
      imgX: clamp(dragRef.current!.origImgX + dx, minX, maxX),
      imgY: clamp(dragRef.current!.origImgY + dy, minY, maxY),
    } : c)
  }, [crop])

  const onMouseUp = useCallback(() => { dragRef.current = null }, [])

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup",   onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup",   onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  // ── Crop + upload ───────────────────────────────────────────────────────
  const confirmCrop = async () => {
    if (!crop) return
    setError("")
    setStage("saving")
    try {
      const canvas = document.createElement("canvas")
      canvas.width  = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE
      const ctx = canvas.getContext("2d")!
      const scaleToNatural = crop.imgEl.naturalWidth / crop.renderedW
      const srcX    = (FRAME_LEFT - crop.imgX) * scaleToNatural
      const srcY    = (FRAME_TOP  - crop.imgY) * scaleToNatural
      const srcSize = FRAME_SIZE  * scaleToNatural
      ctx.drawImage(crop.imgEl, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error("Canvas export failed")), "image/jpeg", 0.9)
      )

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "logo.jpg", contentType: "image/jpeg", size: blob.size }),
      })
      if (!uploadRes.ok) { const d = await uploadRes.json(); throw new Error(d.error || "Upload URL failed") }
      const { uploadUrl, storedUrl } = await uploadRes.json()

      const put = await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } })
      if (!put.ok) throw new Error("Upload failed")

      const patch = await fetch(`/api/venues/${venueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: storedUrl }),
      })
      if (!patch.ok) { const d = await patch.json(); throw new Error(d.error || "Failed to save") }

      setSavedUrl(storedUrl)
      onUpdate(storedUrl)
      setStage("idle")
      setCrop(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save logo")
      setStage("cropping")
    }
  }

  const remove = async () => {
    setError("")
    try {
      const patch = await fetch(`/api/venues/${venueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: null }),
      })
      if (!patch.ok) { const d = await patch.json(); throw new Error(d.error || "Failed to remove") }
      setSavedUrl(null)
      onUpdate(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove")
    }
  }

  const cancelCrop = () => { setStage("idle"); setCrop(null); setError("") }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--destructive-soft)] border border-[rgba(243,139,168,0.2)] text-xs text-[var(--destructive)]">
          <X className="w-3.5 h-3.5 shrink-0 cursor-pointer" onClick={() => setError("")} />
          {error}
        </div>
      )}

      {/* Saved state */}
      {stage === "idle" && savedUrl && (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={savedUrl} alt="Venue logo" className="w-20 h-20 rounded-lg object-cover border border-[var(--blue-015)]" />
          <div className="flex flex-col gap-2">
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}
              className="h-7 text-xs border-[var(--blue-020)] hover:border-[var(--xiv-blue)]">
              <Upload className="w-3 h-3 mr-1" /> Change
            </Button>
            <Button size="sm" variant="outline" onClick={remove}
              className="h-7 text-xs border-[rgba(243,139,168,0.3)] text-[var(--destructive)] hover:bg-[var(--destructive-soft)]">
              <Trash2 className="w-3 h-3 mr-1" /> Remove
            </Button>
          </div>
        </div>
      )}

      {/* Idle, no logo yet — show tabs */}
      {stage === "idle" && !savedUrl && (
        <div className="space-y-2">
          <div className="flex gap-2 border-b border-[var(--blue-015)] pb-2">
            {(["upload", "gallery"] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`text-xs px-3 py-1 rounded-md transition-colors ${tab === t ? "bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)] border border-[rgba(0,180,255,0.3)]" : "text-muted-foreground hover:text-foreground"}`}>
                {t === "upload" ? "Upload image" : "From gallery"}
              </button>
            ))}
          </div>

          {tab === "upload" && (
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full border border-dashed border-[var(--blue-015)] rounded-xl p-5 flex flex-col items-center gap-2 text-muted-foreground hover:border-[var(--blue-035)] hover:bg-[var(--blue-007)] transition-colors cursor-pointer">
              <ImageIcon className="w-7 h-7 opacity-40" />
              <span className="text-sm font-medium text-[var(--xiv-blue)]">Upload a logo image</span>
              <p className="text-xs opacity-60">Square images work best · JPEG, PNG or WebP · max 10 MB</p>
            </button>
          )}

          {tab === "gallery" && (
            galleryImages.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No gallery images yet. Upload some in the Gallery section below.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {galleryImages.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="" onClick={() => handleGalleryPick(url)}
                    className="w-full aspect-square object-cover rounded-lg border border-[var(--blue-015)] cursor-pointer hover:border-[var(--xiv-blue)] hover:opacity-90 transition-all" />
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Crop UI */}
      {stage === "cropping" && crop && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Drag to position. The highlighted square is what will be saved.</p>

          <div className="flex gap-4 items-start">
            <div
              className="relative overflow-hidden rounded-lg border border-[var(--blue-015)] cursor-grab active:cursor-grabbing flex-shrink-0"
              style={{ width: CONTAINER_W, height: CONTAINER_H, background: "#070b14" }}
              onMouseDown={onMouseDown}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={crop.imgEl.src}
                alt=""
                draggable={false}
                style={{
                  position: "absolute",
                  left: crop.imgX,
                  top:  crop.imgY,
                  width:  crop.renderedW,
                  height: crop.renderedH,
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              />
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: FRAME_TOP, background: "rgba(0,0,0,0.55)" }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: CONTAINER_H - FRAME_TOP - FRAME_SIZE, background: "rgba(0,0,0,0.55)" }} />
                <div style={{ position: "absolute", top: FRAME_TOP, left: 0, width: FRAME_LEFT, height: FRAME_SIZE, background: "rgba(0,0,0,0.55)" }} />
                <div style={{ position: "absolute", top: FRAME_TOP, right: 0, width: FRAME_LEFT, height: FRAME_SIZE, background: "rgba(0,0,0,0.55)" }} />
                <div style={{ position: "absolute", top: FRAME_TOP, left: FRAME_LEFT, width: FRAME_SIZE, height: FRAME_SIZE, border: "2px solid rgba(0,180,255,0.8)", borderRadius: 4 }} />
              </div>
            </div>

            <div className="flex flex-col items-center gap-1">
              <p className="text-xs text-muted-foreground">Preview</p>
              <div className="w-11 h-11 rounded-lg border border-[var(--blue-015)] overflow-hidden bg-[var(--surface1)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={crop.imgEl.src}
                  alt=""
                  style={{
                    width:     crop.renderedW * (44 / FRAME_SIZE),
                    height:    crop.renderedH * (44 / FRAME_SIZE),
                    marginLeft: (crop.imgX - FRAME_LEFT) * (44 / FRAME_SIZE),
                    marginTop:  (crop.imgY - FRAME_TOP)  * (44 / FRAME_SIZE),
                    display: "block",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={confirmCrop}
              className="text-xs bg-[var(--xiv-blue)] text-[#070b14] hover:opacity-90">
              Save logo
            </Button>
            <Button size="sm" variant="outline" onClick={cancelCrop}
              className="text-xs border-[var(--blue-020)]">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {stage === "saving" && (
        <p className="text-xs text-[var(--xiv-blue)] animate-pulse">Saving logo...</p>
      )}

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
        className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
    </div>
  )
}
