import { NextResponse } from "next/server"
import { verifyMobileJwt } from "@/lib/auth/mobile-auth"

/**
 * Verify the mobile JWT from the Authorization header.
 * Returns the userId string on success, or a 401 Response on failure.
 * Use with the isAuthFailure type guard:
 *
 *   const result = await requireMobileAuth(req)
 *   if (isAuthFailure(result)) return result
 *   const userId = result
 */
export async function requireMobileAuth(req: Request): Promise<string | Response> {
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const payload = await verifyMobileJwt(auth)
    return payload.sub
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export function isAuthFailure(v: string | Response): v is Response {
  return v instanceof Response
}
