#!/usr/bin/env bash
set -euo pipefail

# Run the Community browser suite against resources owned by this process. The
# fixture rejects non-loopback URLs, and the database name deliberately retains
# the e2e prefix required by that guard.
readonly postgres_image="postgres:16-alpine@sha256:16bc17c64a573ef34162af9298258d1aec548232985b33ed7b1eac33ba35c229"
readonly redis_image="redis:7.4-alpine@sha256:e7723ff73d963f5cc6d9c4643ea3d989527a402a319239054e9472a7fb9219a2"
readonly postgres_database="open_launch_e2e_community_browser"
readonly postgres_password="community_browser_test_password"
readonly auth_secret="open-launch-e2e-auth-secret-32-bytes"

node_binary="${NODE_BINARY:-node}"
if ! node_binary="$(command -v "$node_binary")"; then
  echo "Node 24.15+ is required; select the repository Node version or set NODE_BINARY." >&2
  exit 1
fi
if ! "$node_binary" scripts/check-node-runtime.mjs; then
  exit 1
fi
# Playwright's webServer command invokes `node` by name. Keep the validated
# executable first so the build and the standalone server use the same runtime.
node_directory="$(dirname "$node_binary")"
export PATH="$node_directory:$PATH"

docker_command=(docker)
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then
    docker_command=(sudo -n docker)
  else
    echo "Docker is unavailable to the current user and passwordless sudo" >&2
    exit 1
  fi
fi

run_id="open-launch-community-browser-$$-$(date +%s)"
postgres_name="$run_id-postgres"
redis_name="$run_id-redis"

cleanup() {
  "${docker_command[@]}" rm -f "$redis_name" "$postgres_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

container_port() {
  local container_name="$1"
  local container_port="$2"
  local host_port

  host_port="$("${docker_command[@]}" port "$container_name" "$container_port/tcp" | sed -n '1s/.*://p')"
  if [[ ! "$host_port" =~ ^[0-9]+$ ]]; then
    echo "could not resolve the loopback port for $container_name" >&2
    exit 1
  fi
  printf '%s\n' "$host_port"
}

wait_for_postgres() {
  for _ in {1..60}; do
    if "${docker_command[@]}" exec "$postgres_name" \
      pg_isready -U postgres -d "$postgres_database" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  "${docker_command[@]}" logs --tail 100 "$postgres_name" >&2 || true
  echo "temporary Community PostgreSQL did not become ready" >&2
  exit 1
}

wait_for_redis() {
  for _ in {1..60}; do
    if "${docker_command[@]}" exec "$redis_name" redis-cli ping >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  "${docker_command[@]}" logs --tail 100 "$redis_name" >&2 || true
  echo "temporary Community Redis did not become ready" >&2
  exit 1
}

find_available_port() {
  "$node_binary" --input-type=module <<'NODE'
import { createServer } from "node:net"

const server = createServer()
server.listen({ host: "127.0.0.1", port: 0 }, () => {
  const address = server.address()
  if (!address || typeof address === "string") {
    console.error("could not allocate a loopback port")
    process.exitCode = 1
    server.close()
    return
  }
  process.stdout.write(`${address.port}\n`)
  server.close()
})
NODE
}

"${docker_command[@]}" run -d \
  --name "$postgres_name" \
  -e "POSTGRES_DB=$postgres_database" \
  -e "POSTGRES_PASSWORD=$postgres_password" \
  -p 127.0.0.1::5432 \
  "$postgres_image" \
  >/dev/null
"${docker_command[@]}" run -d \
  --name "$redis_name" \
  -p 127.0.0.1::6379 \
  "$redis_image" \
  >/dev/null

wait_for_postgres
wait_for_redis

postgres_port="$(container_port "$postgres_name" 5432)"
redis_port="$(container_port "$redis_name" 6379)"
# Docker publishes these test services on IPv4 loopback only. Do not use
# `localhost` here: Node may resolve it to ::1 first, which is deliberately
# not exposed by the container bindings. The fixture accepts 127.0.0.1.
database_url="postgresql://postgres:${postgres_password}@127.0.0.1:${postgres_port}/${postgres_database}"
redis_url="redis://127.0.0.1:${redis_port}"
app_port="$(find_available_port)"
base_url="http://localhost:${app_port}"

# The browser fixture starts the standalone server. Build-time public values
# must therefore use its unique loopback origin, not a developer's .env value.
DATABASE_URL="$database_url" bun run db:migrate
NEXT_PUBLIC_URL="$base_url" bun run build:next
bun scripts/prepare-standalone.ts

CI=1 \
E2E_BASE_URL="$base_url" \
E2E_DATABASE_URL="$database_url" \
E2E_REDIS_URL="$redis_url" \
BETTER_AUTH_SECRET="$auth_secret" \
  bunx playwright test e2e/community.spec.ts

echo "Community browser gate passed against isolated loopback services."
