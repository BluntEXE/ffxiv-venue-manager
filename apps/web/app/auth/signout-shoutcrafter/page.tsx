"use client"
import { useEffect } from "react"
import { signOut } from "next-auth/react"

export default function SignOutShoutCrafter() {
  useEffect(() => {
    signOut({ callbackUrl: "https://shout.xivvenuemanager.com" })
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#1e1e2e] text-[#cdd6f4]">
      <p className="text-sm text-[#a6adc8]">Signing out…</p>
    </div>
  )
}
