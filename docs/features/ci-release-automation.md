# CI And Release Automation

## Behavior

Cagnard provides GitHub Actions workflows for validation and optional image publishing.

Validation runs on pull requests and pushes to `main` or `master` when application, deployment, or workflow files change.

Publishing runs on version tags matching `v*` or by manual workflow dispatch.

## Validation Workflow

The validation workflow is:

```text
.github/workflows/validate.yml
```

It runs:

- backend tests with `sbt backend/test`
- frontend typecheck with `pnpm --filter @cagnard/frontend typecheck`
- frontend production build with `pnpm --filter @cagnard/frontend build`
- backend Mocker image build
- frontend Mocker image build
- Helm lint and template rendering

The workflow uses Node.js 22 because the repository declares `pnpm@11.7.0`, which requires Node.js 22.13 or newer.

Local equivalents:

```bash
sbt backend/test
pnpm --filter @cagnard/frontend typecheck
pnpm --filter @cagnard/frontend build
mocker build -f Containerfile.backend -t cagnard-backend:ci .
mocker build -f frontend/Containerfile -t cagnard-frontend:ci .
helm lint deploy/helm/cagnard
helm template cagnard deploy/helm/cagnard
```

## Publishing Workflow

The publishing workflow is:

```text
.github/workflows/publish-images.yml
```

By default it publishes:

- `ghcr.io/<owner>/cagnard-backend:<tag>`
- `ghcr.io/<owner>/cagnard-frontend:<tag>`

For GHCR in the same repository, the workflow uses `GITHUB_TOKEN` with `packages: write`.

For another registry, configure workflow dispatch inputs and repository secrets:

- `REGISTRY_USERNAME`
- `REGISTRY_TOKEN`

The workflow does not print registry credentials or secret values.

Both workflows install Apple's `container` runtime, install Mocker from `us/tap/mocker`, and start the runtime with `container system start --enable-kernel-install` so macOS runners do not wait for an interactive kernel-install prompt.

## Tagging

For tag pushes, the image tag is the Git tag name, for example `v0.1.0`.

For manual dispatch, `image_tag` can override the tag. If it is omitted, the workflow uses the current ref name or commit SHA.

## Known Limitations

- Images are published, but Helm chart publishing is not implemented yet.
- The workflow does not currently generate SBOMs, provenance attestations, or signed images.
- The validation and publishing workflows run on `macos-26` because Mocker requires macOS 26+, Apple Silicon, and Apple's `container` CLI.
