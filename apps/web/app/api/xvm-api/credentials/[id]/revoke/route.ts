import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { revokeCredential } from "@/lib/api/xvm-api"

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) {
    return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
  }

  const { id } = await params

  try {
    const credential = await revokeCredential(token, Number(id))
    return NextResponse.json(credential)
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[xvm-api/credentials/:id/revoke] POST error")
  }
}
