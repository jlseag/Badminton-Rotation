# Access & Subscription Blueprint

How accounts, plans, admin control and device tracking work.
Kept outside the public repo on purpose — it documents how the paywall is enforced.

Status key: **BUILT** = live in the database today · **PENDING** = designed, not yet written.

---

## 1. The account model

One **host** = one email = one account. A host owns groups, players and sessions.
Players are not accounts; they're rows a host manages. Only hosts sign in.

| Table | Holds | Status |
|---|---|---|
| `auth.users` | Supabase's own identity record (email, password hash) | BUILT |
| `hosts` | Your record: email, username, `is_admin`, `suspended`, `last_seen_at` | BUILT |
| `entitlements` | One row per host: their plan, expiry, and where it came from | BUILT |
| `devices` | One row per browser that has signed in | BUILT (nothing writes to it yet) |
| `audit_log` | Every entitlement change, automatically | BUILT |

A row in `hosts` and a `free` entitlement are created **automatically** the moment
someone signs up, by a trigger on `auth.users`. There is no step where you create
accounts by hand.

---

## 1b. The business model: paid-only, no free tier

**Decided 4 Nov 2026.** There is no usable free tier. An account either has an
active plan or it cannot open the app at all. People who get it for nothing get
a **lifetime premium** grant from the dashboard, chosen by you, one at a time.

This is already how the code behaves: the app opens only for `trial` or
`active`, so `free` and `lapsed` are both "locked out". No change was needed to
enforce it -- only honest labels in the dashboard.

Consequences worth keeping in mind:

- The **player cap is irrelevant** and is not enforced anyway (see section 3).
  `free_max_players` and the insert policy on `players` are dead weight. Keep
  them -- they cost nothing and a free tier may come back.
- **The 14-day trial is now the entire funnel.** It is the only way anyone
  tries the app before paying, so it matters more than it did.
- **Lifetime = `active` with no expiry date.** `is_premium()` treats a null
  expiry as never-expiring, so this needs no special case anywhere.

## 2. The four plan states

`entitlements.status` is an enum with exactly four values.

| State | Means | How it's reached | Limits |
|---|---|---|---|
| `free` | Never paid, or revoked | Default, or admin revokes | **No access at all** |
| `trial` | 14-day free trial | **Automatic at signup** | Unlimited |
| `active` | Paying customer | Admin grants after payment | Full app |
| `active` + no expiry | **Lifetime** | Admin grants deliberately | Full app, forever |
| `lapsed` | Was paying, stopped | Optional label | **No access at all** |

Plus one flag that sits **across** all four:

| Flag | Means | Effect |
|---|---|---|
| `hosts.suspended` | You cut someone off | Instantly drops to free limits, whatever their plan says. Data kept. Reversible. |

### How expiry actually works — no cron job needed

The gate is `is_premium()`, and it checks three things at once:

```
status is 'trial' or 'active'
  AND expires_at is in the future
  AND the host is not suspended
```

So a trial that ran out **stops working on its own**, the moment the clock passes
`expires_at`. Nothing has to run on a schedule to demote anybody. `lapsed` is
therefore cosmetic — a label for your dashboard, not the thing doing the work.

This matters: it means the paywall can't silently break because a scheduled job
failed overnight.

---

## 3. What free gets vs what paid gets

Limits live in a `config` table, so you change the business model with one UPDATE
rather than a code deploy.

| Key | Value | Meaning |
|---|---|---|
| `free_max_players` | 8 | Free hosts cap at 8 players per group |
| `free_max_courts` | 1 | Free hosts get 1 court |
| `trial_days` | 14 | Length of the automatic trial |
| `offline_grace_days` | 14 | How long a paid host may stay offline before re-check (PENDING) |

**The player cap is NOT enforced today, and under the paid-only model it does not
need to be.** The insert policy on `players` is real and does reject the 9th row
-- but the app never writes to that table. All game data lives in `localStorage`
on the device. The policy guards a door nothing walks through.

This was previously documented here as "enforced by the database", which was
true of the policy and false in practice. Corrected 4 Nov 2026.

What this means while the app stays local:

- Every signed-in account can do everything. There are no tiers inside the app.
- **Game data is per-device, not per-account.** Two phones on one login are two
  separate apps with separate rosters that never mix.
- So a leaked email and password gives each person a fully working, independent
  copy. The gate controls *entry*, not *capacity*.

That is acceptable for a paid-only product in testing: the thing being sold is
access, and access is genuinely controlled. It stops being acceptable when
credentials start circulating, which is what the device count is there to show.

---

## 4. Who is allowed to change a plan

This is the heart of it.

| Actor | Can read entitlements | Can write entitlements |
|---|---|---|
| Anonymous visitor | Nothing | No |
| A signed-in host | Only their own row | **No — there is no policy permitting it** |
| An admin (`is_admin = true`) | Every row | Yes |
| Service role key | Everything | Yes (never ships in any page) |

A host cannot buy, extend or grant themselves anything by any route available to
them. Verified from outside: the attempt returns `42501 — row violates row-level
security policy`.

**Admin is not self-serve.** `is_admin` can only be set by raw SQL. A database
trigger silently reverts any attempt to change `is_admin` or `suspended` by someone
who isn't already an admin — so even a host who found the API cannot promote
themselves.

---

## 5. What the admin can do

All of this is live in `admin.html`.

| Action | Effect | Reversible |
|---|---|---|
| **Edit username** | Renames the host in your records | Yes |
| **Grant 14-day trial** | Sets `trial`, expiry 14 days out | Yes |
| **Premium +1 month** | Sets `active`, expiry 30 days out | Yes |
| **Premium +1 year** | Sets `active`, expiry 365 days out | Yes |
| **Lifetime premium** | Sets `active` with no expiry — never expires | Yes |
| **Revoke access** | Sets `free` — locked out of the app immediately | Yes |
| **Suspend** | Cuts to free limits now, keeps all their data | Yes |
| **Restore** | Undoes a suspension | Yes |

Every one of these writes a row to `audit_log` automatically: who did it, when, the
old status, the new status, and the reason tag. You cannot change someone's plan
without leaving a record — including yourself.

### Extending time

"+1 month" sets expiry to **30 days from now**, not 30 days from their current
expiry. For a host renewing early, clicking it shortens them. If that becomes a real
case, the fix is a "+30 days from current expiry" option — worth adding once you
have renewals, not before.

---

## 6. Device tracking

### What it's for

One mabar host paying Rp 100.000 and sharing the login with six other hosts is the
single most likely way this product leaks money. Device count is how you see it.

### How it works

Each browser generates a random `device_key` on first run and keeps it in
localStorage. On every launch the app upserts a row into `devices` with that key,
a readable label, and `last_seen`. The dashboard shows the count per host.

- Same person, phone + tablet + laptop → **3 devices**, normal.
- Shared account → devices keep climbing, and several are active the same morning.

The dashboard flags anything above 1 in red and has a "2+ devices" filter. That's
**detection, not enforcement** — deliberately. You should look at real numbers from
real hosts before deciding what a limit should be.

### Decisions still open

1. **What is the limit?** 3 feels right for one person's own devices, but this is
   guesswork until there's data.
2. **What happens when it's exceeded?** Options, softest first:
   - Show it to you only, decide case by case *(recommended to start)*
   - Warn the host in the app
   - Refuse the newest device until an older one is revoked
3. **Can a host revoke their own devices?** If you ever hard-enforce, they must be
   able to — otherwise a lost phone locks them out and becomes your support problem.

The `devices` table already has a `revoked` flag for this.

---

## 7. What is not built yet

| Piece | Why it matters | Blocks |
|---|---|---|
| **App auth wiring** | Nobody can sign up, so the dashboard has one row | Everything |
| **Device registration** | Table exists; nothing writes to it, so counts stay 0 | Sharing detection |
| **`last_seen_at` updates** | Column exists; nothing sets it | Knowing who's active |
| **Public signup disabled** | Still ON — strangers could self-register for free trials | Must fix before launch |
| **Payment** | Manual bank transfer, then you click "+1 month" | Automate later |
| **Own domain** | GitHub Pages ToS forbids commercial hosting | Charging money |

---

## 8. The money path, first version

Deliberately manual. Automating billing before you have ten paying customers is
solving a problem you don't have.

0. You create their account in the dashboard and send them the credentials
1. Trial starts automatically, 14 days
2. Dashboard shows them under **On trial** with a countdown
3. Near expiry they transfer Rp 100.000
4. You confirm the transfer and click **Premium +1 month**
5. `audit_log` records it; their app unlocks on next launch

What to watch on the dashboard each week: **On trial** (who's deciding),
**Lapsed** (who to chase), **Shared?** (who to look at).

Move to Midtrans or Xendit when the clicking becomes tedious — that's a good
problem and you'll know when you have it.
