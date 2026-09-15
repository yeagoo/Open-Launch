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
  local follow_redirects="${3:-true}"
  local status
  local -a curl_arguments=(
    --silent
    --show-error
    --max-time 30
    --output "$response_dir/body"
    --write-out '%{http_code}'
  )
  if [[ "$follow_redirects" == true ]]; then
    curl_arguments+=(--location)
  fi
  status="$(curl "${curl_arguments[@]}" "$base_url$path")"
  if [[ "$status" != "$expected" ]]; then
    "${docker_command[@]}" logs --tail 100 "$web_name" >&2
    echo "expected HTTP $expected for $path, received $status" >&2
    exit 1
  fi
}

assert_no_prerender_cache_errors() {
  local runner_logs
  runner_logs="$("${docker_command[@]}" logs "$web_name" 2>&1)"
  if grep -Fq "Failed to update prerender cache" <<<"$runner_logs"; then
    "${docker_command[@]}" logs --tail 100 "$web_name" >&2
    echo "runner logged a Next.js prerender cache write failure" >&2
    exit 1
  fi
}

# Redirects are part of the public routing contract. Do not follow them here:
# the response itself must persist the selected site locale and point at the
# English-only canonical forum address.
assert_redirect() {
  local expected_status="$1"
  local path="$2"
  local expected_location="$3"
  local expected_cookie="${4:-}"
  local headers="$response_dir/headers"
  local location
  local status

  status="$(curl \
    --silent \
    --show-error \
    --max-time 30 \
    --output "$response_dir/body" \
    --dump-header "$headers" \
    --write-out '%{http_code}' \
    "$base_url$path")"
  if [[ "$status" != "$expected_status" ]]; then
    "${docker_command[@]}" logs --tail 100 "$web_name" >&2
    echo "expected HTTP $expected_status redirect for $path, received $status" >&2
    exit 1
  fi

  location="$(awk 'tolower($0) ~ /^location:/ { sub(/\r$/, ""); sub(/^[^:]*:[[:space:]]*/, ""); print; exit }' "$headers")"
  if [[ "$location" != "$expected_location" && "$location" != "$base_url$expected_location" ]]; then
    "${docker_command[@]}" logs --tail 100 "$web_name" >&2
    echo "unexpected redirect for $path: ${location:-<missing>}" >&2
    exit 1
  fi

  if [[ -n "$expected_cookie" ]] && ! grep -Fqi "$expected_cookie" "$headers"; then
    "${docker_command[@]}" logs --tail 100 "$web_name" >&2
    echo "missing expected redirect cookie for $path: $expected_cookie" >&2
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

start_web() {
  "${docker_command[@]}" run -d \
    --name "$web_name" \
    --network "$network_name" \
    --env-file "$env_file" \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=64m \
    --tmpfs /app/.next/cache:rw,noexec,nosuid,nodev,size=256m,uid=1001,gid=1001,mode=0750 \
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
  if ! "${docker_command[@]}" exec --user 1001:1001 "$web_name" sh -c 'test -d /app/.next/cache && test -w /app/.next/cache'; then
    "${docker_command[@]}" logs --tail 100 "$web_name" >&2
    echo "runner Next.js cache mount is not writable by the application user" >&2
    exit 1
  fi
}

start_web

assert_status 200 "/api/health"
assert_status 200 "/"
if grep -Fq 'href="/community"' "$response_dir/body"; then
  "${docker_command[@]}" logs --tail 100 "$web_name" >&2
  echo "community navigation is visible without the explicit runtime opt-in" >&2
  exit 1
fi
assert_status 404 "/community" false
assert_status 404 "/community?type=shipped" false
assert_redirect 307 "/zh/community?type=shipped&sort=hot" "/community?type=shipped&sort=hot" "NEXT_LOCALE=zh"
assert_redirect 308 "/community/mine" "/community?view=mine"
assert_redirect 308 "/community/saved" "/community?view=saved"
assert_redirect 308 "/community/post%2Fa" "/community/t/post%2Fa"
assert_redirect 308 "/community/post%2Fa/edit" "/community/t/post%2Fa/edit"
assert_no_prerender_cache_errors

# Start the exact same immutable image with the explicit opt-in. This catches
# accidental build-time capture of the runtime flag without enabling a real
# environment or requiring a second image build.
"${docker_command[@]}" rm -f "$web_name" >/dev/null
printf '%s\n' 'COMMUNITY_ENABLED=1' >>"$env_file"
start_web
assert_status 200 "/"
if ! grep -Fq 'href="/community"' "$response_dir/body"; then
  "${docker_command[@]}" logs --tail 100 "$web_name" >&2
  echo "community navigation is absent after the explicit runtime opt-in" >&2
  exit 1
fi
assert_status 200 "/community"

assert_status 200 "/es"
assert_status 200 "/sitemap.xml"
if ! grep -Eq '<(urlset|sitemapindex)([ >])' "$response_dir/body"; then
  echo "sitemap smoke response is not XML" >&2
  exit 1
fi
assert_status 401 "/api/cron/translate-projects"
assert_status 200 "/logo.svg"
assert_no_prerender_cache_errors

echo "Runner image smoke passed: health, cache mount, pages, community gate/routing, sitemap, auth boundary, static asset."
