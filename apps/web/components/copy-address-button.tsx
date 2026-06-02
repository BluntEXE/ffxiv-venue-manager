"use client"

import { useState } from "react"
import { Navigation, Check } from "lucide-react"

export function CopyAddressInline({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(address).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }
  return (
    <button
      onClick={copy}
      className="btn btn-outline btn-sm flex items-center gap-2 px-4 py-[7px] text-[0.85rem] rounded-[var(--radius-md)] border border-[var(--blue-018)] bg-[rgba(7,11,20,0.5)] hover:border-[var(--blue-045)] hover:bg-[var(--blue-007)] transition-colors"
    >
      {copied ? <Check className="w-4 h-4" /> : <Navigation className="w-4 h-4" />}
      {copied ? "Copied!" : "Copy address"}
    </button>
  )
}

export function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard?.writeText(address).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  return (
    <button
      onClick={copy}
      className="copy-addr mt-[14px] w-full xiv-btn-shimmer xiv-cta flex items-center justify-center gap-2 px-5 py-[10px] rounded-[var(--radius-md)] text-[0.9rem] font-semibold transition-all"
    >
      {copied ? <Check className="w-4 h-4" /> : <Navigation className="w-4 h-4" />}
      {copied ? "Copied!" : "Copy travel address"}
    </button>
  )
}
