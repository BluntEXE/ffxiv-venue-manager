import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listMyCredentials } from "@/lib/api/xvm-api"

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
    const credentials = await listMyCredentials(token)
    return NextResponse.json(credentials)
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[xvm-api/credentials] GET error")
  }
}
