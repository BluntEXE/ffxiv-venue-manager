import { NextResponse } from "next/server"

/**
 * GET /api/plugin/rooms?venueId=…
 *
 * Rooms data moved to the xvm-api backend; the local Room model was
 * dropped. Plugin integration with the new backend is deferred to
 * later work, so this route is stubbed until then.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Rooms plugin integration is being migrated, temporarily unavailable" },
    { status: 501 }
  )
}
