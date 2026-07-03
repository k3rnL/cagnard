#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

validate_quay_manifest() {
  local image_ref="$1"
  local image="${image_ref%%@*}"
  local tag="${image##*:}"
  local repo="${image%:*}"
  repo="${repo#quay.io/}"

  if [[ "$tag" == "$image" || "$repo" == "$image" ]]; then
    echo "Cannot validate untagged quay image reference: $image_ref" >&2
    exit 1
  fi

  if ! curl -fsI "https://quay.io/v2/$repo/manifests/$tag" >/dev/null; then
    echo "Missing quay image manifest: $image_ref" >&2
    exit 1
  fi
}

while IFS= read -r compose_file; do
  example_dir="$(dirname "$compose_file")"
  env_file="$example_dir/.env.example"

  if [[ ! -f "$env_file" ]]; then
    echo "Missing $env_file" >&2
    exit 1
  fi

  echo "Validating ${compose_file#$ROOT_DIR/}"
  docker compose --env-file "$env_file" -f "$compose_file" config >/dev/null
  while IFS= read -r image_ref; do
    case "$image_ref" in
      quay.io/*) validate_quay_manifest "$image_ref" ;;
    esac
  done < <(docker compose --env-file "$env_file" -f "$compose_file" config --images | sort -u)
done < <(find "$ROOT_DIR/examples/run" -name docker-compose.yaml -type f | sort)
