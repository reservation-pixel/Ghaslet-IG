# Deploying

Getting this off a laptop and onto a server that stays up.

Read [SETUP_INSTAGRAM.md](SETUP_INSTAGRAM.md) first — this guide assumes you
already have a working `INSTAGRAM_ACCESS_TOKEN`, `IG_USER_ID`,
`META_APP_SECRET` and a verified webhook, all proven locally. Deploying is not
the place to discover that the account was never switched to Professional.

---

## What has to run

| Piece | What it needs | Can it be serverless? |
|---|---|---|
| Next.js app (`next start`) | Node 20.9+, a public HTTPS URL for the webhook | Yes |
| Playwright worker (`worker:start`) | A long-lived process, Chromium, ~1 GB RAM, a **writable, persistent** profile directory | **No** |
| PostgreSQL 16+ | Reachable from both | Yes (managed) |

The worker is the constraint that decides the whole deployment. It holds a
persistent Chromium profile — the one you logged into Instagram with by hand —
and polls every 30 seconds forever. A serverless function has neither a
lifetime nor a disk that survives a request, so **the worker cannot go on
Vercel, Lambda, Cloud Run request-mode, or anything else that freezes between
invocations.** Losing the profile directory means logging in by hand again, and
Instagram treats repeated fresh logins from a datacentre IP as exactly what it
looks like.

The two processes share nothing but Postgres, so this guide's default —
**both on one small Linux VPS** — is a choice of convenience, not a
requirement. See [Splitting the two processes](#splitting-the-two-processes) if
you want the app somewhere else.

> **Account risk, restated.** Everything in the warning at the top of
> [HYBRID_AUTOMATION.md](HYBRID_AUTOMATION.md) applies harder in production,
> because production runs unattended. Deploy with `DRY_RUN=true` and leave it
> that way until you have read a full poll cycle's logs.

---

## 1. The machine

Ubuntu 24.04 LTS, 2 vCPU, **4 GB RAM**, 20 GB disk.

2 GB is not enough. Chromium alone peaks around 700 MB–1 GB with a real
Instagram page open, `next build` wants roughly the same, and they will collide
during a deploy. If 4 GB is out of reach, add 2 GB of swap and never build on
the server (see [Building elsewhere](#building-elsewhere)).

```bash
# Node 20.9+ is a hard floor — next@16 declares engines.node >= 20.9.0
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs postgresql git

# A dedicated unprivileged user. The Instagram session lives in its home
# directory; nothing here should ever run as root.
sudo adduser --system --group --home /srv/ghaslet ghaslet
```

**Set the timezone deliberately:**

```bash
sudo timedatectl set-timezone Europe/Paris
```

The daily DM cap resets at *local* midnight. On a default-UTC VPS the cap
rolls over at a time you are not thinking about, which is a surprising way to
find out you had 40 DMs left.

---

## 2. Postgres

```bash
sudo -u postgres createuser ghaslet --pwprompt
sudo -u postgres createdb ghaslet --owner ghaslet
```

Local socket, no TLS, nothing exposed on `0.0.0.0` — leave `PGSSL` unset.

For a **managed** database (Neon, RDS, Supabase Postgres) set `PGSSL=true`
instead; [src/lib/db.ts](src/lib/db.ts) only enables TLS when that is exactly
the string `"true"`. Also check that the provider's connection limit is above
`PGPOOL_MAX` (default 10) **times two** — the app and the worker each open
their own pool.

---

## 3. Code and dependencies

```bash
sudo -u ghaslet -H bash
cd /srv/ghaslet
git clone <your-remote> app && cd app

npm ci                                    # NOT --omit=dev, see below
npx playwright install --with-deps chromium
```

> **`npm ci --omit=dev` breaks this project.** `tsx` and `typescript` are
> devDependencies, and the worker, every migration, and every `setup:*` script
> run through `tsx` — there is no compile step for anything outside
> `src/app`. `next build` needs them too. Install everything.

`--with-deps` pulls the ~40 shared libraries headless Chromium needs on a
server image (`libnss3`, `libatk`, fonts, …). Without it the worker dies at
launch with a linker error that reads like a Playwright bug and is not one.

Run this as the `ghaslet` user, not root: browsers land in
`~/.cache/ms-playwright`, and a root-owned copy is invisible to the service.

---

## 4. Environment

```bash
cp .env.example .env.local
chmod 600 .env.local
```

Both processes read `.env.local` from the working directory — Next.js natively,
the worker via `dotenv` in [src/worker/index.ts](src/worker/index.ts). One file
serves both. What must change from your local copy:

| Key | Production value | Why |
|---|---|---|
| `DATABASE_URL` | the server's Postgres | — |
| `AUTH_JWT_SECRET` | `openssl rand -base64 48` | A **fresh** one, ≥ 32 chars or the dashboard refuses to serve. Not the one from your laptop. |
| `SUPERADMIN_PASSWORD` | a long passphrase | **Non-negotiable.** The shipped default is in git; anyone who can read this repo can otherwise read every DM. |
| `META_APP_SECRET` | set | Unset means the webhook accepts unsigned payloads from anyone who finds the URL. |
| `PLAYWRIGHT_HEADLESS` | `true` | There is no display. |
| `DRY_RUN` | `true` **for now** | Flip it in [step 8](#8-going-live), not before. |
| `LOG_LEVEL` | `info` | `debug` logs every selector match and will bury you. |
| `PLAYWRIGHT_USER_DATA_DIR` | `/srv/ghaslet/app/.playwright-profile` | An absolute path, so it does not depend on which directory a script was started from. |

Nothing secret is needed at build time — [src/lib/config.ts](src/lib/config.ts)
is getters all the way down precisely so `next build` never touches a missing
variable. Secrets are a runtime concern only.

```bash
npm run db:migrate     # 0000 → 0003, transactional, checksummed
npm run db:status      # confirm: 4 applied, 0 pending
npm run build
```

---

## 5. The Instagram Web login — the hard part

The worker needs a logged-in Chromium profile, and
[`runInteractiveLogin`](src/instagram/playwright/sessionManager.ts#L63) forces
`headless: false` because you have to type a password and clear a 2FA
challenge yourself. Your server has no screen.

**Do not copy `.playwright-profile/` from your Windows machine.** Chromium
encrypts its cookie store with an OS-bound key — DPAPI on Windows, the keyring
on Linux — so the profile arrives intact and unreadable, and the worker reports
`session_expired` on a directory that looks perfectly fine.

Give the server a temporary display instead:

```bash
sudo apt install -y xvfb x11vnc
xvfb-run --server-args="-screen 0 1280x900x24" bash -c 'x11vnc -display :99 -localhost -nopw & npm run worker:login'
```

Then, from your laptop, tunnel to it and connect a VNC client to
`localhost:5900`:

```bash
ssh -L 5900:localhost:5900 ghaslet@your-server
```

Log in, complete 2FA, and clear any "Was this you?" checkpoint until the
notifications page renders. The script writes the session to
`.playwright-profile/` and exits 0.

`ssh -X` with an X server on your desktop works too and skips the VNC dance,
if you already have one.

Then lock it down — that directory *is* the Instagram account:

```bash
chmod 700 .playwright-profile
```

It is gitignored, but it is also the single most sensitive thing on the box.
Anyone who copies it is logged in as you.

---

## 6. systemd

Two units. Create them as root.

**`/etc/systemd/system/ghaslet-web.service`**

```ini
[Unit]
Description=Ghaslet dashboard and Meta webhook
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
User=ghaslet
WorkingDirectory=/srv/ghaslet/app
Environment=NODE_ENV=production PORT=3000
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
# The webhook acks and then finishes work inside after(). Killing it early
# drops half-processed events, so give SIGTERM room to drain.
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

**`/etc/systemd/system/ghaslet-worker.service`**

```ini
[Unit]
Description=Ghaslet Playwright worker
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
User=ghaslet
WorkingDirectory=/srv/ghaslet/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run worker:start
Restart=always
RestartSec=30
# The worker drains the in-flight poll (30s cap) and closes Chromium on
# SIGTERM. Anything under ~45s here orphans a browser process.
TimeoutStopSec=45
# An expired Instagram session makes the worker exit 1 at startup, and no
# amount of restarting fixes that. Give up after 3 tries in 10 minutes so the
# unit sits in `failed` where you can see it, instead of crash-looping quietly.
StartLimitIntervalSec=600
StartLimitBurst=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ghaslet-web ghaslet-worker
journalctl -u ghaslet-worker -f
```

Logs are one JSON object per line, so `journalctl -u ghaslet-worker -o cat |
jq 'select(.event=="cap_reached")'` works the way you would hope.

---

## 7. TLS and the reverse proxy

Meta will not deliver webhooks to plain HTTP, and the Next.js docs recommend a
reverse proxy in front of `next start` regardless — it absorbs malformed
requests, slow-loris connections and body-size abuse so the render server does
not have to.

Caddy, which gets certificates on its own:

```caddyfile
ghaslet.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Or nginx:

```nginx
server {
    server_name ghaslet.example.com;
    listen 443 ssl;  # certbot fills in the rest

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Streamed Server Component responses arrive in one lump otherwise.
        proxy_buffering off;
    }
}
```

Do not add anything that rewrites request bodies. The webhook's HMAC is
computed over the raw bytes — [route.ts](src/app/api/webhook/route.ts) reads
`request.text()` before parsing for exactly this reason — and a proxy that
re-serialises JSON turns every delivery into a 401.

Close everything else:

```bash
sudo ufw allow 22,80,443/tcp && sudo ufw enable
```

Port 3000 and Postgres stay on loopback.

**Point Meta at it.** In the App Dashboard, change the callback URL to
`https://ghaslet.example.com/api/webhook`, re-enter `INSTAGRAM_VERIFY_TOKEN`,
and verify:

```bash
curl "https://ghaslet.example.com/api/webhook?hub.mode=subscribe&hub.verify_token=$INSTAGRAM_VERIFY_TOKEN&hub.challenge=42"
# -> 42
```

A 403 means the token in the dashboard and the token in `.env.local` disagree.
Changing the callback URL does **not** re-subscribe the account — run
`npm run setup:instagram -- --subscribe` again and confirm with `--check`.

---

## 8. Going live

In order. Each step is a gate.

1. **`https://ghaslet.example.com/login` loads and your superadmin password
   works.** If the logs show `superadmin_default_password`, stop: the shipped
   password is still in force and the dashboard is world-open.
2. **Signature check.** Run the two `curl`s from
   [HYBRID_AUTOMATION.md § Testing](HYBRID_AUTOMATION.md) against the public
   URL. Valid → 200, tampered → 401.
3. **Cold start.** With `DRY_RUN=true`, watch the worker's first poll. Every
   notification must land as `status='skipped'` with `"event":"backfill"`. If
   even one row shows `action_taken='web_dm'`, the backfill guard did not fire
   and you are one flag away from DMing every historical follower.
4. **A real DM.** Message the account from a second one; confirm the AI reply
   and both rows in `instagram_messages`.
5. **Rules.** Open `/automation` and confirm the seeded rules are the ones you
   want. Nothing sends until a rule matches, so an empty rule set is a safe —
   and silent — no-op.
6. **Flip the switch.** `DRY_RUN=false` in `.env.local`, then
   `sudo systemctl restart ghaslet-web ghaslet-worker`.
7. **Watch the first hour.** `journalctl -u ghaslet-worker -f`, and `/activity`
   in the dashboard.

---

## Operations

### The 60-day token — the thing that will bite you

`INSTAGRAM_ACCESS_TOKEN` expires 60 days after issue. When it dies, DMs and
comment replies stop; follows keep working, because those go through the
browser. The failure is quiet.

```bash
npm run setup:instagram -- --refresh    # prints a new token, ~60 more days
```

It only works while the current token is still alive — let it lapse and you
are back to the App Dashboard doing the whole exchange by hand. Refresh at day
~50 and set a calendar reminder now, not later. Update `.env.local` and
restart both services.

### Backups

Two things, and the second is the one people forget:

```bash
# Nightly, in the ghaslet user's crontab
0 3 * * * pg_dump ghaslet | gzip > /srv/ghaslet/backups/$(date +\%F).sql.gz
```

- **Postgres** — conversations, events, rules, users. Restorable.
- **`.playwright-profile/`** — *not* restorable from anywhere else. Losing it
  costs another manual login through VNC, and another fresh-login signal to
  Instagram. Back it up encrypted, or accept the re-login.

### Updating

```bash
sudo -u ghaslet -H bash -c 'cd /srv/ghaslet/app && git pull && npm ci && npm run db:migrate && npm run build'
sudo systemctl restart ghaslet-web ghaslet-worker
```

Migrations before restart, always — a new build against an old schema fails on
the first query rather than at boot. `npm run db:status` reports anything
pending, and flags a migration whose checksum no longer matches what was
applied.

The rebuild needs ~1 GB on its own. On a 4 GB box with the worker running it
fits; on 2 GB it will get OOM-killed mid-build and leave you with a broken
`.next`. Stop the worker first, or build elsewhere.

### Building elsewhere

`next build` output is self-contained enough to ship: build in CI, then rsync
`.next/`, `package.json`, `package-lock.json` and `public/` to the server and
run `npm ci` there. The worker still runs from source through `tsx`, so
`src/` has to be present either way — there is nothing to gain from
`output: "standalone"` here.

### What to watch

| Signal | Means |
|---|---|
| `"event":"session_expired"` | Instagram logged the profile out. Re-do [step 5](#5-the-instagram-web-login--the-hard-part). The sidebar dot turns red and `/activity` shows a banner. |
| `ghaslet-worker` in `failed` | Three startup failures in ten minutes — almost always the session. |
| `"event":"cap_reached"` | Daily DM cap hit. Normal, unless it is every day by noon. |
| `"event":"signature_check_skipped"` | `META_APP_SECRET` is unset in production. Fix immediately. |
| `"event":"superadmin_default_password"` | The dashboard is open to anyone with the URL. Fix immediately. |
| A Graph API 403 in the logs | The token expired, or lost `instagram_business_manage_comments`. |

---

## Splitting the two processes

The app and the worker communicate only through Postgres, so they do not have
to share a machine. A common split:

- **App** → any container host or Vercel. Set every non-Playwright variable in
  the platform's environment UI. `AUTH_JWT_SECRET` must be identical across
  instances or sessions break on every request that lands on a different one.
- **Worker** → a small VPS, exactly as above but without nginx, TLS or
  `next build`. It serves no HTTP; it only needs outbound access and the
  database.
- **Postgres** → managed, with `PGSSL=true` in both.

Two caveats if you scale the app past one instance: set
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (a base64 32-byte value) at build time so
every instance can decrypt the others' Server Function payloads, and set
`deploymentId` in [next.config.ts](next.config.ts) so rolling deploys trigger a
hard navigation instead of serving assets from a build that no longer exists.

Run **exactly one worker**. Two would poll the same notifications
concurrently; `unique (event_type, external_id)` stops the duplicate database
rows, but the daily cap is counted, not locked, and both would be sending
before either had counted.

## Docker

Workable, with one wrinkle: the profile directory must be a named volume or
bind mount, or every `docker run` starts logged out. Chromium also needs
`--shm-size=1g` (or the `--disable-dev-shm-usage` flag the browser manager
already passes) to avoid tab crashes on the default 64 MB `/dev/shm`. The
interactive login still has to happen somewhere with a display, and the volume
carried in.
