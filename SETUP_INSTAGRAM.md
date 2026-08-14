# Setting up the Instagram account

Everything needed to get `INSTAGRAM_ACCESS_TOKEN`, `IG_USER_ID`,
`META_APP_SECRET` and `INSTAGRAM_VERIFY_TOKEN`, plus the one-time Instagram Web
login the Playwright worker needs.

This project uses **Instagram API with Instagram Login** (`graph.instagram.com`),
not the older Facebook-Page-based Graph API. That means **no Facebook Page is
required** — the Instagram account stands alone.

Budget about 30 minutes. Steps 1–3 are prerequisites people most often get
wrong, and step 7 is the one that silently breaks everything if skipped.

---

## 1. Make the Instagram account a Professional account

In the **Instagram mobile app** (this cannot be done on the web):

1. Profile → ☰ → **Settings and privacy**
2. **Account type and tools** → **Switch to professional account**
3. Pick **Business** or **Creator** — either works

Then, still in the app:

4. **Settings and privacy** → **Account privacy** → make sure the account is
   **public**

> Comment and @mention webhooks are only delivered for **public** professional
> accounts. A private account will verify the webhook fine and then never send
> a single comment event.

---

## 2. Allow message access

Still in the Instagram app:

**Settings and privacy** → **Messages and story replies** → **Connected tools**
→ turn on **Allow access to messages**

Without this the DM webhook is silently dead.

---

## 3. Create the Meta app

At [developers.facebook.com/apps](https://developers.facebook.com/apps):

1. **Create app**
2. Use case: **Other** → app type: **Business**
3. Name it, create it
4. In the left sidebar: **Add product** → **Instagram** → **Set up**
5. Choose **API setup with Instagram login**

That page is now your control panel. It holds:

| Field | Goes to |
|---|---|
| **Instagram app ID** | not needed by this project |
| **Instagram app secret** | `META_APP_SECRET` |

Copy the app secret now.

---

## 4. Expose your local server

Meta requires a public HTTPS callback. For local development use a tunnel:

```bash
npx localtunnel --port 3000
# or
ngrok http 3000
```

Keep the URL — your webhook endpoint is `https://<that-host>/api/webhook`.

> The URL changes each time you restart most tunnels, and you must update it in
> the App Dashboard every time. A stable tunnel domain saves real annoyance.

---

## 5. Configure the webhook

On the **API setup with Instagram login** page → **Configure webhooks**:

| Field | Value |
|---|---|
| Callback URL | `https://<your-tunnel>/api/webhook` |
| Verify token | any string you invent — must match `INSTAGRAM_VERIFY_TOKEN` |

Start the app first (`npm run dev`), then click **Verify and save** — Meta sends
a `GET` to that URL immediately and the server has to be up to answer it.

Then **subscribe to these fields**:

- `messages`
- `comments`

---

## 6. Get an access token

On the same page, under **Generate access tokens**:

1. Click **Add account** and log in as the Instagram account
2. Grant the permissions when prompted
3. Copy the generated token

Make sure these scopes are granted — the token is issued with whatever you
approve, and a missing scope means a `403` at runtime, not a warning:

| Scope | Needed for |
|---|---|
| `instagram_business_basic` | reading the profile |
| `instagram_business_manage_messages` | sending DMs, private replies |
| `instagram_business_manage_comments` | reading and replying to comments |

The token from the dashboard is **short-lived (1 hour)**. Exchange it:

```bash
# .env.local needs META_APP_SECRET set first
npm run setup:instagram -- --exchange <the-short-lived-token>
```

That prints a 60-day token. Put it in `.env.local` as
`INSTAGRAM_ACCESS_TOKEN`.

---

## 7. Subscribe the account (the step everyone misses)

Ticking the field checkboxes in the App Dashboard subscribes **the app**. It
does **not** subscribe **the account**. That requires an API call:

```bash
npm run setup:instagram -- --subscribe
```

Skip this and the webhook verifies, the dashboard shows green, and no event
ever arrives.

---

## 8. Verify

```bash
npm run setup:instagram -- --check
```

Expected output:

```
  ✓ Token is valid
    Username     @yourhandle
    Account type BUSINESS
    user_id      17841400000000000

  Put this in .env.local:

IG_USER_ID=17841400000000000

  ✓ Subscribed fields: messages, comments
```

Copy `IG_USER_ID` into `.env.local`. It is what lets the bot recognise its own
comments; without it, replying to your own reply can loop.

Your `.env.local` should now have:

```bash
INSTAGRAM_ACCESS_TOKEN=IGAA...        # 60-day token from step 6
INSTAGRAM_VERIFY_TOKEN=...            # whatever you invented in step 5
META_APP_SECRET=...                   # from step 3
IG_USER_ID=17841400000000000          # from step 8
```

---

## 9. The Playwright worker login

The Graph API cannot DM someone who has never messaged you first, so new
followers are reached through Instagram Web. That needs a real browser session:

```bash
npx playwright install chromium   # once
npm run worker:login
```

A visible Chromium opens. Log in **as the same Instagram account**, complete
2FA and any security checkpoint, and wait — the window closes itself once it
reaches the feed. The session persists in `.playwright-profile/`, so this is a
one-time step.

Then:

```bash
npm run dev      # terminal 1 — dashboard + webhook
npm run worker   # terminal 2 — follower/like polling
```

The sidebar status dot turns green once the worker polls successfully.

> Use a browser profile you are willing to lose. Automating instagram.com
> violates Instagram's Terms of Use and can get the account restricted. The
> worker ships with a daily DM cap, randomised delays and a `DRY_RUN` switch,
> but the risk does not go to zero.

---

## Keeping it alive

**The access token expires after 60 days.** Refresh it before then:

```bash
npm run setup:instagram -- --refresh
```

Worth a calendar reminder at day 50 — there is no automatic refresh, and an
expired token fails silently in the original `sendInstagramMessage`, which does
not check the response.

**The Instagram Web session** expires on its own schedule. When it does, the
worker logs `"event":"session_expired"`, pauses instead of crash-looping, and
the dashboard shows a red banner. Fix with `npm run worker:login`.

---

## When it doesn't work

| Symptom | Cause |
|---|---|
| Webhook verification fails | Server not running, wrong `INSTAGRAM_VERIFY_TOKEN`, or tunnel URL changed |
| Verified, but no events ever arrive | Step 7 not done — run `--subscribe` |
| DMs arrive, comments don't | Account is private (step 1), or `comments` not in the subscribed fields |
| `403` on comment replies | Token missing `instagram_business_manage_comments` — re-issue from step 6 |
| DM webhooks silent | "Allow access to messages" off (step 2) |
| Bot replies to its own replies | `IG_USER_ID` wrong. Set `LOG_LEVEL=debug` and compare the logged `fromId` / `entryId` |
| Nothing sends, events show `skipped` | No matching rule — add one at `/automation` |

Set `LOG_LEVEL=debug` for per-request detail. Logs are one JSON object per line.
