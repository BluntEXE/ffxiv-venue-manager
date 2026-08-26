import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getValidXvmApiToken } from "@/lib/api/xvm-api-store"
import { getMe } from "@/lib/api/xvm-api"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) {
    return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
  }

  const me = await getMe(token)
  return NextResponse.json(me)
}
