"use client"

import { signOut } from "next-auth/react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"

interface UserMenuProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

export function UserMenu({ user }: UserMenuProps) {
  const initials = user.name
    ? user.name
        .split(" ")
        .map(n => n[0])
        .join("")
        .toUpperCase()
    : "U"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="user-chip" aria-label="Open user menu">
          <Avatar className="h-7 w-7 flex-shrink-0">
            <AvatarImage src={user.image || undefined} alt={user.name || "User"} />
            <AvatarFallback className="text-[0.7rem] font-bold text-white user-chip-av">{initials}</AvatarFallback>
          </Avatar>
          <span className="user-chip-name">{user.name || "User"}</span>
          <ChevronDown className="h-3.5 w-3.5 text-foreground/40 flex-shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name || "User"}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-[rgba(0,180,255,0.15)]" />
        <DropdownMenuItem asChild>
          <Link href="/dashboard">Dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/api-keys">API Keys</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/account/characters">My Characters</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-[rgba(0,180,255,0.15)]" />
        <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
