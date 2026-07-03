## Context

Cagnard now has a stateless Scala backend, static user authentication, filesystem storage, S3-compatible storage, Docker/Helm packaging, and example HOCON configuration files. The repository also has sample filesystem data under `examples/storage` and chart example values under `deploy/helm/cagnard/examples`.

What is missing is a coherent runnable examples catalog. A new user still has to infer which config files, containers, demo credentials, storage fixtures, and chart values belong together. This gets worse as providers and auth methods grow, because each new feature creates another setup path that can drift from the working application.

The examples must satisfy two audiences:

- Local evaluators who want a complete `docker compose up` path, including MinIO for S3-compatible storage.
- Kubernetes operators who want pure Helm values that mirror the same provider/auth combinations.

The examples must remain secret-safe. Demo credentials are acceptable only for local services and must be clearly scoped to the example. Real cloud credentials should use placeholders or environment substitutions.

## Goals / Non-Goals

**Goals:**

- Add an examples catalog that progresses from simple local setups to richer provider/auth combinations.
- Provide runnable Docker Compose examples for local filesystem, static users, S3/MinIO, and combined static-users-plus-S3 setups.
- Provide matching pure Helm values for the same relevant combinations.
- Include MinIO in S3 examples so users can run an S3-compatible demo without external cloud accounts.
- Make the example layout predictable enough that every future provider or auth method can add the right starter assets in the right place.
- Add validation hooks so example HOCON, Compose, and Helm assets do not silently rot.

**Non-Goals:**

- Build a production-grade deployment automation framework.
- Cover every possible provider/auth permutation. The catalog should include relevant starter combinations, not an exhaustive Cartesian product.
- Manage production secrets in examples. Real credentials remain operator-owned and should be represented by placeholders, environment variables, or Kubernetes secrets.
- Start real cloud services in local examples. S3-compatible local demos use MinIO.
- Replace the existing Helm chart. The examples should consume and exercise it.

## Decisions

### 1. Use a dedicated runnable examples tree

Create a new runnable catalog under `examples/run/`, separate from `examples/storage/`.

Initial examples:

- `examples/run/local-filesystem-static`: simplest complete browser with static users and Unix filesystem roots.
- `examples/run/s3-minio-static`: static users with an S3-compatible provider backed by MinIO.
- `examples/run/local-and-s3-static`: combined filesystem plus S3/MinIO example showing multiple providers in the same UI.

Each example directory should contain:

- `README.md` with startup, login, verification, cleanup, and security notes.
- `cagnard.conf` or `cagnard.conf.template` for the backend.
- `.env.example` for ports, image names, and demo credentials.
- `docker-compose.yaml` for local execution.
- optional provider-specific seed files, such as MinIO initialization scripts.

Rationale: the existing `examples/storage` directory is sample data, not a runnable deployment entry point. A dedicated `examples/run` tree makes the user path obvious and gives future provider/auth work a stable place to add examples.

Alternative considered: keep all examples under `config/` and `deploy/helm/cagnard/examples`. That keeps files near their consumers but forces users to assemble a runnable setup from multiple directories.

### 2. Mirror runnable examples in Helm values

Keep chart-specific example values under `deploy/helm/cagnard/examples/` and name them after the runnable examples:

- `local-filesystem-static-values.yaml`
- `s3-minio-static-values.yaml`
- `local-and-s3-static-values.yaml`

Do not add Helmfile wrappers in the first implementation. Operators who use Helmfile can reference these values files directly from their own Helmfile definitions.

Rationale: Helm values belong close to the chart so `helm template deploy/helm/cagnard -f deploy/helm/cagnard/examples/...` is natural and easy to validate. Runnable example READMEs can link to the matching values instead of duplicating Kubernetes configuration.

Alternative considered: store Helm values inside each `examples/run/*` directory. That improves locality for one example but makes chart validation and discovery less consistent.

### 3. Prefer explicit complete example configs over clever inheritance

Each runnable example should include a complete backend HOCON file or a plainly rendered template. Shared snippets can be introduced later only if duplication becomes a real maintenance problem.

Rationale: examples are onboarding artifacts. Users should be able to open one config file and understand the entire setup without chasing include chains or generator scripts.

Alternative considered: centralize common config snippets and include them from every example. That reduces duplication but makes the examples harder to copy as a starting point.

### 4. Compose examples build locally by default

Docker Compose examples should default to building or using the local project images, while allowing image override through `.env` variables when published images are available. Every Compose example starts both the backend and frontend so the user always gets the full browser experience. S3 examples include MinIO and an initialization service using the MinIO client to create buckets, prefixes, and generated sample files.

Rationale: contributors often run examples from a checkout before release images exist. Operators can still adapt the same examples to published images by overriding environment variables.

Alternatives considered: pull only registry images, or provide backend-only Compose examples for provider testing. Registry-only examples are brittle before release images exist, and backend-only examples are less useful for first-run evaluation because Cagnard is primarily experienced through the browser UI.

### 5. Establish provider/auth example maintenance rules

Documentation must state that any new storage provider, auth method, or provider-specific deployment requirement should update examples when it changes how users start Cagnard.

The expected rule is:

- A new provider adds at least one runnable Docker Compose example or extends a relevant combination example.
- A new provider adds matching Helm values when it can be configured in Kubernetes.
- A new auth method adds a simple runnable example and one relevant combined provider example.
- Provider/auth examples use local emulators where practical and placeholders where external services are required.

Rationale: this turns examples into a maintained product surface rather than a one-off demo.

Alternative considered: document features only in the feature docs. That helps explain capabilities but does not prove the application can be started from scratch.

### 6. Validate examples with lightweight structural checks

Add checks that can run in CI without requiring cloud credentials:

- Parse example HOCON configs with the backend config loader.
- Run `docker compose config` for each example compose file.
- Run `helm template` for each example values file.
- For S3/MinIO, keep full service startup as an optional or targeted smoke test rather than a required check for every backend job.

Rationale: structural checks catch most drift cheaply. Full MinIO behavior tests should stay close to S3-provider tests so generic packaging checks do not become slow or fragile.

Alternative considered: require every example to boot end-to-end in CI. That gives stronger confidence but increases runtime and couples unrelated changes to container orchestration details.

## Risks / Trade-offs

- Example drift -> add CI checks for HOCON loading, Compose rendering, and Helm rendering.
- Too many combinations -> maintain a curated matrix and require examples only for relevant starter paths.
- Demo credentials mistaken for production guidance -> use `.env.example`, local-only names, and explicit README warnings.
- Compose and Helm behavior diverge -> use matching example names and document each pair in the catalog.
- MinIO setup complexity hides the S3 lesson -> keep the S3 example focused on one bucket, one optional prefix, and a small generated seed dataset.

## Migration Plan

1. Add the `examples/run/` catalog and top-level examples README.
2. Add `local-filesystem-static` first using existing sample filesystem data.
3. Add `s3-minio-static` with MinIO service, generated sample objects, bucket initialization, and Cagnard S3 provider config.
4. Add `local-and-s3-static` to demonstrate multiple providers and transfer-ready browsing.
5. Add matching Helm chart example values under `deploy/helm/cagnard/examples/`.
6. Update documentation to describe the catalog, demo credentials, ports, cleanup, and the provider/auth maintenance rule.
7. Add CI or test commands for HOCON, Compose, and Helm structural validation.

Rollback is straightforward because examples are additive. If an example is wrong, remove or fix the affected example files without changing runtime behavior.

## Open Questions

None for the first implementation.
