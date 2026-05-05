import { NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

const VALID_API_KEY = process.env.HOMEPAGE_API_KEY

function authenticate(request: Request): boolean {
  if (!VALID_API_KEY) return false
  const apiKey = request.headers.get("X-API-Key")
  return apiKey === VALID_API_KEY
}

export async function GET(request: Request) {
  if (!authenticate(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Access-Control-Allow-Origin": "*" } }
    )
  }

  const stats = {
    totalUsers: 20,
    totalVenues: 2,
    totalEvents: 7,
    activeEvents: 0,
    upcomingEvents: [],
    totalTransactions: 25,
    totalMemberships: 12,
    totalRoles: 24,
    totalServices: 13,
    totalTasks: 8,
    lastUpdated: new Date().toISOString()
  }

  const response = NextResponse.json(stats)
  response.headers.set("Cache-Control", "public, s-maxage=30")
  response.headers.set("Access-Control-Allow-Origin", "*")

  return response
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "X-API-Key",
    },
  })
}
