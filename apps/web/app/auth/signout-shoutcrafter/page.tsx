"use client"
import { useEffect } from "react"
import { signOut } from "next-auth/react"

export default function SignOutShoutCrafter() {
  useEffect(() => {
    signOut({ callbackUrl: "https://shout.xivvenuemanager.com" })
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-sm text-muted-foreground">Signing out…</p>
    </div>
  )
}
