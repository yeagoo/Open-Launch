#!/usr/bin/env bash
# Seed blog content into the PRODUCTION database.
#
# Background: `bun run blog:seed` writes to whatever DATABASE_URL resolves to,
# and in a local checkout that is `.env.local` → a local prodsample DB, NOT
# production. The production Postgres has no published port either — it lives on
# a private Docker network (aat-ee-postgres) behind the deploy host — so seeding
# production requires a tunnel through the host to the container's IP.
#
# This script does exactly that and nothing else: no deploy, no restart, no
# writes outside the blog tables.
#
# Usage:
#   scripts/seed-blog-prod.sh articles      [--dry-run]
#   scripts/seed-blog-prod.sh images        [--dry-run]
#   scripts/seed-blog-prod.sh translations  [--dry-run] [locale]
#   scripts/seed-blog-prod.sh verify
#
# The container IP is looked up on every run (it is not stable across
# recreates). Access facts come from docs/production-deployment-runbook.md.
set -euo pipefail

MODE="${1:-}"
shift || true

SSH_KEY=/home/ivmm/.ssh/deployops_server
KNOWN_HOSTS=/home/ivmm/.ssh/known_hosts_deployops
SSH_TARGET=ecs-user@8.210.175.190
PG_CONTAINER=aat-ee-postgres
APP_CONTAINER=aat-ee-app
LOCAL_PORT="${LOCAL_PORT:-15433}"

if ! [[ "$LOCAL_PORT" =~ ^[0-9]+$ ]] || ((LOCAL_PORT < 1024 || LOCAL_PORT > 65535)); then
  echo "ERROR: LOCAL_PORT must be an unprivileged TCP port (1024-65535)" >&2
  exit 2
fi
if (exec 3<>"/dev/tcp/127.0.0.1/$LOCAL_PORT") 2>/dev/null; then
  exec 3>&- 3<&-
  echo "ERROR: LOCAL_PORT $LOCAL_PORT is already in use" >&2
  exit 2
fi

case "$MODE" in
  articles|images|translations|dates|verify) ;;
  *)
    echo "usage: $0 {articles|images|translations|dates|verify} [--dry-run] [locale]" >&2
    exit 2
    ;;
esac

# -F /dev/null: this box has an orbstack ssh_config.d symlink with broken
# ownership, which makes ssh refuse to start before it reads any of our options.
ssh_prod() {
  ssh -F /dev/null \
    -o BatchMode=yes \
    -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=yes \
    -o UserKnownHostsFile="$KNOWN_HOSTS" \
    -i "$SSH_KEY" \
    "$SSH_TARGET" "$@"
}

echo "==> resolving $PG_CONTAINER address on the deploy host"
PG_IP=$(ssh_prod "sudo -n docker inspect $PG_CONTAINER --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'" | tr -d '\r\n')
if [ -z "$PG_IP" ]; then
  echo "ERROR: could not resolve $PG_CONTAINER IP (is the deploy key still valid?)" >&2
  exit 1
fi
echo "    postgres container: $PG_IP:5432"

echo "==> opening tunnel 127.0.0.1:$LOCAL_PORT -> $PG_IP:5432"
ssh -F /dev/null -N \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$KNOWN_HOSTS" \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -i "$SSH_KEY" \
  -L "$LOCAL_PORT:$PG_IP:5432" \
  "$SSH_TARGET" &
TUNNEL_PID=$!
# shellcheck disable=SC2064
trap "kill $TUNNEL_PID 2>/dev/null || true" EXIT

tunnel_ready=false
for _ in $(seq 1 20); do
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "ERROR: SSH tunnel exited before becoming ready" >&2
    exit 1
  fi
  if (exec 3<>"/dev/tcp/127.0.0.1/$LOCAL_PORT") 2>/dev/null; then
    exec 3>&- 3<&-
    echo "    tunnel up"
    tunnel_ready=true
    break
  fi
  sleep 0.5
done
if [ "$tunnel_ready" != true ]; then
  echo "ERROR: database tunnel did not become ready" >&2
  exit 1
fi

# Credentials come from the running app container, so they cannot drift from
# what production actually uses. Never printed.
PROD_URL=$(ssh_prod "sudo -n docker exec $APP_CONTAINER printenv DATABASE_URL" | tr -d '\r\n')
if [ -z "$PROD_URL" ]; then
  echo "ERROR: could not read DATABASE_URL from $APP_CONTAINER" >&2
  exit 1
fi
DATABASE_URL=$(PROD_URL="$PROD_URL" LOCAL_PORT="$LOCAL_PORT" node -e '
  const url = new URL(process.env.PROD_URL)
  url.hostname = "127.0.0.1"
  url.port = process.env.LOCAL_PORT
  process.stdout.write(url.toString())
')
export DATABASE_URL
echo "    target: production database through local tunnel"

case "$MODE" in
  articles)
    echo "==> seeding English articles (batch)"
    bun --preload ./scripts/preload/server-only-shim.ts scripts/seed-blog-batch.ts "$@"
    ;;
  images)
    echo "==> synchronizing cover paths (updated_at untouched)"
    bun --preload ./scripts/preload/server-only-shim.ts scripts/sync-blog-images.ts "$@"
    ;;
  translations)
    echo "==> seeding hand-written translations"
    bun --preload ./scripts/preload/server-only-shim.ts scripts/seed-blog-translations.ts "$@"
    ;;
  dates)
    echo "==> re-aligning published_at (updated_at untouched)"
    bun --preload ./scripts/preload/server-only-shim.ts scripts/patch-blog-dates.ts "$@"
    ;;
  verify)
    echo "==> verifying"
    bun --preload ./scripts/preload/server-only-shim.ts scripts/verify-blog-seed.ts "$@"
    ;;
esac
