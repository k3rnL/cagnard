## 1. Runnable Example Catalog

- [x] 1.1 Add a top-level runnable examples catalog README with the example matrix, ports, credentials, and maintenance rule.
- [x] 1.2 Add the `local-filesystem-static` runnable example with complete config, environment sample, compose file, and README.
- [x] 1.3 Add the `s3-minio-static` runnable example with complete config, environment sample, compose file, generated seed files, MinIO initialization, and README.
- [x] 1.4 Add the `local-and-s3-static` runnable example with complete config, environment sample, compose file, generated seed files, MinIO initialization, and README.

## 2. Helm Example Values

- [x] 2.1 Add pure Helm values for the local filesystem/static-user example.
- [x] 2.2 Add pure Helm values for the S3/MinIO/static-user example.
- [x] 2.3 Add pure Helm values for the combined filesystem plus S3/MinIO static-user example.

## 3. Documentation

- [x] 3.1 Update deployment documentation to describe runnable Docker Compose examples and matching Helm values.
- [x] 3.2 Update feature documentation or docs index with the runnable examples catalog and future provider/auth example requirement.

## 4. Validation

- [x] 4.1 Add backend test coverage that loads runnable example HOCON configs.
- [x] 4.2 Add CI/package validation for example Docker Compose files.
- [x] 4.3 Add CI/package validation for example Helm values.
- [x] 4.4 Run OpenSpec validation and repository checks.
