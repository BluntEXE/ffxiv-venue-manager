# Zod Validation Registry — Shift Notes Field (Increment 14) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap `apps/web/app/api/venues/[venueId]/shifts/route.ts`'s POST handler's `notes` field, currently `z.string().optional()` with **zero length limit**. Unlike most gaps found late in this rollout, this one is confirmed **live-reachable through the real UI** — `components/create-shift-dialog.tsx` has a single-line `Input` (not a textarea) bound to this field, sent as `notes: notes || undefined` on every shift creation.

**Architecture:** Single-field, single-route, minimal change. No registry field matches this exactly (`taskNotes` is 1000 chars for a different entity, `payrollNotes`/`transactionNotes` are 500 for financial records) — kept local per the "don't promote single-consumer fields" rule, capped at 200 chars to match the field's actual UX intent (the placeholder text — `"e.g. DJ set, bartender, greeter"` — and the single-line `Input` widget both signal a short label, not a long note).

**Correction (2026-08-14, post-review):** this plan originally claimed the 200-char cap "matches the cap already used for a similarly-scoped field elsewhere in this rollout, `apps/web/app/api/plugin/rooms/status/route.ts`'s `note` field at 200 chars" — that claim was factually wrong, caught by code-quality review. That route's `note` field is actually capped at 500 chars, not 200. The 200-char cap here still stands on its own merits (the field's own single-line-`Input`/short-placeholder UX), it just isn't matching an existing precedent as claimed.

**Tech Stack:** TypeScript, Next.js App Router route handlers, Zod.

**Confirmed real gap and live reachability (checked during planning, 2026-08-14):** `apps/web/app/api/venues/[venueId]/shifts/route.ts:103` — `notes: z.string().optional()`, no `.max()`. `components/create-shift-dialog.tsx:126` sends `notes: notes || undefined` from a real `<Input>` field (line 380-386) with no client-side `maxLength` either — a manager filling in the shift-creation form today can already submit an arbitrarily long string with nothing stopping them. This is the first gap in the "auditing the remaining 5 consistency-pool routes" pass that's actually reachable via the live UI, not just a theoretical API-contract gap.

---

## Task 1: Cap `notes` in `app/api/venues/[venueId]/shifts/route.ts`

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/shifts/route.ts`

- [ ] **Step 1: Add the `.max()` bound**

Current (`apps/web/app/api/venues/[venueId]/shifts/route.ts:96-107`):

```typescript
const createShiftSchema = z
  .object({
    membershipId: z.string().min(1).optional(),
    roleId: z.string().min(1).optional(),
    eventId: z.string().min(1).optional(),
    scheduledStart: z.string().datetime(),
    scheduledEnd: z.string().datetime(),
    notes: z.string().optional(),
    recurrenceRule: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
    slotGroupId: z.string().optional(),
  })
  // Cross-field rule (spans membershipId and roleId), so the error is form-level: no single field is "wrong" on its own.
  .refine((data) => Boolean(data.membershipId) || Boolean(data.roleId), {
    message: "Provide a staff member (assign now), a role (leave open), or both (assign now with a role tagged for pay)",
  })
```

New:

```typescript
const createShiftSchema = z
  .object({
    membershipId: z.string().min(1).optional(),
    roleId: z.string().min(1).optional(),
    eventId: z.string().min(1).optional(),
    scheduledStart: z.string().datetime(),
    scheduledEnd: z.string().datetime(),
    notes: z.string().max(200, "Notes too long (max 200 characters)").optional(),
    recurrenceRule: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
    slotGroupId: z.string().optional(),
  })
  // Cross-field rule (spans membershipId and roleId), so the error is form-level: no single field is "wrong" on its own.
  .refine((data) => Boolean(data.membershipId) || Boolean(data.roleId), {
    message: "Provide a staff member (assign now), a role (leave open), or both (assign now with a role tagged for pay)",
  })
```

This is a `z.object({...})` wrapped in `.refine(...)` — not the `.parse()`+try/catch pattern used elsewhere in this rollout. Confirm during implementation how this schema is actually invoked further down in the file (likely `.safeParse()` given the cross-field refine, check the actual current code) and do not change that invocation — this task only adds `.max(200, ...)` to the `notes` line, nothing else in the schema or its usage changes.

Every other field (`membershipId`, `roleId`, `eventId`, `scheduledStart`, `scheduledEnd`, `recurrenceRule`, `slotGroupId`) and the `.refine(...)` block are untouched.

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/shifts/route.ts"
git commit -m "fix(web): cap shift notes length, close unbounded live-reachable gap"
```

---

## Task 2: Full regression pass + manual verification + push

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, typecheck, build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && pnpm build
```

- [ ] **Step 2: Manual verification (session-authenticated, use an active browser session if available)**

Use the disposable "Velvet Rift" `TEST_VENUE`. Creating a shift needs either a real `membershipId` (the account's own OWNER membership there) or a `roleId` — use the account's own membership ID per the `.refine()` requirement.

1. `POST /api/venues/<id>/shifts` with `{ membershipId: "<real-membership-id>", scheduledStart: "2026-09-01T18:00:00Z", scheduledEnd: "2026-09-01T20:00:00Z", notes: "a".repeat(201) }` → expect 400 (over the 200-char cap, previously accepted as-is).
2. Same request with `notes: "DJ set, bartender"` (a normal value under the cap) → expect 200/201, shift created — delete it after via the shift's own DELETE endpoint or `psql`.

- [ ] **Step 3: Push**

```bash
cd ~/xiv-app && git push origin main
```

Hold on `~/bin/deploy-xiv-web.sh --green` until the user confirms. Reorder in practice as established: push → confirm deploy → deploy → THEN run Step 2's manual verification against the now-live code → update the roadmap doc.
