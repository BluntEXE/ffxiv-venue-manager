import { NextResponse } from "next/server"

/**
 * Rooms data moved to the xvm-api backend; the local Room model was
 * dropped. Plugin integration with the new backend is deferred to
 * later work, so this route is stubbed until then.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Rooms plugin integration is being migrated, temporarily unavailable" },
    { status: 501 }
  )
}
