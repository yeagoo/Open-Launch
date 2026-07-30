#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: $0 --commit <40-hex> --output-dir <empty-dir> [--tag <local-tag>] [--allow-dirty] [--validation-only]" >&2
}

source_commit=""
output_dir=""
image_tag=""
allow_dirty=false
validation_only=false
while (($# > 0)); do
  case "$1" in
    --commit)
      source_commit="${2:-}"
      shift 2
      ;;
    --output-dir)
      output_dir="${2:-}"
      shift 2
      ;;
    --tag)
      image_tag="${2:-}"
      shift 2
      ;;
    --allow-dirty)
      allow_dirty=true
      shift
      ;;
    --validation-only)
      validation_only=true
      shift
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

if [[ ! "$source_commit" =~ ^[0-9a-f]{40}$ ]] || [[ -z "$output_dir" ]]; then
  usage
  exit 2
fi
if [[ -z "${NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:-}" ]]; then
  echo "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is required as a BuildKit secret" >&2
  exit 1
fi

head_commit="$(git rev-parse HEAD)"
if [[ "$head_commit" != "$source_commit" ]]; then
  echo "refusing build: --commit does not match the checked-out HEAD" >&2
  exit 1
fi

source_dirty=false
if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  source_dirty=true
  if [[ "$allow_dirty" != true ]]; then
    echo "refusing release build from a dirty worktree" >&2
    exit 1
  fi
fi
source_on_main=false
if git merge-base --is-ancestor "$source_commit" refs/remotes/origin/main 2>/dev/null; then
  source_on_main=true
elif [[ "$validation_only" != true ]]; then
  echo "refusing release build: commit is not verified as an ancestor of origin/main" >&2
  exit 1
fi

if [[ -e "$output_dir" ]] && [[ -n "$(find "$output_dir" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "refusing to overwrite non-empty output directory: $output_dir" >&2
  exit 1
fi
mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd -P)"
local_export="$output_dir/local-export"
image_tag="${image_tag:-open-launch:${source_commit}}"
if [[ ! "$image_tag" =~ ^[a-z0-9][a-z0-9._/-]*:[A-Za-z0-9_.-]+$ ]]; then
  echo "invalid local image tag" >&2
  exit 2
fi
build_input_sha256="$(node scripts/hash-build-input.mjs)"

docker_command=(docker)
docker_uses_sudo=false
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then
    docker_command=(sudo -n docker)
    docker_uses_sudo=true
  else
    echo "Docker is unavailable to the current user and passwordless sudo" >&2
    exit 1
  fi
fi

secret_file="$(mktemp)"
cleanup() {
  rm -f -- "$secret_file"
}
trap cleanup EXIT
chmod 600 "$secret_file"
printf '%s' "$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY" >"$secret_file"

export BUILDX_METADATA_PROVENANCE=max
export BUILDX_GIT_INFO=1
export BUILDX_GIT_LABELS=full

builder_arguments=()
if [[ -n "${OPEN_LAUNCH_BUILDX_BUILDER:-}" ]]; then
  builder_arguments=(--builder "$OPEN_LAUNCH_BUILDX_BUILDER")
fi

public_build_arguments=(--build-arg "NEXT_PUBLIC_URL=https://www.aat.ee")
for public_variable in \
  NEXT_PUBLIC_APP_URL \
  NEXT_PUBLIC_CONTACT_EMAIL \
  NEXT_PUBLIC_GA_MEASUREMENT_ID \
  NEXT_PUBLIC_ONE_TAP_CLIENT_ID \
  NEXT_PUBLIC_PREMIUM_PAYMENT_LINK \
  NEXT_PUBLIC_PREMIUM_PLUS_PAYMENT_LINK; do
  if [[ -n "${!public_variable:-}" ]]; then
    public_build_arguments+=(--build-arg "$public_variable=${!public_variable}")
  fi
done
if [[ -n "${NEXT_PUBLIC_TURNSTILE_SITE_KEY:-}" ]]; then
  public_build_arguments+=(
    --build-arg "NEXT_PUBLIC_TURNSTILE_SITE_IDENTIFIER=$NEXT_PUBLIC_TURNSTILE_SITE_KEY"
  )
fi

"${docker_command[@]}" buildx build \
  "${builder_arguments[@]}" \
  --platform linux/amd64 \
  --secret "id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,src=$secret_file" \
  --build-arg "GIT_COMMIT_SHA=$source_commit" \
  --build-arg "DEPLOYMENT_VERSION=$source_commit" \
  --build-arg "BUILD_INPUT_SHA256=$build_input_sha256" \
  "${public_build_arguments[@]}" \
  --attest "type=sbom,generator=docker/buildkit-syft-scanner:stable-1@sha256:79e7b013cbec16bbb436f312819a49a4a57752b2270c1a9332ae1a10fcc82a68" \
  --provenance=mode=max \
  --metadata-file "$output_dir/build-metadata.json" \
  --output "type=docker,name=$image_tag" \
  --output "type=oci,dest=$output_dir/open-launch-runner.oci.tar" \
  --output "type=local,dest=$local_export" \
  .

if [[ "$docker_uses_sudo" == true ]]; then
  sudo -n chown -R -- "$(id -u):$(id -g)" "$output_dir"
fi

sbom_source="$local_export/sbom.spdx.json"
provenance_source="$local_export/provenance.json"
if [[ ! -s "$sbom_source" ]]; then
  echo "BuildKit did not export sbom.spdx.json" >&2
  exit 1
fi
if [[ ! -s "$provenance_source" ]]; then
  echo "BuildKit did not export provenance.json" >&2
  exit 1
fi
cp "$sbom_source" "$output_dir/sbom.spdx.json"
cp "$provenance_source" "$output_dir/provenance.json"
rm -rf -- "$local_export"

history="$("${docker_command[@]}" image history --no-trunc --format '{{.CreatedBy}}' "$image_tag")"
if grep -Fq -- "$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY" <<<"$history"; then
  echo "build secret leaked into Docker history" >&2
  exit 1
fi
if grep -Fq -- "$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY" "$output_dir/build-metadata.json"; then
  echo "build secret leaked into provenance metadata" >&2
  exit 1
fi

actual_revision="$("${docker_command[@]}" image inspect \
  --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_tag")"
actual_input_hash="$("${docker_command[@]}" image inspect \
  --format '{{ index .Config.Labels "ee.aat.open-launch.build-input-sha256" }}' "$image_tag")"
if [[ "$actual_revision" != "$source_commit" ]] || [[ "$actual_input_hash" != "$build_input_sha256" ]]; then
  echo "runner image labels do not match the reviewed source identity" >&2
  exit 1
fi

RUNNER_SOURCE_COMMIT="$source_commit" \
RUNNER_SOURCE_DIRTY="$source_dirty" \
RUNNER_SOURCE_ON_MAIN="$source_on_main" \
RUNNER_VALIDATION_ONLY="$validation_only" \
RUNNER_BUILD_INPUT_SHA256="$build_input_sha256" \
  node scripts/create-runner-release-manifest.mjs \
  "$output_dir/build-metadata.json" \
  "$output_dir/sbom.spdx.json" \
  "$output_dir/open-launch-runner.oci.tar" \
  "$output_dir/release-manifest.json"

(
  cd "$output_dir"
  sha256sum \
    build-metadata.json \
    open-launch-runner.oci.tar \
    provenance.json \
    release-manifest.json \
    sbom.spdx.json >SHA256SUMS
  sha256sum --check SHA256SUMS
)

echo "Immutable runner artifacts verified at $output_dir"
echo "Local smoke tag: $image_tag"
if [[ "$source_dirty" == true ]] || [[ "$validation_only" == true ]]; then
  echo "Validation only: releasable=false"
fi
