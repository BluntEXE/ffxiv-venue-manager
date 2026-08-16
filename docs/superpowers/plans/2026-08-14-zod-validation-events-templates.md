# Zod Validation Registry — Events/Event-Templates Title/Description (Increment 13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up `validators.eventTitle`/`validators.eventDescription` — both existing in the registry with **zero consumers anywhere in the codebase** — into the 4 routes that create/update events and event templates. Real gap closed: `title`/`description` are completely unbounded in all 4 routes (registry caps: title 150 chars, description 3000). This is the same pattern as Increment 11 (roles/services/tasks), applied to a 4th entity family.

**Architecture:** Purely mechanical field-swap in the existing local schemas — all 4 routes already use `.parse()` + `z.ZodError`. No new registry field needed for `name` (the event-_template_'s own label, distinct from the event's `title`) — stays a route-local field with a new 100-char cap (previously also unbounded), since it's single-consumer and has no matching registry entry.

**Tech Stack:** TypeScript, Next.js App Router route handlers, Zod.

**Confirmed real gap, zero-consumer status, and no-nullable-needed (checked during planning, 2026-08-14):**

- `grep -rln "validators.eventTitle\|validators.eventDescription" apps/web/app/api` returns nothing.
- All 4 routes' `title`/`description` are unbounded today: `apps/web/app/api/venues/[venueId]/events/route.ts:10-11`, `apps/web/app/api/venues/[venueId]/events/[eventId]/route.ts:9-10`, `apps/web/app/api/venues/[venueId]/event-templates/route.ts:10-11`, `apps/web/app/api/venues/[venueId]/event-templates/[templateId]/route.ts:10-11`.
- Checked the real callers (`app/dashboard/[slug]/events/new/page.tsx:162`, `app/dashboard/[slug]/events/[eventId]/edit/page.tsx:110`) — both send `description: ... || undefined`, **never `null`**. No registry widening needed (unlike Increment 7's `venueDescription`) — `validators.eventDescription` is already `.optional()`, that's sufficient.

---

## Task 1: Wire `eventTitle`/`eventDescription` into `events/route.ts` and `events/[eventId]/route.ts`

**Files:**

- Modify: `apps/web/app/api/venues/[venueId]/events/route.ts`
- Modify: `apps/web/app/api/venues/[venueId]/events/[eventId]/route.ts`

- [ ] **Step 1: `events/route.ts` — add the import, swap the 2 fields**

Current (`apps/web/app/api/venues/[venueId]/events/route.ts:1-18`):

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { generateOccurrences, type RecurrenceRule } from "@/lib/recurrence"

const eventSchema = z.object({
  title: z.string().min(1, "Event title is required"),
  description: z.string().optional(),
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]),
  status: z.enum(["DRAFT", "PUBLISHED", "ACTIVE", "COMPLETED", "CANCELLED"]).default("DRAFT"),
  startTime: z.string().transform((str) => new Date(str)),
  endTime: z.string().transform((str) => new Date(str)),
  timezone: z.string().default("UTC"),
  recurrenceRule: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
})
```

New:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { generateOccurrences, type RecurrenceRule } from "@/lib/recurrence"
import { validators } from "@/lib/validation"

const eventSchema = z.object({
  title: validators.eventTitle,
  description: validators.eventDescription,
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]),
  status: z.enum(["DRAFT", "PUBLISHED", "ACTIVE", "COMPLETED", "CANCELLED"]).default("DRAFT"),
  startTime: z.string().transform((str) => new Date(str)),
  endTime: z.string().transform((str) => new Date(str)),
  timezone: z.string().default("UTC"),
  recurrenceRule: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
})
```

- [ ] **Step 2: `events/[eventId]/route.ts` — same swap, `title` gets `.optional()`**

Current (`apps/web/app/api/venues/[venueId]/events/[eventId]/route.ts:1-18`):

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const eventUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
  startTime: z
    .string()
    .transform((str) => new Date(str))
    .optional(),
  endTime: z
    .string()
    .transform((str) => new Date(str))
    .optional(),
  timezone: z.string().optional(),
  attendanceCount: z.number().optional(),
  revenue: z.number().optional(),
})
```

New:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"

const eventUpdateSchema = z.object({
  title: validators.eventTitle.optional(),
  description: validators.eventDescription,
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
  startTime: z
    .string()
    .transform((str) => new Date(str))
    .optional(),
  endTime: z
    .string()
    .transform((str) => new Date(str))
    .optional(),
  timezone: z.string().optional(),
  attendanceCount: z.number().optional(),
  revenue: z.number().optional(),
})
```

`attendanceCount`/`revenue` and every other field stay untouched.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/events/route.ts" "apps/web/app/api/venues/[venueId]/events/[eventId]/route.ts"
git commit -m "fix(web): validate event title/description via shared registry, close unbounded-input gap"
```

---

## Task 2: Wire `eventTitle`/`eventDescription` into both event-template routes, cap the local `name` field

**Files:**

- Modify: `apps/web/app/api/venues/[venueId]/event-templates/route.ts`
- Modify: `apps/web/app/api/venues/[venueId]/event-templates/[templateId]/route.ts`

- [ ] **Step 1: `event-templates/route.ts` — add the import, swap `title`/`description`, cap `name` locally**

Current (`apps/web/app/api/venues/[venueId]/event-templates/route.ts:1-16`):

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  title: z.string().min(1, "Event title is required"),
  description: z.string().optional(),
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]),
  timezone: z.string().default("UTC"),
  defaultStartTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format. Use HH:MM")
    .default("19:00"),
  defaultEndTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format. Use HH:MM")
    .default("22:00"),
})
```

New:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"

const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required").max(100, "Template name too long (max 100 characters)"),
  title: validators.eventTitle,
  description: validators.eventDescription,
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]),
  timezone: z.string().default("UTC"),
  defaultStartTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format. Use HH:MM")
    .default("19:00"),
  defaultEndTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format. Use HH:MM")
    .default("22:00"),
})
```

`name` (the template's own label, distinct from the event's `title` it generates) has no matching registry field — kept local, capped at 100 chars (matching the `serviceName`/other short-label precedent), closing what was previously also an unbounded field.

- [ ] **Step 2: `event-templates/[templateId]/route.ts` — same swap**

Current (`apps/web/app/api/venues/[venueId]/event-templates/[templateId]/route.ts:1-16`):

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]).optional(),
  timezone: z.string().optional(),
  defaultStartTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format. Use HH:MM")
    .optional(),
  defaultEndTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format. Use HH:MM")
    .optional(),
})
```

New:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100, "Template name too long (max 100 characters)").optional(),
  title: validators.eventTitle.optional(),
  description: validators.eventDescription,
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]).optional(),
  timezone: z.string().optional(),
  defaultStartTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format. Use HH:MM")
    .optional(),
  defaultEndTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format. Use HH:MM")
    .optional(),
})
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/event-templates/route.ts" "apps/web/app/api/venues/[venueId]/event-templates/[templateId]/route.ts"
git commit -m "fix(web): validate event-template name/title/description, close unbounded-input gap"
```

---

## Task 3: Full regression pass + manual verification + push

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, typecheck, build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && pnpm build
```

- [ ] **Step 2: Manual verification (session-authenticated, use an active browser session if available)**

Use the disposable "Velvet Rift" `TEST_VENUE` (used in Increments 7-12) to avoid touching real venue data.

1. **Event**: `POST /api/venues/<id>/events` with `{ title: "a".repeat(151), eventType: "SOCIAL", startTime: "2026-09-01T18:00:00Z", endTime: "2026-09-01T20:00:00Z" }` → expect 400 (over the 150-char title cap). Then with a normal title → expect 201, delete after.
2. **Event template**: `POST /api/venues/<id>/event-templates` with `{ name: "a".repeat(101), title: "Test", eventType: "SOCIAL" }` → expect 400 (over the 100-char name cap). Then with `{ description: "a".repeat(3001), name: "Test", title: "Test", eventType: "SOCIAL" }` → expect 400 (over the 3000-char description cap). Then with normal values → expect 201, delete after.

- [ ] **Step 3: Push**

```bash
cd ~/xiv-app && git push origin main
```

Hold on `~/bin/deploy-xiv-web.sh --green` until the user confirms. Reorder in practice as established: push → confirm deploy → deploy → THEN run Step 2's manual verification against the now-live code → update the roadmap doc.
