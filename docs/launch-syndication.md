# Cross-site launch syndication

After a user pays for a **Plus / Pro / Ultra** directory listing on aat.ee, the
listing is automatically published on the partner sites:

| Site   | Repo               | Entity created                | Public URL        |
| ------ | ------------------ | ----------------------------- | ----------------- |
| bigkr  | `~/bigkr`          | `products` row, `status=live` | `/product/<slug>` |
| mf8    | `~/mf8`            | `products` row, `status=live` | `/product/<slug>` |
| hicyou | `~/hicyou-pravite` | `bookmarks` row (live)        | `/<slug>`         |

Basic stays on aat.ee only (we own that dataset). This replaces the manual
"admin places the partner-site listings by hand" step the tiers were
originally designed around.

## Flow

```
Stripe webhook  (order tier ∈ {plus,pro,ultra} → paid, amount OK)
   handleDirectoryOrderCompleted()  ── enqueueLaunchSyndication(orderId, projectId, tier)
                                         └─ inserts 1 launch_syndication row per site
                                            (idempotent: UNIQUE(order_id, site))
        │
        ▼
/api/cron/syndicate-launches   (registered in cron_schedule, every 2 min)
        │  drains pending + backed-off failed rows
        ├──► POST https://bigkr.com/api/external/launch   (Bearer key)
        ├──► POST https://mf8.biz/api/external/launch     (Bearer key)
        └──► POST https://hicyou.com/api/external/launch  (Bearer key)
        │  records sent / failed (attempts++, exponential backoff)
        ▼
   once every row for the order is `sent` → directory_order: paid → fulfilled
```

The HTTP push is **never** done inline in the webhook: a partner-site outage
must not fail the Stripe webhook (Stripe would retry the whole event). The
webhook only writes queue rows; the cron worker does the slow work with retry.

## Request contract (`POST /api/external/launch`)

```http
Authorization: Bearer <EXTERNAL_LAUNCH_API_KEY>
Content-Type: application/json
```

```jsonc
{
  "idempotencyKey": "<directory_order id>",
  "source": "aat.ee",
  "name": "Acme",
  "tagline": "One-line summary",
  "description": "<full description, Markdown — converted from aat.ee's sanitized HTML>",
  "websiteUrl": "https://acme.com",
  "logoUrl": "https://statics.aat.ee/logos/....png",
  "coverImageUrl": "https://statics.aat.ee/...", // optional
  "images": ["https://..."], // optional
  "pricing": "free | freemium | paid", // optional
  "platforms": ["Web", "iOS"], // optional
  "githubUrl": "https://github.com/...", // optional
  "twitterUrl": "@acme", // optional
  "categoryName": "Productivity", // optional hint
  "tier": "plus | pro | ultra",
}
```

Response `200`: `{ "ok": true, "id": "...", "slug": "...", "url": "...", "deduped": false }`.
Errors: `401` bad/missing key, `400` invalid payload, `500` server/config.

**Idempotency on the receiver too:** each site dedupes by normalized website
URL (`bookmarks.url` is UNIQUE on hicyou; bigkr/mf8 look up before insert), so
a re-post returns the existing listing with `deduped: true`.

## Setup

1. **Generate one shared secret** and put the same value in
   `EXTERNAL_LAUNCH_API_KEY` on **all four** repos (or use the per-site
   `SYNDICATION_<SITE>_API_KEY` overrides on aat.ee):

   ```bash
   openssl rand -hex 32
   ```

2. **aat.ee** — set the partner endpoint URLs:

   ```
   EXTERNAL_LAUNCH_API_KEY=<shared secret>
   SYNDICATION_BIGKR_URL=https://bigkr.com/api/external/launch
   SYNDICATION_MF8_URL=https://mf8.biz/api/external/launch
   SYNDICATION_HICYOU_URL=https://hicyou.com/api/external/launch
   ```

   Run the migrations — `0026` creates `launch_syndication` + registers the
   cron; `0027` adds `directory_order.amount_verified` (the held-order flag):

   ```bash
   bun run db:migrate          # runs drizzle-kit migrate + apply-pending-sql.ts
   ```

3. **bigkr / mf8 / hicyou** — set `EXTERNAL_LAUNCH_API_KEY` (= shared secret),
   deploy. No DB migration needed on the partner sites; the endpoint reuses
   existing tables. Optional knobs: `EXTERNAL_LAUNCH_DEFAULT_CATEGORY_SLUG`,
   and on bigkr/mf8 `EXTERNAL_LAUNCH_USER_EMAIL` (listing owner, auto-created)
   and `EXTERNAL_LAUNCH_SUBMIT_TYPE` (default `one_time`).

Partner listings are created with `enableBacklinkCheck=false` (bigkr/mf8) and
`isDofollow=true` so the backlink-verification cron never auto-expires them —
the source project has no backlink to the partner site.

## Partner-site notes (per-site gotchas)

Already baked into the receivers; documented here so a new partner site (or a
redeploy that resets config) gets them right.

- **hicyou — CSRF middleware exemption.** `hicyou-pravite/middleware.ts` runs an
  Origin/Referer CSRF check on every mutating `/api/*` request. The worker POSTs
  server-to-server (no Origin header), so `/api/external/` **must** be in
  `CSRF_EXEMPT_PREFIXES` or the request is rejected with
  `403 {"error":"Forbidden: bad origin"}` _before_ reaching the route. bigkr/mf8
  have no such middleware.

- **Dofollow backlinks.** The paid listing's value is a followed backlink, so
  all three sites render the outbound link as a clean dofollow (no
  `nofollow`/`ugc`/`sponsored`):
  - **bigkr / mf8** store `linkRel = null` + `enableBacklinkCheck = false`, so the
    product→website link renders `rel=""` and the backlink cron never downgrades
    it to nofollow.
  - **hicyou** stores `isDofollow = true` → a direct link
    (`?utm_source=hicyou.com`, not the `/go` redirect) with
    `rel="noopener noreferrer"`. `lib/link-utils.ts` `getBookmarkRel()` was
    changed to drop `ugc` from the dofollow case (ugc is in the nofollow family
    and passes no link equity); this applies to **every** dofollow bookmark on
    hicyou, not just syndicated ones.

## Testing

Smoke-test a receiver directly (replace host + key):

```bash
curl -sS -X POST https://bigkr.com/api/external/launch \
  -H "Authorization: Bearer $EXTERNAL_LAUNCH_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"source":"aat.ee","name":"Test Tool","tagline":"hi",
       "websiteUrl":"https://example.com","pricing":"freemium","tier":"plus"}'
```

Drive the aat.ee worker once (it self-auths via the cron dispatcher normally):

```bash
curl -sS https://aat.ee/api/cron/syndicate-launches -H "Authorization: Bearer $CRON_API_KEY"
```

## Operations

- **Inspect the queue:** `select site, status, attempts, last_error, external_url
from launch_syndication where order_id = '<uuid>';`
- **Retry a stuck row:** set it back to `pending` (or `failed` with
  `attempts < 8` and `next_attempt_at = now()`); the next tick picks it up.
- **A site fails permanently:** the order stays `paid` (not `fulfilled`),
  visible to admin. Fix the config/site; the row retries with backoff. A local
  config error (endpoint/key unset) does NOT burn attempts and recovers
  automatically once the env var is set.
- **Self-healing:** the worker reconciles — any verified `paid`/`fulfilled`
  order from the last 6h with no queue rows is re-enqueued (covers a missed
  webhook enqueue, or an admin marking an order paid by hand). A separate
  promotion sweep flips fully-`sent` orders to `fulfilled` even if a prior tick
  crashed mid-promote.
- **Held orders:** an amount-mismatch order is stored `amount_verified=false`
  and is excluded from syndication AND the sponsor sidebar until an admin
  clears it.
- **Canceled Ultra:** canceling the subscription drops not-yet-posted
  (`pending`/`failed`) syndication rows; already-`sent` partner listings stay
  live (cancel keeps existing listings).
