"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

interface TocItem { id: string; label: string }

export function GuideTOC({
  items,
  footerLink,
}: {
  items: TocItem[]
  footerLink: { href: string; label: string }
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "")

  useEffect(() => {
    const spy = () => {
      let current = items[0]?.id ?? ""
      for (const { id } of items) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= 120) current = id
      }
      setActiveId(current)
    }
    window.addEventListener("scroll", spy, { passive: true })
    spy()
    return () => window.removeEventListener("scroll", spy)
  }, [items])

  return (
    <aside className="hidden lg:block sticky top-[84px]">
      <div className="text-[0.66rem] uppercase tracking-[0.14em] text-[var(--fg-faint)] font-semibold px-3 mb-2.5">
        On this page
      </div>
      <nav>
        {items.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            className={`block text-[0.88rem] px-3 py-2 border-l-2 rounded-r transition-colors ${
              activeId === id
                ? "border-[var(--xiv-blue)] text-[var(--xiv-blue)] bg-[var(--blue-007)] font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
            }`}
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="mt-4 pt-3 border-t border-[var(--blue-008)]">
        <Link
          href={footerLink.href}
          className="block text-[0.78rem] text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors px-3"
        >
          {footerLink.label} →
        </Link>
      </div>
    </aside>
  )
}
