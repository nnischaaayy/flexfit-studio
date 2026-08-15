# FlexFit Studio — Refactor Architecture

Submission notes for Project 1 (Callus i12 HR Drive Hackathon, CS Track).
The brief sets two hard constraints that shaped every decision below:
**behavior must not change**, and the resulting structure must be one I can
defend, not "the" objectively correct layout. A companion document with a
line-by-line account of every change (file, before/after, and why) exists
locally but isn't part of this submission — this file is the version meant
to be read alongside the code.

## 1. What this app is

Class booking and membership management for a single gym site: members
book classes against a personal membership's credit balance or, for
corporate users, a shared company credit pool; waitlists promote on
cancellation; staff run a front desk/kiosk, manage trainers, and pull
reports.

- **Stack**: Next.js 15 (App Router), TypeScript, tRPC v11, Drizzle ORM,
  SQLite (`@libsql/client`), Tailwind, superjson, Zod.
- **Size before this work**: ~5,440 lines / 40 files. `vitest` was declared
  in `package.json` but no config or test files existed.
- **Auth**: cookie session → `User` in `createContext()`, three procedure
  tiers (`protectedProcedure`, `staffProcedure`, `adminProcedure`). Already
  clean; not touched.
- **Schema**: `src/db/schema.ts` — `users`, `memberships`, `classes`,
  `bookings`, `corporateBookings`, `companies`, `payments`, `notifications`,
  `reschedules`, `checkins`, etc. Not changed (see §5 for why).

## 2. What was actually wrong, and what was done about it

Nobody hands over a spec, so before changing any structure, the plan was:
read the code closely enough to find where behavior actually lives, pin
that behavior down as tests, *then* restructure with those tests as a
harness. Four real problems turned up; two were fixed, two were documented
and deliberately left alone.

### 2.1 `bookings.ts` / `corporate-bookings.ts` — duplicated business logic (fixed)

The two 300+ line routers independently implemented the same rules —
capacity → waitlist decision, refund-window math, waitlist promotion — for
two different credit sources (a personal membership vs. a company pool).
**Fixed**: extracted the shared decision logic into
[`src/server/services/booking-engine.ts`](src/server/services/booking-engine.ts)
as pure, unit-tested functions (`checkCredit`, `nextBookingStatus`,
`isRefundable`, `deductFloored`, `deductGuarded`); both routers now call
these instead of re-deriving the same arithmetic. 34 tests
(20 characterization + 14 on the extracted functions) stayed green
throughout; verified live in the browser (booked a class, hit the
duplicate-booking 409).

Comparing the two files line-by-line surfaced two **behavior asymmetries**
that predate this refactor:

- `markAttended` links the check-in to the booking (`bookingId`) on the
  personal path but not the corporate path (`bookingId: null`) — meaning
  corporate check-ins are invisible to `checkinCountFor`'s join.
- Waitlist-promotion credit deduction is unguarded on the personal path
  (always deducts, floors at 0) but guarded on the corporate path (skips
  the deduction entirely if the pool can't cover it).

**Decision: preserved exactly, not fixed.** Both look like bugs, but which
one (if either) is the "correct" behavior is a product judgment call I'm
not positioned to make unilaterally, and the brief is explicit that finding
and documenting is worth the same credit as fixing. Both are now named,
tested (`deductFloored` vs. `deductGuarded` in `booking-engine.ts`, each
with its own tests), and impossible to lose track of — instead of two
routers that silently drifted.

### 2.2 `reschedules.ts` — the same duplication pattern, in one file (fixed)

`reschedule` (mutation, throws `TRPCError`) and `validateReschedule`
(query, returns `{valid, reason}` for live pre-submit UI feedback)
implemented the identical 9-step validation — ownership, booking status,
the 4-hour reschedule window, target-class lookup, same-name check,
same-class check, started check, cancelled check, existing-booking check —
twice, in the same order, with the same messages. **Fixed**: extracted into
[`src/server/services/reschedule-validation.ts`](src/server/services/reschedule-validation.ts)'s
`checkReschedule()`, called by both endpoints. 6 characterization tests
written first, all green after the refactor; `tsc --noEmit` clean.

Also removed one dead query while extracting this: the original mutation
fetched the member's `membership` row "to check for unlimited credits" but
never actually used the result — the booking creation always used
`originalBooking.creditsUsed`/`membershipId` directly. Dropped; it was
computing and discarding a query, not affecting behavior either way.

### 2.3 `admin.ts` — investigated, found mostly fine (minor cleanup only)

268 lines across 9 independent read-only report queries (stats, revenue,
attendance, no-shows, etc.). This is *not* the same duplication problem as
§2.1/§2.2 — each query is a genuinely distinct report, so the file being
long is a reasonable consequence of holding one cohesive responsibility
("admin reporting"), not evidence of clutter. The one real repeat: three
queries independently computed "14 days ago as YYYY-MM-DD." Extracted to a
one-line `daysAgoDateString()` helper; 3 new tests
(`test/admin-reports.test.ts`) confirm the 14-day window still includes/
excludes the same rows after the change.

### 2.4 `schedule/page.tsx` — infinite fetch loop (fixed, unrelated to the above)

`trpc.classes.list.useQuery({ from: new Date().toISOString() })` computed
`from` inline on every render — a new ISO string each time is a new React
Query cache key, which fetches, which re-renders, which computes a new
`from`, forever. Confirmed via network log (dozens of requests/second, no
user interaction) and fixed with `useState(() => new Date().toISOString())`
so it's computed once. Verified the loop was gone and the page still books
correctly end-to-end afterward. This isn't a "behavior changed" question —
the page never finished loading before — so it was fixed directly rather
than just documented, and kept in its own change, separate from the
booking-engine work.

## 3. Frontend: two pages actually restructured, the rest investigated and left alone

The original assumption — "`components/` has 2 files for 19 pages, so
everything must be cluttered" — turned out to be too broad once checked
page-by-page. The real test (the brief's own: *"if a file is doing two
unrelated jobs, it probably shouldn't be"*) only failed for two pages:

- **`admin/companies/[id]/page.tsx`** (255 lines) was doing four unrelated
  jobs in one file: account controls, a top-up form, a member-search/link
  form, and two list displays — plus untyped `any` throughout. Split into
  [`src/components/companies/`](src/components/companies/)
  (`top-up-form.tsx`, `add-member-form.tsx`, `linked-members-list.tsx`,
  `recent-bookings-list.tsx`); the page is now 71 lines of composition.
  `any` replaced with real types via a new `RouterOutputs` helper in
  [`src/lib/trpc.ts`](src/lib/trpc.ts) (`inferRouterOutputs<AppRouter>`,
  the standard tRPC pattern for this — see the tRPC reference link in the
  brief).
- **`trainer/schedule/page.tsx`** (230 lines) mixed two unrelated jobs: a
  class roster/check-in-count view, and a full weekly-availability CRUD
  editor. Split into
  [`src/components/trainer/`](src/components/trainer/)
  (`class-roster-list.tsx`, `availability-editor.tsx`); the page is now 30
  lines.
- **`dashboard/page.tsx`** (189 lines) and **`kiosk/page.tsx`** (182 lines)
  were read in full and found to each be one cohesive flow (a member's
  booking dashboard; a staff member-lookup-and-check-in flow) — long
  because of JSX markup, not because they're doing unrelated things.
  Left as single files; `kiosk/page.tsx`'s one `any` (the selected-member
  state) was typed via the same `RouterOutputs` helper, but the page
  wasn't otherwise split.

Both restructured pages were checked live in the browser signed in as the
seeded admin and trainer accounts: the company detail page (top-up form,
balance updates from 100 → 125 correctly), and the trainer schedule page
(class roster + full weekly availability editor, all 7 days), both render
and behave identically to before.

**Not done**: a full `features/` folder migration across all 19 routes.
Investigating page-by-page showed most of them didn't need it — moving
already-fine files into a deeper folder tree would have been restructuring
for its own sake, not fixing a found problem. The two pages that actually
violated the brief's own test were fixed; the rest weren't touched because
nothing was wrong with them.

## 4. Target structure (as-built)

```
src/
  app/                      routes — thin, compose components + call tRPC
  components/
    companies/               top-up, member search/link, list displays
    trainer/                 class roster, availability editor
    NavBar.tsx, reschedule-modal.tsx   (pre-existing, unchanged)
  server/
    routers/                 thin: input validation + call services/
    services/
      booking-engine.ts       shared booking/cancel/promotion logic (§2.1)
      reschedule-validation.ts shared reschedule validation (§2.2)
    trpc.ts                   unchanged
  db/                         unchanged — no schema changes (see below)
  lib/
    trpc.ts                   + RouterOutputs helper (§3)
test/                          43 tests: 5 files, characterization +
                               unit tests for both service modules
```

**Schema**: deliberately unchanged. The brief allows changing it, but
nothing found required it — every issue in §2 was a service-layer problem
(logic with nowhere neutral to live), not a data-model problem.

## 5. Test suite

43 tests across 5 files, all passing, `tsc --noEmit` clean:

| File | Tests | Covers |
|---|---|---|
| `bookings.test.ts` | 12 | personal booking/cancel/waitlist rules |
| `corporate-bookings.test.ts` | 8 | corporate booking/cancel/waitlist rules |
| `reschedules.test.ts` | 6 | reschedule validation, both endpoints agreeing |
| `admin-reports.test.ts` | 3 | 14-day report window, pre/post helper extraction |
| `booking-engine.test.ts` | 14 | the extracted pure functions in isolation |

Every test was written **before** the refactor it protects — characterizing
current behavior first, then confirming it stayed green after the change —
per the brief's instruction that nobody hands over a spec, so working out
current behavior and protecting it is the actual exercise.

## 6. Submission checklist

- [x] Cloned, not forked.
- [ ] Pushed to a new **private** repo under my own account (not this one).
- [ ] Public GitHub repo link for submission.
- [ ] Optional video recording.
- [x] AI tooling disclosed below (not scored, but expected).

## 7. Tooling disclosure

Claude Code (Sonnet 5) was used end-to-end: reading the cloned repo,
finding the issues in §2 by comparing files line-by-line rather than
assuming from file size, writing every characterization test before its
corresponding refactor, extracting both service modules, fixing the two
standalone bugs (§2.4, the dead query in §2.2), restructuring the two
frontend pages that actually violated the brief's stated test, and
verifying all of it via `vitest` (43/43), `tsc --noEmit`, and live browser
sessions against the running dev server signed in as each of the seeded
roles. Every claim in this document is grounded in a specific file, test
run, or browser session from this work — nothing here is asserted from
memory.
