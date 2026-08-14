# Hybrid Instagram Automation

Two sources feed one automation engine.

| Event | Source | Action |
|---|---|---|
| Direct messages | Meta Graph API webhook | AI reply (unchanged from before) |
| Comments | Meta Graph API webhook | Public reply + private-reply DM |
| New followers | Playwright (Instagram Web) | DM through the browser |
| New likes | Playwright (Instagram Web) | Recorded only; manual DM from the dashboard |

Followers and likes go through a browser because the Graph API exposes no such
events, and cannot DM a user who has never messaged the account first.

> **Account risk.** Driving instagram.com with Playwright violates Instagram's
> Terms of Use and can get the account restricted or banned. Mitigations built
> in: a daily DM cap, randomised 3–12s delays, a single-threaded action queue,
> a cold-start guard, and a global `DRY_RUN` switch. Start with `DRY_RUN=true`.

## Architecture

```
Process A: npm run dev            Process B: npm run worker
  /api/webhook  (DMs + comments)    persistent Chromium profile
  /api/events, /api/stats, ...      30s notification poll
  CRM UI (see below)                follows -> DM via web
        \                           likes   -> record only
         \                         /
          ----> PostgreSQL <-----
                     |
        dashboard polls the API
```

## Authentication

The dashboard is behind a login. It can read every DM and send messages as the
business, so it is not safe to leave open.

```bash
# 1. a signing key, in .env.local
AUTH_JWT_SECRET=$(openssl rand -base64 48)

# 2. apply the schema
npm run db:migrate

# 3. sign in — the superadmin provisions itself, there is no seed step
#      whatever SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD are set to,
#      defaulting to admin@ghaslet.local / ChangeMe-Ghaslet-Superadmin

# 4. any further logins
npm run create-user -- --email me@example.com --generate
npm run create-user -- --email me@example.com --reset      # change a password
```

### The hardcoded superadmin

Defaults to `admin@ghaslet.local`, defined in
[src/lib/auth/superadmin.ts](src/lib/auth/superadmin.ts). Its row is created
automatically the first time someone tries to sign in as it — no seed command,
no bootstrap hook.

All three parts are overridable from `.env.local`, so the usual case needs no
code edit:

```bash
SUPERADMIN_EMAIL=you@example.com
SUPERADMIN_NAME=Your Name
SUPERADMIN_PASSWORD=a-long-passphrase
```

> **Put these in `.env.local`, not `.env.example`.** `.env.example` is a
> committed template — `.gitignore` un-ignores it explicitly with
> `!.env.example` — and **nothing reads it at runtime**. Only `.env.local` and
> `.env` are loaded. A secret placed in `.env.example` is simultaneously
> published and inert.

Changing `SUPERADMIN_EMAIL` after a superadmin row already exists does not
migrate it. Provisioning is skipped and logged as `superadmin_conflict`, since
only one superadmin may exist; delete the old row or sign in as it.

A password below the 12-character floor is accepted but logs
`"event":"superadmin_weak_password"` on every login — locking the operator out
of their own dashboard would be worse than letting them in with a weak one.

> **The shipped password is in git.** It is identical on every deployment, and
> anyone who can read this repository can sign in and read every Instagram DM.
> Set `SUPERADMIN_PASSWORD` in `.env.local` before this app is reachable from a
> network; that overrides the constant without touching source. While the
> shipped default is in use the server logs
> `"event":"superadmin_default_password"` on every attempt.

Why a real row rather than a purely in-code user: `auth_sessions.user_id` is a
foreign key to `app_users`, so refresh tokens — and therefore any session
outliving the 15-minute access token — need something to point at.

Source is the authority for this account. If you change the constant or the env
override, the stored hash is re-synced on the next successful login. That
re-sync is deliberately narrow — it fires only when the submitted password
equals the configured one and the stored hash disagrees, so a wrong guess never
causes a database write, and it does not run on every attempt.

Two consequences worth knowing:

- `npm run seed:superadmin -- --rotate` will be undone for this account the
  next time the configured password is used. Change the constant or the env
  var instead.
- If a *different* account already holds the superadmin role, provisioning is
  skipped and logged as `superadmin_conflict` rather than failing the unique
  index. Only one superadmin can exist.

### Roles

| Role | Rank | Can |
|---|---|---|
| `superadmin` | 30 | Everything, including managing users. **Exactly one exists.** |
| `admin` | 20 | Conversations, contacts, automation rules |
| `agent` | 10 | Read and reply to conversations |

Checks are `hasAtLeast(role, required)`, never equality — `requireAdmin()`
accepts a superadmin. An `=== "admin"` test would lock the top tier out of
admin-only routes, which is the opposite of what a higher tier means. The union
lives in one place, [src/lib/auth/roles.ts](src/lib/auth/roles.ts).

**"Exactly one" is enforced by the database**, not by the seed script
remembering to check: migration 0003 adds a partial unique index over `role`
restricted to superadmin rows, so a second insert fails with `23505`.
`npm run create-user -- --role superadmin` is refused and redirects you here.

`seed:superadmin` is **idempotent** — if a superadmin exists it reports and
exits 0, so it is safe on every deploy. It also handles the case where the
email already exists as an admin, promoting that account instead of failing.

Leave `SUPERADMIN_PASSWORD` unset and a strong password is generated and
printed once; a password in a `.env` file tends to stay there. Use `--rotate`
to set a new one, which also signs out every existing session.

Design:

- **Access token** — HS256 JWT, 15 minutes, `httpOnly` `SameSite=Lax` cookie.
  Stateless, so it is deliberately short-lived.
- **Refresh token** — opaque 32 bytes, 30 days, stored **hashed** in
  `auth_sessions` and scoped to `/api/auth`. This is the revocable half; a JWT
  on its own cannot be revoked. It **rotates on every use**, and replaying an
  already-rotated token revokes every session for that user.
- **Passwords** — scrypt (`N=16384, r=8, p=1`) from `node:crypto`, per-password
  salt, constant-time compare. Unknown emails still pay the KDF cost so timing
  doesn't disclose which accounts exist.
- **Two enforcement layers.** [src/proxy.ts](src/proxy.ts) gates routing, and
  every protected handler independently calls `requireUser()`. The Next.js docs
  warn that a matcher change can silently remove proxy coverage, so deleting
  `proxy.ts` would not expose the API.
- **`/api/webhook` stays public** — Meta calls it and authenticates with
  `X-Hub-Signature-256`, not a cookie. Requiring a session there would break
  every Instagram webhook.

Changing `AUTH_JWT_SECRET` signs everyone out. So does
`npm run create-user -- --reset`, which revokes that user's sessions.

## The CRM

| Route | What it is |
|---|---|
| `/` | Dashboard — KPI tiles, a 14-day stacked activity chart, automation status, recent events |
| `/inbox` | DM threads with AI/human takeover per conversation. `?c=<id>` deep-links a thread |
| `/contacts` | Every contact, with follower count, relationship, last message and handling mode |
| `/activity` | Every follow, like and comment, with outcome and a manual **Send DM** action |
| `/automation` | Global switches, the daily DM cap, and keyword/template/AI rules |

### Theme

Instagram brand colours on neutral surfaces, in light and dark. The toggle in
the top bar cycles system / light / dark, is remembered in `localStorage`, and
is applied before first paint so there is no flash.

Two gradients, and the distinction matters:

| Token | Use |
|---|---|
| `--brand-gradient` | Anything with content on top — buttons, the logo, sent messages. Purple → magenta; white stays ≥ 5.11:1 across it (≥ 4.89:1 in dark). |
| `--brand-gradient-vivid` | **Decorative only.** The full five-stop Instagram gradient, used for the 3px strip at the top of the page. Its orange stop reaches only 2.34:1 with white, so nothing may sit on it. |

Accent is Instagram purple `#833ab4` in light (6.33:1 as text, 6.50:1 behind
white) and `#b565d8` in dark (4.83:1). The vivid stops could not be used
verbatim for either.

The three event types use Instagram gradient stops re-stepped until they clear
every colour-vision gate — validated all-pairs in both modes, worst CVD ΔE 17.1
light / 9.1 dark:

| Event | Light | Dark |
|---|---|---|
| Follow | `#5851db` indigo | `#7b74e8` |
| Like | `#e1306c` pink | `#de4278` |
| Comment | `#f09433` orange | `#c08236` |

Every badge also carries a text label, so colour never carries meaning alone,
and the activity chart has a table view. Status colours (good / warning /
critical) are reserved and deliberately **not** themed — they never take a
brand hue, or a failure would read as a series.

Both processes share `src/lib`, `src/services`, `src/database` through the
`@/*` alias.

## Layout

```
src/
  instagram/
    meta/
      signature.ts             X-Hub-Signature-256 verification
      comments.ts              reply / private-reply / hide, with retries
      commentWebhook.ts        payload parsing + self-comment guard
    playwright/
      selectors.ts             every DOM selector, with fallbacks
      browserManager.ts        persistent context singleton
      sessionManager.ts        login state, interactive login
      popupHandler.ts          cookie banner, "Not now", etc.
      profileNavigator.ts      open profile / open DM thread
      notificationWatcher.ts   scrape the notifications surface
      notificationParser.ts    classify follows and likes
      messageSender.ts         send a DM via the web UI
      notificationProcessor.ts one poll cycle, cold-start guard
  services/
    automationEngine.ts        rule matching -> template or AI
    dmAutomation.ts            existing DM flow, extracted verbatim
    commentAutomation.ts       comment -> public reply + private DM
    followAutomation.ts        follower -> web DM
    likeAutomation.ts          like -> record (DM path gated off)
  scheduler/
    notificationScheduler.ts   self-rescheduling poll loop with backoff
  database/
    notificationRepository.ts  instagram_events
    automationRuleRepository.ts automation_rules + automation_settings
    conversationRepository.ts  extracted conversation/message queries
  worker/
    index.ts                   worker entrypoint (--login/--once/--dry-run)
  lib/
    logger.ts                  structured JSON logger
    config.ts                  lazy validated env access
  components/
    AppShell.tsx               sidebar nav, top bar, worker status
    ui.tsx                     Card / Badge / Button / Table / StatTile / …
    ActivityChart.tsx          stacked bars + tooltip + table view
    ThemeToggle.tsx            system / light / dark
  app/
    globals.css                design tokens for both themes
```

## Installation

**1. Dependencies**

```bash
npm install
npx playwright install chromium
```

**2. Database**

Plain PostgreSQL (16+). Point `DATABASE_URL` at it and apply the schema:

```bash
createdb ghaslet
npm run db:migrate     # applies db/migrations/*.sql in order
npm run db:status      # what is applied, pending, or edited-after-the-fact
```

Four migrations: `0000_base` (conversations, messages), `0001_hybrid_automation`
(events, rules, settings + three starter rules), `0002_auth` (users, sessions),
`0003_superadmin`. Each runs in a transaction and is recorded in
`schema_migrations` with a checksum, so editing an applied migration is caught
rather than silently skipped.

**3. Instagram account, Meta app and tokens**

Full walkthrough: **[SETUP_INSTAGRAM.md](SETUP_INSTAGRAM.md)**. The short version:

```bash
npm run setup:instagram -- --exchange <short-lived-token>  # -> 60-day token
npm run setup:instagram -- --subscribe                     # messages + comments
npm run setup:instagram -- --check                         # prints IG_USER_ID
```

Three things bite hardest and none of them produce an error message:

- The account must be a **public** professional account, or comment webhooks are
  never delivered.
- **`--subscribe` is not optional.** Ticking the field boxes in the App Dashboard
  subscribes the *app*; the *account* needs a `POST /me/subscribed_apps`.
- The token must carry `instagram_business_manage_comments`, not just
  `instagram_business_manage_messages`, or every comment call returns 403.

**4. Environment**

Copy `.env.example` to `.env.local` and fill it in. Two keys matter most:

- `META_APP_SECRET` — Meta App Dashboard → Instagram → API setup with Instagram
  login. Without it the webhook accepts unverified payloads (and logs a warning
  on every request).
- `IG_USER_ID` — printed by `--check`. It is how the bot recognises its own
  comments and avoids replying to itself in a loop. The webhook falls back to
  the `entry.id` on each delivery if this is unset, but set it anyway.

**5. One-time Instagram Web login**

```bash
npm run worker:login
```

A headful Chromium opens. Log in manually, including 2FA and any security
checkpoint. The session persists to `.playwright-profile/` (gitignored) and this
is never needed again unless the session is invalidated.

**6. Run**

```bash
npm run dev      # terminal 1 — dashboard + webhook
npm run worker   # terminal 2 — Chromium + 30s poll
```

**7. Rules**

Open `/automation` and confirm the seeded rules, or add your own. **Nothing is
sent until at least one rule matches** — an event with no matching rule is
recorded as `skipped`.

The dashboard at `/` is the landing page once both processes are up.

## Testing

### 0. Cold-start guard — do this first

On the first poll the notifications page is full of history. Without the guard
the bot would DM everyone who has ever followed the account.

```bash
npm run worker:once     # implies --dry-run
```

Every notification should be recorded with `status='skipped'`,
`action_taken='none'`, and the log should show `"event":"backfill"`. Assert zero
rows have `action_taken='web_dm'`.

### 1. DM regression — the highest-risk change

The webhook was rewritten, so verify the path that already worked. Send a real
DM to the account and confirm:

- the AI replies as before
- both messages land in `instagram_messages`
- the inbox at `/` updates live
- flipping a conversation to **human** still suppresses the auto-reply

### 2. Signature verification

```bash
BODY='{"object":"instagram","entry":[]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$META_APP_SECRET" | awk '{print $2}')

# valid -> 200
curl -s -X POST localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: sha256=$SIG" -d "$BODY"

# tampered -> 401 {"status":"invalid_signature"}
curl -s -X POST localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: sha256=deadbeef" -d "$BODY"
```

With `META_APP_SECRET` unset, both return 200 and the server logs
`"event":"signature_check_skipped"`.

### 3. Comments

Comment on a live post from a second account. Expect an `instagram_events` row
(`event_type='comment'`, `status='done'`), a visible public reply, a DM, and a
conversation in the inbox.

**Then comment from the business account itself** and confirm the log shows
`"event":"self_comment"` and nothing is sent. This guard is the only thing
preventing an infinite reply loop.

### 4. Duplicate protection

Re-POST an identical comment payload. The second attempt logs
`"event":"duplicate"` and sends no second reply — enforced by
`unique (event_type, external_id)`.

### 5. Followers

With `DRY_RUN=true`, follow from a second account and run `npm run worker:once`.
The log should show the chosen template with `"event":"dry_run"` and send
nothing. Then set `DRY_RUN=false`, unfollow/refollow, and confirm the DM arrives.

### 6. Likes

Like a post from a second account. An event row appears with `status='skipped'`
and no DM. The **Send DM** button on `/activity` re-queues it; the worker picks
it up on its next cycle.

### 7. Session expiry

Delete `.playwright-profile/` or log out elsewhere. The worker logs
`"event":"session_expired"`, sets `playwright_session_valid=false`, and pauses
at the 5-minute backoff instead of crash-looping. The sidebar status dot turns
red on every page and `/activity` shows a banner.

### 8. Rules and the AI switch

Toggle **Use AI** off on `/automation` — the next comment uses the static
template. Add a keyword rule for `price` with a higher priority and confirm a
comment containing "price" picks it over the catch-all. Matching is
word-boundary, so "surprise" does not trigger it.

### 9. Graceful shutdown

`Ctrl-C` the worker mid-poll. It finishes the in-flight cycle (30s cap), closes
Chromium, and exits 0 with no orphaned browser process.

### 10. Type check

```bash
npm run build      # or: npm run typecheck
```

This is the only static check in the repo — there is no lint config and no test
framework.

## Operational notes

- **Logs** are one JSON object per line: `{ts, level, scope, msg, ...fields}`.
  Set `LOG_LEVEL=debug` for selector-level detail. Notable `event` values:
  `duplicate`, `self_comment`, `threaded_reply`, `backfill`, `cap_reached`,
  `session_expired`, `dry_run`, `poll_complete`.
- **When Instagram changes its DOM**, only
  [src/instagram/playwright/selectors.ts](src/instagram/playwright/selectors.ts)
  should need editing. Each target is an ordered fallback list.
- **Daily cap** covers Web DMs and comment private replies together, resets at
  local midnight, and is editable on `/automation`. If the count query fails it
  fails closed (reports the cap as reached) rather than risking a send spree.
- **The webhook acks before processing** via `after()` from `next/server`, so it
  responds well inside Meta's ~5s retry window. The response body is now
  `{status:"accepted", messaging, comments}` rather than the old per-event
  status strings; those moved into the structured logs.
