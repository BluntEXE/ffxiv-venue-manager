/**
 * Rate Limiting Test Script
 *
 * Tests the rate limiting functionality by making multiple requests
 * to the /api/venues endpoint and checking the response headers.
 *
 * Expected behavior:
 * - First 60 requests should succeed (status 200 or 401)
 * - Request 61+ should be blocked with status 429
 * - Rate limit headers should be present in all responses
 *
 * Note: Without Redis configured, rate limiting will be bypassed
 * and all requests will succeed (this is expected behavior for development).
 */

const baseUrl = "http://localhost:3001"

async function testRateLimit() {
  console.log("🧪 Testing rate limiting on /api/venues endpoint\n")
  console.log("📊 Rate limit: 60 requests per minute (GET)\n")

  let blockedCount = 0
  let successCount = 0

  for (let i = 1; i <= 65; i++) {
    try {
      const response = await fetch(`${baseUrl}/api/venues`)

      const limit = response.headers.get("X-RateLimit-Limit")
      const remaining = response.headers.get("X-RateLimit-Remaining")
      const reset = response.headers.get("X-RateLimit-Reset")

      console.log(`Request ${i.toString().padStart(2)}:`, {
        status: response.status,
        limit: limit || "N/A",
        remaining: remaining || "N/A",
        reset: reset ? new Date(parseInt(reset) * 1000).toLocaleTimeString() : "N/A",
      })

      if (response.status === 429) {
        blockedCount++
        const body = await response.json()
        console.log(`   ⛔ ${body.message || "Rate limit exceeded"}`)

        if (blockedCount === 1) {
          console.log("\n✅ Rate limit working! Request blocked after exceeding limit.\n")
        }
      } else if (response.status === 200 || response.status === 401) {
        successCount++
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100))

    } catch (error) {
      console.error(`Request ${i} failed:`, error.message)
    }
  }

  console.log("\n" + "=".repeat(60))
  console.log("📈 Test Summary:")
  console.log("=".repeat(60))
  console.log(`✅ Successful requests: ${successCount}`)
  console.log(`⛔ Blocked requests (429): ${blockedCount}`)

  if (blockedCount > 0) {
    console.log("\n✅ Rate limiting is working correctly!")
  } else {
    console.log("\n⚠️  No requests were blocked.")
    console.log("   This is expected if:")
    console.log("   - Redis credentials are not configured (development mode)")
    console.log("   - Rate limiting is disabled in the middleware")
    console.log("\n   To enable rate limiting:")
    console.log("   1. Set up Upstash Redis (see RATE_LIMITING_SETUP.md)")
    console.log("   2. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to .env")
    console.log("   3. Restart the dev server")
  }
}

// Run the test
testRateLimit().catch(console.error)
