#!/usr/bin/env bash
set -euo pipefail

image_ref="${1:-}"
if [[ -z "$image_ref" ]] || (($# != 1)); then
  echo "usage: $0 <local-image-ref>" >&2
  exit 2
fi

docker_command=(docker)
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then
    docker_command=(sudo -n docker)
  else
    echo "Docker is unavailable to the current user and passwordless sudo" >&2
    exit 1
  fi
fi

run_id="open-launch-smoke-$$-$(date +%s)"
network_name="$run_id"
postgres_name="$run_id-postgres"
redis_name="$run_id-redis"
web_name="$run_id-web"
env_file="$(mktemp)"
response_dir="$(mktemp -d)"

assert_status() {
  local expected="$1"
  local path="$2"
  local status
  status="$(curl \
    --silent \
    --show-error \
    --location \
    --max-time 30 \
    --output "$response_dir/body" \
    --write-out '%{http_code}' \
    "$base_url$path")"
  if [[ "$status" != "$expected" ]]; then
    "${docker_command[@]}" logs --tail 100 "$web_name" >&2
    echo "expected HTTP $expected for $path, received $status" >&2
    exit 1
  fi
}

cleanup() {
  "${docker_command[@]}" rm -f "$web_name" "$redis_name" "$postgres_name" >/dev/null 2>&1 || true
  "${docker_command[@]}" network rm "$network_name" >/dev/null 2>&1 || true
  rm -f -- "$env_file"
  rm -rf -- "$response_dir"
}
trap cleanup EXIT

"${docker_command[@]}" image inspect "$image_ref" >/dev/null
image_platform="$("${docker_command[@]}" image inspect --format '{{.Os}}/{{.Architecture}}' "$image_ref")"
image_user="$("${docker_command[@]}" image inspect --format '{{.Config.User}}' "$image_ref")"
if [[ "$image_platform" != "linux/amd64" ]] || [[ "$image_user" != "nextjs" ]]; then
  echo "runner must be linux/amd64 and configured for the nextjs user" >&2
  exit 1
fi

"${docker_command[@]}" run --rm --platform linux/amd64 --entrypoint node "$image_ref" \
  cron-ledger-worker.mjs --check >/dev/null
"${docker_command[@]}" run --rm --platform linux/amd64 --entrypoint sh "$image_ref" -c \
  'test ! -e /app/.env && test ! -e /app/.env.local && test ! -e /app/.env.production'

"${docker_command[@]}" network create "$network_name" >/dev/null
"${docker_command[@]}" run -d \
  --name "$postgres_name" \
  --network "$network_name" \
  --network-alias postgres \
  -e POSTGRES_DB=open_launch_runner_smoke \
  -e POSTGRES_PASSWORD=runner_smoke_password \
  -p 127.0.0.1::5432 \
  postgres:16-alpine@sha256:16bc17c64a573ef34162af9298258d1aec548232985b33ed7b1eac33ba35c229 \
  >/dev/null
"${docker_command[@]}" run -d \
  --name "$redis_name" \
  --network "$network_name" \
  --network-alias redis \
  redis:7.4-alpine@sha256:e7723ff73d963f5cc6d9c4643ea3d989527a402a319239054e9472a7fb9219a2 \
  >/dev/null

for _ in $(seq 1 60); do
  if "${docker_command[@]}" exec "$postgres_name" \
    pg_isready -U postgres -d open_launch_runner_smoke >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
"${docker_command[@]}" exec "$postgres_name" \
  pg_isready -U postgres -d open_launch_runner_smoke >/dev/null

postgres_port="$("${docker_command[@]}" port "$postgres_name" 5432/tcp | sed -n '1s/.*://p')"
if [[ ! "$postgres_port" =~ ^[0-9]+$ ]]; then
  echo "could not resolve the smoke PostgreSQL host port" >&2
  exit 1
fi
DATABASE_URL="postgresql://postgres:runner_smoke_password@127.0.0.1:${postgres_port}/open_launch_runner_smoke" \
  bun run db:migrate

chmod 600 "$env_file"
printf '%s\n' \
  'NODE_ENV=production' \
  'SERVICE_ROLE=web' \
  'EMBEDDED_CRON_DISABLED=true' \
  'CRON_SCHEDULER_MODE=legacy' \
  'DATABASE_URL=postgresql://postgres:runner_smoke_password@postgres:5432/open_launch_runner_smoke' \
  'DATABASE_POOL_MAX=3' \
  'REDIS_URL=redis://redis:6379' \
  'BETTER_AUTH_SECRET=runner-smoke-auth-secret-32-bytes-minimum' \
  'GOOGLE_CLIENT_ID=runner-smoke' \
  'GOOGLE_CLIENT_SECRET=runner-smoke' \
  'GITHUB_CLIENT_ID=runner-smoke' \
  'GITHUB_CLIENT_SECRET=runner-smoke' \
  'TURNSTILE_SECRET_KEY=runner-smoke' \
  'STRIPE_SECRET_KEY=sk_test_runner_smoke' \
  'STRIPE_WEBHOOK_SECRET=whsec_runner_smoke' \
  'RESEND_API_KEY=re_runner_smoke' \
  'R2_ACCOUNT_ID=runner-smoke' \
  'R2_ACCESS_KEY_ID=runner-smoke' \
  'R2_SECRET_ACCESS_KEY=runner-smoke' \
  'R2_BUCKET_NAME=runner-smoke' \
  'R2_PUBLIC_DOMAIN=static.example.invalid' \
  'CRON_API_KEY=runner-smoke-cron-key' >"$env_file"

"${docker_command[@]}" run -d \
  --name "$web_name" \
  --network "$network_name" \
  --env-file "$env_file" \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --memory 768m \
  --cpus 2 \
  --platform linux/amd64 \
  -p 127.0.0.1::8080 \
  "$image_ref" >/dev/null

web_port="$("${docker_command[@]}" port "$web_name" 8080/tcp | sed -n '1s/.*://p')"
if [[ ! "$web_port" =~ ^[0-9]+$ ]]; then
  echo "could not resolve the runner host port" >&2
  exit 1
fi
base_url="http://127.0.0.1:$web_port"

for _ in $(seq 1 120); do
  health="$("${docker_command[@]}" inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$web_name")"
  if [[ "$health" == "healthy" ]]; then
    break
  fi
  if [[ "$health" == "unhealthy" ]]; then
    "${docker_command[@]}" logs --tail 100 "$web_name" >&2
    exit 1
  fi
  sleep 1
done
if [[ "$("${docker_command[@]}" inspect --format '{{.State.Health.Status}}' "$web_name")" != "healthy" ]]; then
  "${docker_command[@]}" logs --tail 100 "$web_name" >&2
  echo "runner did not become healthy" >&2
  exit 1
fi

assert_status 200 "/api/health"
assert_status 200 "/"
assert_status 200 "/es"
assert_status 200 "/sitemap.xml"
if ! grep -Eq '<(urlset|sitemapindex)([ >])' "$response_dir/body"; then
  echo "sitemap smoke response is not XML" >&2
  exit 1
fi
assert_status 401 "/api/cron/translate-projects"
assert_status 200 "/logo.svg"

echo "Runner image smoke passed: health, pages, sitemap, auth boundary, static asset."
