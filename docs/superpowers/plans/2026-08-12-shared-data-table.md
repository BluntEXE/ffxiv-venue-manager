# Shared DataTable Primitive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicated `<table>`/`<thead>`/empty-state boilerplate in `staff-table.tsx`, `patron-profiles-table.tsx`, `ban-list-manager.tsx`, and `rooms-board.tsx` with one shared `<DataTable>` component, and reconcile `staff-table.tsx`'s one-off styling onto the `.dtable`/`.hide` CSS pattern the other three already share.

**Architecture:** `<DataTable columns={...} isEmpty={...} emptyMessage="...">{rows}</DataTable>` owns the table shell, header-cell rendering (including responsive `.hide` support), and the empty-state message. Row rendering (badges, avatars, action buttons — genuinely different across all 4 callers) stays exactly where it is today, passed in as `<tbody>` children. No sort/pagination/filter machinery — none of the 4 target files have any today, and none of this work should add speculative capability nobody asked for.

**Tech Stack:** TypeScript, React 19, Next.js (Client Components — all 4 target files already are).

---

## Task 1: Build `DataTable` primitive

**Files:**
- Create: `apps/web/components/ui/data-table.tsx`
- Test: none (this app's Vitest config uses `environment: "node"`, no jsdom — component rendering isn't practically unit-testable here; verification is the manual QA in Task 6)

- [ ] **Step 1: Read the existing `.dtable`/`.hide` CSS to confirm the exact class names and behavior**

```bash
cd apps/web && grep -n "\.dtable\|\.hide\b\|\.t-num" app/globals.css
```

Confirm this matches what was found during planning: `.dtable` is the table's own class (border-collapse, cell padding, hover row highlight), `.hide` hides a `<th>`/`<td>` below 640px and shows it as `table-cell` at 640px+, `.t-num` right-aligns a numeric column. If the actual CSS differs from this, adjust Step 3 below to match what's really there rather than what's assumed.

- [ ] **Step 2: Check for an existing `cn()` utility**

```bash
grep -rn "^export function cn" apps/web/lib/utils.ts
```

This codebase already has `cn()` in `apps/web/lib/utils.ts` (clsx + tailwind-merge) — use it, don't hand-roll a className joiner.

- [ ] **Step 3: Implement the component**

```typescript
// apps/web/components/ui/data-table.tsx
"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface DataTableColumn {
  label: string
  hideOnMobile?: boolean
  align?: "right"
}

interface DataTableProps {
  columns: DataTableColumn[]
  isEmpty: boolean
  emptyMessage: string
  children: ReactNode
}

export function DataTable({ columns, isEmpty, emptyMessage, children }: DataTableProps) {
  if (isEmpty) {
    return <p className="text-center text-sm text-muted-foreground py-12">{emptyMessage}</p>
  }

  return (
    <table className="dtable">
      <thead>
        <tr>
          {columns.map((col, i) => (
            <th key={i} className={cn(col.hideOnMobile && "hide", col.align === "right" && "t-num")}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}
```

`emptyMessage` copy and the `py-12` empty-state padding standardize on `patron-profiles-table.tsx`/`rooms-board.tsx`'s existing value — `staff-table.tsx` currently uses `py-10`, a minor pre-existing inconsistency this deliberately resolves in favor of the majority value, not a new decision being introduced.

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/data-table.tsx
git commit -m "feat(web): add shared DataTable primitive"
```

---

## Task 2: Migrate `ban-list-manager.tsx` (smallest file, do first)

**Files:**
- Modify: `apps/web/components/ban-list-manager.tsx`

- [ ] **Step 1: Read the full current file**

```bash
cat apps/web/components/ban-list-manager.tsx
```

89 lines — read all of it before editing. Note its exact empty-state shape (an early return, per the grep during planning, at the point `localPatrons.length === 0`) and its exact `<thead>`/column list (`Patron`, `World` (hidden on mobile), `Reason`, `Banned by` (hidden), `Banned at` (hidden), and one empty header for a row-action column) — confirm these against the file you just read, not the summary here, since line numbers may have shifted.

- [ ] **Step 2: Replace the table shell with `<DataTable>`**

Import `DataTable` and its `DataTableColumn` type:

```typescript
import { DataTable } from "@/components/ui/data-table"
```

Replace the early-return empty-state branch and the `<table className="dtable"><thead>...</thead><tbody>...` wrapper with:

```tsx
<DataTable
  columns={[
    { label: "Patron" },
    { label: "World", hideOnMobile: true },
    { label: "Reason" },
    { label: "Banned by", hideOnMobile: true },
    { label: "Banned at", hideOnMobile: true },
    { label: "" },
  ]}
  isEmpty={localPatrons.length === 0}
  emptyMessage="No banned patrons."
>
  {/* existing <tr> row-mapping JSX goes here, unchanged */}
</DataTable>
```

Use the file's actual existing empty-state copy if it differs from `"No banned patrons."` above (re-check what Step 1 showed — don't invent new copy). Keep every `<tr>`/`<td>` row-rendering line exactly as it already is; only the surrounding `<table>`/`<thead>`/`</table>` and the empty-state branch are replaced.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Manual verify**

```bash
cd apps/web && pnpm dev
```

Open the Ban List page for a venue with at least one banned patron and one with none (or temporarily unban to check the empty state, then re-ban). Confirm the table renders identically to before — same columns, same responsive hiding at narrow widths, same empty-state message.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ban-list-manager.tsx
git commit -m "refactor(web): migrate ban-list-manager onto shared DataTable"
```

---

## Task 3: Migrate `rooms-board.tsx`

**Files:**
- Modify: `apps/web/components/rooms-board.tsx`

- [ ] **Step 1: Read the full current file**

```bash
cat apps/web/components/rooms-board.tsx
```

283 lines — read all of it. Confirm its exact column list (`Room`, `Status`, `Note`, `Last updated by` (hidden), and one empty action-column header, per the grep during planning) and its exact empty-state block (`localRooms.length === 0`, message `"No rooms yet."` per planning — confirm against the actual file).

- [ ] **Step 2: Replace the table shell with `<DataTable>`**

```typescript
import { DataTable } from "@/components/ui/data-table"
```

```tsx
<DataTable
  columns={[
    { label: "Room" },
    { label: "Status" },
    { label: "Note" },
    { label: "Last updated by", hideOnMobile: true },
    { label: "" },
  ]}
  isEmpty={localRooms.length === 0}
  emptyMessage="No rooms yet."
>
  {/* existing <tr> row-mapping JSX goes here, unchanged */}
</DataTable>
```

Match the file's actual current empty-state copy and column set exactly — this is what Step 1's read confirmed during planning, but re-verify against the real file before committing to it.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Manual verify**

```bash
cd apps/web && pnpm dev
```

Open the Rooms tab for a venue with rooms configured and one without. Confirm identical rendering to before, including the room-status badges and any row actions.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/rooms-board.tsx
git commit -m "refactor(web): migrate rooms-board onto shared DataTable"
```

---

## Task 4: Migrate `patron-profiles-table.tsx`

**Files:**
- Modify: `apps/web/components/patron-profiles-table.tsx`

- [ ] **Step 1: Read the full current file**

```bash
cat apps/web/components/patron-profiles-table.tsx
```

303 lines — read all of it. Confirm its exact column list (`Patron`, `World` (hidden), `Visits` (numeric, right-aligned per the `t-num` class seen during planning), `Last seen` (hidden), `Total spent` (numeric + hidden), `Tags`, per the grep during planning) and its empty-state block (`visible.length === 0`, message `"No patrons found."`).

- [ ] **Step 2: Replace the table shell with `<DataTable>`**

```typescript
import { DataTable } from "@/components/ui/data-table"
```

```tsx
<DataTable
  columns={[
    { label: "Patron" },
    { label: "World", hideOnMobile: true },
    { label: "Visits", align: "right" },
    { label: "Last seen", hideOnMobile: true },
    { label: "Total spent", align: "right", hideOnMobile: true },
    { label: "Tags" },
  ]}
  isEmpty={visible.length === 0}
  emptyMessage="No patrons found."
>
  {/* existing <tr> row-mapping JSX goes here, unchanged */}
</DataTable>
```

Match against the actual file's current state — this file has more filtering/search logic around the table than the other 3 (per its larger size); only the `<table>`/`<thead>`/empty-state wrapper changes, none of the filtering logic above it.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Manual verify**

```bash
cd apps/web && pnpm dev
```

Open the patron profiles / VIP list page. Confirm identical rendering, including the numeric column right-alignment and any VIP/tag badges.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/patron-profiles-table.tsx
git commit -m "refactor(web): migrate patron-profiles-table onto shared DataTable"
```

---

## Task 5: Migrate `staff-table.tsx` (the styling outlier — also reconciles onto `.dtable`)

**Files:**
- Modify: `apps/web/components/staff-table.tsx`

This file currently uses `className="w-full border-collapse"` on the `<table>` and inline Tailwind `hidden sm:table-cell` per hidden column, instead of the `.dtable`/`.hide` classes the other 3 files (and the new `DataTable` primitive) use. Migrating it onto `DataTable` fixes this inconsistency as a side effect — no separate styling task needed.

- [ ] **Step 1: Read the full current file**

```bash
cat apps/web/components/staff-table.tsx
```

349 lines — read all of it. Confirm its exact column list (`Staff`, `Role`, `Status` (hidden on mobile per the `i === 2` check seen during planning), `Joined` (hidden per `i === 3`), and one empty action-column header, per the grep during planning) and its empty-state block (`visible.length === 0`, message `"No staff found."`, currently `py-10` not `py-12` — this becomes `py-12` after migration, per Task 1's deliberate standardization).

- [ ] **Step 2: Replace the table shell with `<DataTable>`**

```typescript
import { DataTable } from "@/components/ui/data-table"
```

```tsx
<DataTable
  columns={[
    { label: "Staff" },
    { label: "Role" },
    { label: "Status", hideOnMobile: true },
    { label: "Joined", hideOnMobile: true },
    { label: "" },
  ]}
  isEmpty={visible.length === 0}
  emptyMessage="No staff found."
>
  {/* existing <tr> row-mapping JSX goes here, unchanged */}
</DataTable>
```

Remove the now-unused inline column-header-array-mapping code (`{["Staff", "Role", "Status", "Joined", ""].map((h, i) => ...)}` and its `i === 2 || i === 3` / `i === 4` conditional className logic) — that entire block is replaced by the `columns` prop above. Match column labels/order against what Step 1's actual read of the file shows.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Manual verify**

```bash
cd apps/web && pnpm dev
```

Open the Staff page. Confirm identical rendering to before at both desktop and narrow (375px) widths — Status/Joined columns should still hide below 640px, matching their old `hidden sm:table-cell` behavior via the new `.hide` class instead.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/staff-table.tsx
git commit -m "refactor(web): migrate staff-table onto shared DataTable, reconcile onto .dtable styling"
```

---

## Task 6: Full regression pass + deploy

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck and build**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run && pnpm build
```

- [ ] **Step 2: Manual QA pass on all 4 surfaces in one sitting**

Re-run every scenario from Tasks 2-5's manual-verify steps back to back (populated + empty state for each of the 4 tables) at both desktop and 375px-wide viewport, to catch anything a per-task check could miss.

- [ ] **Step 3: Push and deploy**

```bash
cd apps/web/../.. && git push origin main
~/bin/deploy-xiv-web.sh --green
```

- [ ] **Step 4: Post-deploy spot check on the live domain**

Visit `https://xivvenuemanager.com`, check Staff, Ban List, Rooms, and Patron Profiles pages for a real venue, confirm all 4 render correctly and no new GlitchTip issues appear for these pages in the minutes after deploy.

---

## Deferred, not in this plan's scope
- Sort, pagination, and search/filter machinery for `DataTable` — none of the 4 current callers need it; add only if/when a caller genuinely requires it, not speculatively.
- A generic "no rows match your filter" vs. "no rows exist at all" distinction in `emptyMessage` — none of the 4 files currently distinguish these cases (per what was read during planning); revisit only if a caller's actual behavior turns out to need it once its file is read in full during implementation.
