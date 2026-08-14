# Zod Validation Registry — Roles/Services/Tasks Description Fields (Increment 11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up 6 registry validators (`roleName`, `roleDescription`, `serviceName`, `serviceDescription`, `taskTitle`, `taskDescription`) that have existed in `apps/web/lib/validation.ts` with **zero consumers anywhere in the codebase** (confirmed via grep during planning) into the 6 routes that actually create/update these entities. All 6 routes already use the full `.parse()` + `z.ZodError` pattern with local schemas — this is a purely mechanical field-swap (replace a locally-duplicated `z.string()...` with the matching registry validator), not a restructuring. Closes a real gap: every one of these 6 routes' `description`/`responsibilities` field is currently **completely unbounded** — no length cap at all — despite the registry already having the correct cap for each (`roleDescription` 500, `serviceDescription` 1000, `taskDescription` 2000).

**Architecture:** Swap the local `name`/`title` and `description`/`responsibilities` field definitions for the registry equivalents in each of the 6 existing local schemas. No other code in any of these 6 files changes — the `.parse()` call sites, the `prisma.create`/`prisma.update` calls, the response shapes, everything downstream is already correct and untouched.

**Tech Stack:** TypeScript, Next.js App Router route handlers, Zod.

**Confirmed real gap and zero-consumer status (checked during planning, 2026-08-14):** `grep -rln "validators.roleName\|validators.roleDescription\|validators.serviceName\|validators.serviceDescription\|validators.taskTitle\|validators.taskDescription" apps/web/app/api` returns nothing — all 6 registry fields are currently dead code, defined but never used. All 6 target routes' `name`/`title` fields already have the exact same bounds as their registry counterparts (just phrased with a slightly different message string and defined locally instead of shared) — only the `description`/`responsibilities` fields are a genuine behavior gap (currently unbounded, registry caps them).

**One registry widening needed:** `taskDescription` needs `.nullable()` added — `app/api/venues/[venueId]/tasks/[taskId]/route.ts`'s existing `updateTaskSchema` has `description: z.string().nullable().optional()` (supports explicit-null-to-clear, matching several other nullable fields on that same schema like `category`/`assignedRoleId`/`dueDate`). Since `taskDescription` has zero other consumers, this widening is risk-free (same reasoning as Increment 7's `venueDescription`/`venueLocation`/`url` widening). `roleDescription`/`serviceDescription` do NOT need `.nullable()` — their local schemas (`updateRoleSchema.responsibilities`, `updateServiceSchema.description`) are currently plain `.optional()` with no null-clear support, so no widening needed there; don't invent nullability nobody asked for.

---

## Task 1: Widen `taskDescription` to accept explicit `null`

**Files:**
- Modify: `apps/web/lib/validation.ts`

- [ ] **Step 1: Add `.nullable()`**

Find:
```typescript
  taskDescription: z.string().max(2000, "Description too long (max 2000 characters)").optional(),
```
Change to:
```typescript
  taskDescription: z.string().max(2000, "Description too long (max 2000 characters)").optional().nullable(),
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/validation.ts
git commit -m "feat(web): widen taskDescription validator to accept explicit null"
```

---

## Task 2: Wire `roleName`/`roleDescription` into both role routes

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/roles/route.ts`
- Modify: `apps/web/app/api/venues/[venueId]/roles/[roleId]/route.ts`

- [ ] **Step 1: `roles/route.ts` — add the import, swap the schema fields**

Current (`apps/web/app/api/venues/[venueId]/roles/route.ts:1-15`):
```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const createRoleSchema = z.object({
  name: z.string().min(1, "Role name is required").max(50),
  responsibilities: z.string().optional(),
  color: z.string().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  hourlyRate: z.number().positive().nullable().optional(),
  potPayoutMode: z.enum(["STANDARD", "POT", "CONTRACTOR"]).optional(),
  contractorSharesPot: z.boolean().optional(),
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

const createRoleSchema = z.object({
  name: validators.roleName,
  responsibilities: validators.roleDescription,
  color: z.string().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  hourlyRate: z.number().positive().nullable().optional(),
  potPayoutMode: z.enum(["STANDARD", "POT", "CONTRACTOR"]).optional(),
  contractorSharesPot: z.boolean().optional(),
})
```

Nothing else in this file changes — `validatedData.name`/`validatedData.responsibilities` at the `prisma.role.create` call site (around line 128-129) keep working identically, just with real bounds enforced now.

- [ ] **Step 2: `roles/[roleId]/route.ts` — same swap, `.optional()`-wrapped since this is an update route**

Current (`apps/web/app/api/venues/[venueId]/roles/[roleId]/route.ts:1-15`):
```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const updateRoleSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  responsibilities: z.string().optional(),
  color: z.string().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  hourlyRate: z.number().positive().nullable().optional(),
  potPayoutMode: z.enum(["STANDARD", "POT", "CONTRACTOR"]).optional(),
  contractorSharesPot: z.boolean().optional(),
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

const updateRoleSchema = z.object({
  name: validators.roleName.optional(),
  responsibilities: validators.roleDescription,
  color: z.string().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  hourlyRate: z.number().positive().nullable().optional(),
  potPayoutMode: z.enum(["STANDARD", "POT", "CONTRACTOR"]).optional(),
  contractorSharesPot: z.boolean().optional(),
})
```

`name` gets an extra `.optional()` (registry's `roleName` is required-by-default, matching the create route's need) — `responsibilities` doesn't need one, `validators.roleDescription` is already `.optional()` in the registry.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/roles/route.ts" "apps/web/app/api/venues/[venueId]/roles/[roleId]/route.ts"
git commit -m "fix(web): validate role name/responsibilities via shared registry, close unbounded-description gap"
```

---

## Task 3: Wire `serviceName`/`serviceDescription` into both service routes

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/services/route.ts`
- Modify: `apps/web/app/api/venues/[venueId]/services/[serviceId]/route.ts`

- [ ] **Step 1: `services/route.ts` — add the import, swap the schema fields**

Current (`apps/web/app/api/venues/[venueId]/services/route.ts:1-19`):
```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getOrSet, invalidateCache, cacheKeys, cacheTTL } from "@/lib/redis-cache"
import { ensureManagerRole } from "@/lib/api/venue-setup"

const createServiceSchema = z.object({
  name: z.string().min(1, "Service name is required").max(100),
  description: z.string().optional(),
  price: z.number().min(0, "Price must be positive"),
  roleIds: z.array(z.string()).optional().default([]),
  isActive: z.boolean().default(true),
  linkedItemId: z.number().int().positive().nullable().optional(),
  linkedItemName: z.string().nullable().optional(),
  linkedItemIcon: z.number().int().nullable().optional(),
  stockCount: z.number().int().min(0).nullable().optional(),
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
import { getOrSet, invalidateCache, cacheKeys, cacheTTL } from "@/lib/redis-cache"
import { ensureManagerRole } from "@/lib/api/venue-setup"
import { validators } from "@/lib/validation"

const createServiceSchema = z.object({
  name: validators.serviceName,
  description: validators.serviceDescription,
  price: z.number().min(0, "Price must be positive"),
  roleIds: z.array(z.string()).optional().default([]),
  isActive: z.boolean().default(true),
  linkedItemId: z.number().int().positive().nullable().optional(),
  linkedItemName: z.string().nullable().optional(),
  linkedItemIcon: z.number().int().nullable().optional(),
  stockCount: z.number().int().min(0).nullable().optional(),
})
```

- [ ] **Step 2: `services/[serviceId]/route.ts` — same swap, `.optional()`-wrapped**

Current (`apps/web/app/api/venues/[venueId]/services/[serviceId]/route.ts:1-17`):
```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"

const updateServiceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  price: z.number().min(0).optional(),
  roleIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  linkedItemId: z.number().int().positive().nullable().optional(),
  linkedItemName: z.string().nullable().optional(),
  linkedItemIcon: z.number().int().nullable().optional(),
  stockCount: z.number().int().min(0).nullable().optional(),
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
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"
import { validators } from "@/lib/validation"

const updateServiceSchema = z.object({
  name: validators.serviceName.optional(),
  description: validators.serviceDescription,
  price: z.number().min(0).optional(),
  roleIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  linkedItemId: z.number().int().positive().nullable().optional(),
  linkedItemName: z.string().nullable().optional(),
  linkedItemIcon: z.number().int().nullable().optional(),
  stockCount: z.number().int().min(0).nullable().optional(),
})
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/services/route.ts" "apps/web/app/api/venues/[venueId]/services/[serviceId]/route.ts"
git commit -m "fix(web): validate service name/description via shared registry, close unbounded-description gap"
```

---

## Task 4: Wire `taskTitle`/`taskDescription` into both task routes

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/tasks/route.ts`
- Modify: `apps/web/app/api/venues/[venueId]/tasks/[taskId]/route.ts`

- [ ] **Step 1: `tasks/route.ts` — add the import, swap the schema fields**

Current (`apps/web/app/api/venues/[venueId]/tasks/route.ts:1-21`):
```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
  sendDiscordWebhook,
  formatTaskCreatedEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { notify } from "@/lib/notify"

const createTaskSchema = z.object({
  title: z.string().min(1, "Task title is required").max(200),
  description: z.string().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).default("PENDING"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  category: z.string().optional(),
  assignedRoleId: z.string().optional(),
  dueDate: z.string().optional(),
})
```

New:
```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
  sendDiscordWebhook,
  formatTaskCreatedEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { notify } from "@/lib/notify"
import { validators } from "@/lib/validation"

const createTaskSchema = z.object({
  title: validators.taskTitle,
  description: validators.taskDescription,
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).default("PENDING"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  category: z.string().optional(),
  assignedRoleId: z.string().optional(),
  dueDate: z.string().optional(),
})
```

- [ ] **Step 2: `tasks/[taskId]/route.ts` — same swap, using the now-nullable `taskDescription`**

Current (`apps/web/app/api/venues/[venueId]/tasks/[taskId]/route.ts:1-20`):
```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
  sendDiscordWebhook,
  formatTaskCompletedEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  category: z.string().nullable().optional(),
  assignedRoleId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
})
```

New:
```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
  sendDiscordWebhook,
  formatTaskCompletedEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"

const updateTaskSchema = z.object({
  title: validators.taskTitle.optional(),
  description: validators.taskDescription,
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  category: z.string().nullable().optional(),
  assignedRoleId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
})
```

`description: validators.taskDescription` here relies on Task 1's registry widening (`.optional().nullable()`) to preserve this route's existing explicit-null-to-clear support — this task must run after Task 1.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/tasks/route.ts" "apps/web/app/api/venues/[venueId]/tasks/[taskId]/route.ts"
git commit -m "fix(web): validate task title/description via shared registry, close unbounded-description gap"
```

---

## Task 5: Full regression pass + manual verification + push

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, typecheck, build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && pnpm build
```

- [ ] **Step 2: Manual verification (session-authenticated, use an active browser session if available)**

Use the disposable "Velvet Rift" `TEST_VENUE` (used in Increments 7-10) to avoid touching real venue data. For each of the 3 entity types, run both a regression check and an oversized-description check, then delete whatever was created:

1. **Role**: `POST /api/venues/<id>/roles` with `{ name: "Test Role", responsibilities: "a".repeat(501) }` → expect 400 (over the 500-char cap). Then `{ name: "Test Role" }` (no responsibilities) → expect 201, role created — delete it after via `DELETE /api/venues/<id>/roles/<roleId>` or `psql`.
2. **Service**: `POST /api/venues/<id>/services` with `{ name: "Test Service", price: 100, description: "a".repeat(1001) }` → expect 400. Then `{ name: "Test Service", price: 100 }` → expect 201 — delete after.
3. **Task**: `POST /api/venues/<id>/tasks` with `{ title: "Test Task", description: "a".repeat(2001) }` → expect 400. Then `{ title: "Test Task" }` → expect 201 — delete after. Also verify the update route's explicit-null-clear still works: `PATCH /api/venues/<id>/tasks/<taskId>` with `{ description: null }` → expect 200, `description` actually clears to `null` in the response.

- [ ] **Step 3: Push**

```bash
cd ~/xiv-app && git push origin main
```

Hold on `~/bin/deploy-xiv-web.sh --green` until the user confirms. Reorder in practice as established: push → confirm deploy → deploy → THEN run Step 2's manual verification against the now-live code → update the roadmap doc.
