import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getValidXvmApiToken, invalidateXvmApiCredential } from "@/lib/api/xvm-api-store"
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

  try {
    const me = await getMe(token)
    return NextResponse.json(me)
  } catch {
    // Any failure here (including a 401 from a token revoked out from under
    // us) invalidates the stored token so the next sign-in re-mints one.
    await invalidateXvmApiCredential(session.user.id)
    return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
  }
}
