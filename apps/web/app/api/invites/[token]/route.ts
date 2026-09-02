import { NextResponse } from "next/server"
import { getInvitePreview, XvmApiError, xvmErrorMessage } from "@/lib/api/xvm-api"

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  try {
    const preview = await getInvitePreview(token)
    return NextResponse.json({
      invite: {
        venue: preview.venue,
        role: preview.tier.toUpperCase(),
        invitedName: preview.invited_name,
        expiresAt: preview.expires_at,
        invitedBy: { name: preview.invited_by_name ?? undefined },
      },
    })
  } catch (err) {
    if (err instanceof XvmApiError) {
      if (err.status === 404) {
        return NextResponse.json({ error: "Invalid invite link" }, { status: 404 })
      }
      if (err.status === 410) {
        return NextResponse.json({ error: "This invite has expired" }, { status: 410 })
      }
      return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
    }
    console.error("Error fetching invite:", err)
    return NextResponse.json({ error: "Failed to fetch invite details" }, { status: 500 })
  }
}
