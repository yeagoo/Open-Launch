# Deploy: cross-site launch syndication

Rollout guide for the feature that auto-publishes paid **Plus / Pro / Ultra**
directory listings from aat.ee to the partner sites **bigkr**, **mf8**, and
**hicyou**. Design & internals: [`docs/launch-syndication.md`](docs/launch-syndication.md).

Four repos, all on Zeabur:

| Service | Repo           | Role                                   | Deploy branch | DB migration?              |
| ------- | -------------- | -------------------------------------- | ------------- | -------------------------- |
| aat.ee  | Open-Launch    | sender (Stripe webhook + cron worker)  | `main`        | **yes** (0026, 0027, 0030) |
| bigkr   | bigkr          | receiver (`POST /api/external/launch`) | `main`        | no                         |
| mf8     | mf8            | receiver                               | `main`        | no                         |
| hicyou  | hicyou-pravite | receiver                               | `main`        | no                         |

## 0. One shared secret

Generate once; the SAME value goes on all four services.

```bash
openssl rand -hex 32
```

## 1. Deploy order

Bring up the **receivers first**, then aat.ee. If aat.ee goes first, the worker
just marks rows `deferred` (a `configError` — no retry attempt is burned) and
posts them once the receivers + env are ready. Nothing is lost.

## 2. aat.ee (sender)

Zeabur deploys `main`, so merge/push to `main` to ship.

**a. Run migrations** against the production `DATABASE_URL` (e.g. in the Zeabur
service shell):

```bash
bun run db:migrate     # drizzle-kit migrate + apply-pending-sql.ts (idempotent)
```

Applies (at least) `0026_launch_syndication.sql` (queue table + cron registration),
`0027_directory_order_amount_verified.sql` (held-order flag), and
`0030_register_refresh_dr_cron.sql` (registers the DR refresh cron — see below).
Crons are auto-registered in `cron_schedule`; the existing `/api/cron/dispatch`
picks them up — **no new Zeabur cron job needed**.

> 🔄 `0030` finally schedules `/api/cron/refresh-dr` (`0 4 */3 * *`), which had
> existed since `0020` but was never registered, so the home + pricing DR badges
> went stale. DR now primarily comes from Ahrefs' **free public endpoint** (no API
> key) — `X_RAPIDAPI_KEY` is only a fallback and is **not required**. After the
> migration, confirm the row exists
> (`select * from cron_schedule where path = '/api/cron/refresh-dr'`) and
> optionally force a first refresh with `bun run scripts/smoke-ahrefs.ts aat.ee`.

> ⚠️ The new code references the `launch_syndication` table and the
> `directory_order.amount_verified` column. **Run the migration before/with the
> deploy** — otherwise the Stripe webhook, the sponsor sidebar, and the admin
> orders page error until it runs. (Recoverable: Stripe retries the webhook once
> the DB is migrated.)

**b. Variables** (Zeabur → aat.ee → Variables):

```
EXTERNAL_LAUNCH_API_KEY=<shared secret>
SYNDICATION_BIGKR_URL=https://bigkr.com/api/external/launch
SYNDICATION_MF8_URL=https://<mf8-domain>/api/external/launch
SYNDICATION_HICYOU_URL=https://hicyou.com/api/external/launch
# optional per-site key overrides (default to EXTERNAL_LAUNCH_API_KEY):
# SYNDICATION_BIGKR_API_KEY=   SYNDICATION_MF8_API_KEY=   SYNDICATION_HICYOU_API_KEY=
```

Redeploy / restart so the vars take effect.

## 3. bigkr / mf8 / hicyou (receivers)

No DB migration — the endpoint reuses existing tables. Zeabur → each service →
Variables:

```
EXTERNAL_LAUNCH_API_KEY=<shared secret>          # MUST equal aat.ee's value
# optional:
EXTERNAL_LAUNCH_DEFAULT_CATEGORY_SLUG=<existing category slug>
# bigkr / mf8 only:
EXTERNAL_LAUNCH_USER_EMAIL=launch-bot@aat.ee     # listing owner, auto-created
EXTERNAL_LAUNCH_SUBMIT_TYPE=one_time
```

Redeploy each service so the vars take effect.

## 4. Verify

**a. Per-receiver smoke test** (swap host + key; use a throwaway URL):

```bash
curl -sS -X POST https://bigkr.com/api/external/launch \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"source":"aat.ee","name":"Synd Test","tagline":"hi","websiteUrl":"https://synd-test.example","pricing":"freemium","tier":"plus"}'
```

Expect `{"ok":true,...,"url":"..."}`. Re-run the same body → `{"ok":true,"deduped":true,...}`.
(bigkr/mf8 → `/product/<slug>`, hicyou → `/<slug>`.)

**b. Clean up the smoke-test rows** — they create **live, public** listings:

```sql
-- bigkr / mf8 (products table):
delete from products  where url = 'https://synd-test.example';   -- or: where slug = '<slug>'
-- hicyou (bookmarks table):
delete from bookmarks where url = 'https://synd-test.example';
```

**c. Real end-to-end:** make a real Plus/Pro/Ultra payment, then on the **aat.ee**
DB:

```sql
select site, status, attempts, last_error, external_url
from launch_syndication order by created_at desc limit 10;
```

Within ~2 min the rows turn `sent`; once all three sites are `sent`, the order
flips `paid → fulfilled`.

## 5. Troubleshooting

| Symptom                                                  | Cause                           | Fix                                                                              |
| -------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------- |
| rows stuck `pending`, `last_error` ~ "not configured"    | `SYNDICATION_*_URL` / key unset | set env, redeploy; rows auto-recover (attempts not burned)                       |
| `401` from a receiver                                    | key mismatch                    | same `EXTERNAL_LAUNCH_API_KEY` on aat.ee and that site                           |
| webhook 500 right after deploy                           | migration not run               | `bun run db:migrate`                                                             |
| order stays `paid`, a site row `failed` (attempts maxed) | partner site down / bug         | fix the site, reset the row to `pending` (or `failed` + `next_attempt_at=now()`) |
| order in admin "Held — amount mismatch"                  | paid amount ≠ tier price        | review; it's excluded from syndication + sponsors until you clear the flag       |

More in [`docs/launch-syndication.md`](docs/launch-syndication.md) → Operations.

## 6. Rollback / disable

- **Receivers**: the endpoint is additive and inert without the key — unset
  `EXTERNAL_LAUNCH_API_KEY` to disable.
- **aat.ee**: unset the `SYNDICATION_*_URL` vars to stop posting (rows just queue
  as `deferred`, harmlessly).
- The `amount_verified` column and `launch_syndication` table are additive and
  safe to leave in place.
