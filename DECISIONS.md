# Decisions & Assumptions

The BR spec deliberately leaves several things ambiguous. This document records how ShiftSync
resolves each one, plus the other judgment calls made while building it.

## The five named ambiguities

**What happens to historical data when a staff member is de-certified from a location?**
Decertification is a soft revoke (`StaffLocation.decertifiedAt`), never a delete. Past shifts,
assignments, and audit entries tied to that location stay exactly as they were — only *future*
assignment eligibility is blocked (the constraint engine's `LOCATION_NOT_CERTIFIED` check looks
at `decertifiedAt IS NULL`). Re-certifying the same staff/location pair clears the flag on the
same row rather than creating a duplicate. See `morgan.retired@coastaleats.example` in the seed
data: certified two weeks ago, worked a shift, decertified — the shift and the audit trail are
still queryable.

**How does "desired hours" interact with availability windows?**
They're independent and never influence each other. `desiredWeeklyHours` is a soft target used
only by the fairness/desired-hours comparison (`GET /fairness/desired-hours`) — it never expands
or restricts what a shift-assignment attempt is allowed to do. Availability windows are the only
thing the constraint engine checks for eligibility.

**When calculating consecutive days, does a 1-hour shift count the same as an 11-hour shift?**
Yes. A calendar day counts as "worked" if the staff member has ≥1 assigned shift on it, regardless
of length. This is the simpler, more conservative reading — a system that let short shifts not
count would create an obvious gaming incentive (schedule someone for a token 1-hour shift to avoid
tripping the 6th/7th-day rule).

**If a shift is edited after swap approval but before it occurs, what should happen?**
The edit re-runs the full constraint engine against the shift's current assignee. If the edit
would now violate a hard rule (skill, certification, availability, rest hours, etc.), the edit is
blocked with the same structured error any other edit would get — approval history doesn't
grandfather in a now-invalid assignment. Separately, if a *swap request* is still pending (not yet
approved) when a manager edits the shift it refers to, that request is automatically cancelled
with a notification to both parties, per the spec's explicit edge case.

**How should the system handle a location that spans a timezone boundary?**
Out of scope by design. Every `Location` has exactly one IANA timezone, chosen once at setup and
treated as that location's legal/business timezone. A location physically near a state line is
still just one restaurant with one till and one set of posted hours — it doesn't need two.

## The Timezone Tangle (evaluation scenario 3)

A staff member certified at a Pacific-time location and an Eastern-time location sets availability
as "9am-5pm." **Whose 9-5 is it?** ShiftSync resolves this by giving every `User` a
`homeTimezone` (defaults to their first certified location's zone, but is independently settable).
Recurring `AvailabilityRule` times are wall-clock in that home timezone, full stop — never in
whichever location's shift is being checked. To validate a shift, the engine converts the shift's
UTC start/end into the staff's home timezone (DST-correct, via `date-fns-tz`, not a fixed offset)
and compares local-to-local.

Concretely: `avery.bicoastal@coastaleats.example` in the seed data has `homeTimezone:
America/Los_Angeles`, is certified at both Santa Monica (Pacific) and Brooklyn (Eastern), and has
a Mon-Fri 09:00-17:00 rule. That rule means 9am-5pm *Pacific*. A Brooklyn shift scheduled for
9am-5pm *Eastern* is actually 6am-2pm Pacific — it would be flagged `UNAVAILABLE` unless it falls
inside Avery's actual Pacific-time window. This is a real trade-off, not a free lunch: staff who
work across timezones need to think in one consistent clock when setting availability. The
alternative (per-location availability) was considered and rejected as it multiplies the data
model and UI complexity for a use case (genuinely bi-coastal staff) that's the exception, not the
rule, at a 4-location regional chain.

## The Simultaneous Assignment (evaluation scenario 4)

Two managers assign the same staff member to two different (overlapping) shifts at the same
instant. Every assignment write runs inside a Postgres transaction that first takes
`SELECT ... FOR UPDATE` on that staff member's `User` row. The second transaction blocks until the
first commits, then re-runs the full constraint engine against the now-committed state — so it
sees the first assignment and fails cleanly with a structured `DOUBLE_BOOKED` (or rest-hours)
violation instead of racing it. Because this happens synchronously inside the request that loses
the race, the "immediate conflict notification" the spec asks for is just the HTTP response itself
— no separate real-time round-trip needed for the loser to find out.

## The Regret Swap (evaluation scenario 6)

Either party — not just the initiator — can cancel a swap/drop request any time before the
manager's final approval (`POST /swap-requests/:id/cancel`). Cancelling reverts the request to a
terminal `CANCELLED` state; the original assignment was never touched while the request was
pending, so there's nothing to roll back. Once a manager approves, the request becomes immutable
(`APPROVED`) — the swap has already happened by then.

## Other judgment calls

- **No public registration.** Accounts are created by an admin (or, for skills/certifications, a
  manager). This is a B2B staff-scheduling tool for one company, not a marketplace — open signup
  doesn't make sense here.
- **Publish-cutoff vs. swap/drop are two different code paths on purpose.** Editing a published
  schedule is blocked inside the cutoff window (default 48h). Approving a swap/drop is not — that
  workflow is the designed mechanism for exactly the last-minute changes the cutoff otherwise
  prevents (see "The Sunday Night Chaos" below).
- **"Premium" shift = Friday/Saturday, local start hour ≥ 17:00**, computed in the *location's*
  timezone (unlike availability, which uses the staff's home timezone) — desirability is a
  property of the shift itself, not of whoever might work it.
- **Overtime "cost" is reported in hours, not dollars.** The spec asks for "projected overtime
  costs" but defines no wage/pay-rate field anywhere in the data model. Rather than fabricate a
  wage, the dashboard (`GET /compliance/overtime`) surfaces projected overtime *hours* — the actual
  driver of cost — and a manager or a future payroll integration can multiply by a real rate.
- **A swap request caps at 3 pending per staff member** (`initiator`, across both `SWAP` and
  `DROP` types, any non-terminal status) per the spec. Claiming/accepting someone else's request
  doesn't count against your own cap — only requests *you* initiated do.
- **A drop request born inside its own expiry window doesn't get rejected.** If the natural
  "24h before the shift" deadline has already passed by the time someone creates the drop request
  (a genuine last-minute call-out), the expiry clamps to the shift's own start time instead of
  being born already-expired. Otherwise the exact scenario the drop mechanism exists for — calling
  out with under a day's notice — would be the one case it couldn't handle.
- **Recurring availability windows are same-day only** (`startTime < endTime`, both within one
  calendar day). A staff member available through an overnight shift needs two rules (e.g.
  `Fri 20:00-23:59` + `Sat 00:00-05:00`) rather than one rule crossing midnight. `23:59` is treated
  as reaching all the way to midnight for this purpose, so that pairing works correctly against an
  overnight shift's split day-segments.
- **A shift with swap/drop history (any status, not just active) can't be hard-deleted** — the
  foreign key would otherwise orphan the `SwapRequest` row and the audit trail. The manager can
  still edit it (which cancels any *active* pending request with notification) or simply leave it
  in place; only deletion of shifts with zero swap history is unrestricted.
- **A manager can certify/decertify and grant/revoke skills only for staff they already share a
  location with (or the very first certification, which requires being the manager of the
  location being granted).** This mirrors "managers only see/manage locations they're assigned
  to" without requiring a separate onboarding-specific permission.
