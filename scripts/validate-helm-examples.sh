#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHART_DIR="$ROOT_DIR/deploy/helm/cagnard"
CHART_REL="deploy/helm/cagnard"
HELM_IMAGE="${HELM_IMAGE:-alpine/helm:3.15.4}"

lint_chart() {
  if command -v helm >/dev/null 2>&1; then
    helm lint "$CHART_DIR"
  elif command -v docker >/dev/null 2>&1; then
    docker run --rm \
      -v "$ROOT_DIR:/workspace:ro" \
      -w /workspace \
      "$HELM_IMAGE" \
      lint "$CHART_REL"
  else
    echo "helm is not installed and docker is unavailable for fallback validation" >&2
    exit 1
  fi
}

render_chart() {
  local values_file="$1"
  local values_rel="${values_file#$ROOT_DIR/}"

  if command -v helm >/dev/null 2>&1; then
    helm template cagnard "$CHART_DIR" -f "$values_file" >/dev/null
  elif command -v docker >/dev/null 2>&1; then
    docker run --rm \
      -v "$ROOT_DIR:/workspace:ro" \
      -w /workspace \
      "$HELM_IMAGE" \
      template cagnard "$CHART_REL" -f "$values_rel" >/dev/null
  else
    echo "helm is not installed and docker is unavailable for fallback validation" >&2
    exit 1
  fi
}

lint_chart

while IFS= read -r values_file; do
  echo "Rendering ${values_file#$ROOT_DIR/}"
  render_chart "$values_file"
done < <(find "$CHART_DIR/examples" -name "*.yaml" -type f | sort)
