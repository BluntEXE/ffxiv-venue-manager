import { NextResponse } from "next/server"

/**
 * Superseded per-domain Frogge room webhook receiver. Rooms data moved
 * to the xvm-api backend and the local Room model was dropped; this
 * route is stubbed until Frogge integration is rebuilt against the new
 * backend, if ever.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Rooms plugin integration is being migrated, temporarily unavailable" },
    { status: 501 }
  )
}
