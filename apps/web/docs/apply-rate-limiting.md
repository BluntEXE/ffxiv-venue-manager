# Rate Limiting Application Progress

## Completed
- [x] `/api/venues` (GET, POST) - Already done
- [x] `/api/venues/[venueId]/payroll` (GET, POST) - Already done
- [x] `/api/venues/[venueId]/payroll/[payrollId]` (PATCH, DELETE) - Already done
- [x] `/api/venues/[venueId]/events` (GET, POST) - Just completed

## In Progress
Working on remaining endpoints...

## Pattern to Apply

```typescript
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { params } = context
    // ... rest of handler
  },
  { requests: 60, window: "1 m" } // GET = 60/min
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { params } = context
    // ... rest of handler
  },
  { requests: 10, window: "1 m" } // POST = 10/min
)

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string, itemId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { params } = context
    // ... rest of handler
  },
  { requests: 20, window: "1 m" } // PATCH = 20/min
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string, itemId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { params } = context
    // ... rest of handler
  },
  { requests: 5, window: "1 m" } // DELETE = 5/min
)
```

## Rate Limit Standards
- **GET** (read): 60 requests/minute
- **POST** (create): 10 requests/minute
- **PATCH** (update): 20 requests/minute
- **DELETE** (delete): 5 requests/minute
