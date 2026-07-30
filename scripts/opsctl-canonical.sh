#!/usr/bin/env bash
set -euo pipefail

readonly OPSCTL_BINARY=/usr/bin/opsctl
readonly OPSCTL_REGISTRY=/srv/server-registry
readonly OPSCTL_STATE_DIR=/var/lib/opsctl

if [[ ! -x "$OPSCTL_BINARY" ]]; then
  echo "canonical opsctl binary is missing: $OPSCTL_BINARY" >&2
  exit 1
fi

if (($# == 0)); then
  set -- --help
fi

exec sudo -n "$OPSCTL_BINARY" \
  --registry "$OPSCTL_REGISTRY" \
  --state-dir "$OPSCTL_STATE_DIR" \
  "$@"
