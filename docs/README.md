# Cagnard Documentation

<p align="center">
  <img src="assets/brand/cagnard-mark-transparent.png" width="112" alt="Cagnard orange C mark" />
</p>

Cagnard is a self-hosted, provider-neutral storage browser. Start with a runnable deployment, then use the guides and references that match what you want to accomplish.

![Cagnard Solar light theme browsing an S3-compatible storage root](assets/screenshots/storage-browser.png)

## Start Here

| Goal | Guide |
| --- | --- |
| Try Cagnard with Docker | [Docker quick start](getting-started/docker.md) |
| Install Cagnard on Kubernetes | [Helm quick start](getting-started/helm.md) |
| Work on Cagnard from source | [Development setup](getting-started/development.md) |

## Use Cagnard

- [Browse, copy, move, and manage files](guides/browsing-and-transfers.md)
- [Open files, search content, and use viewers](guides/file-viewers.md)
- [Configure users and personal/global storage](guides/users-and-storage-access.md)
- [Connect S3-compatible storage and MinIO](guides/s3-and-minio.md)
- [Choose and configure appearance](guides/appearance.md)

## Operate Cagnard

- [Configuration](operations/configuration.md)
- [Containers, Kubernetes, and production deployment](operations/deployment.md)
- [Authentication, secrets, and security boundaries](operations/security.md)
- [Release artifacts and upgrades](operations/releases.md)

## Understand And Extend Cagnard

- [Architecture overview](architecture/overview.md)
- [Storage providers and capabilities](architecture/storage-plugins.md)
- [First-party file openers](architecture/file-openers.md)
- [Structured-data runtime and limits](architecture/structured-data-limits.md)
- [Background task engine](architecture/tasks.md)
- [Configuration reference](reference/configuration.md)
- [Task API reference](reference/task-api.md)
- [Provider capability reference](reference/provider-capabilities.md)

## Contribute

- [Testing and validation](contributing/testing.md)
- [Adding a first-party file opener](contributing/file-openers.md)
- [Documentation maintenance](contributing/documentation.md)

The behavior contract remains in [`openspec/specs`](../openspec/specs). OpenSpec is for engineering requirements; this documentation is organized around reader goals.
