# S3-Compatible Storage And MinIO

Cagnard's S3 provider works with AWS S3 and compatible endpoints such as MinIO, R2, Wasabi, and other implementations that support the configured API behavior.

## Try S3 Locally

```bash
cd examples/run/s3-minio-static
cp .env.example .env
docker compose up -d
```

The initializer creates the bucket and sample objects. Open `http://127.0.0.1:5173` and sign in with `alice` / `cagnard`.

Open **Global > Structured data** to inspect the generated Parquet, Avro OCF, Arrow IPC/Feather, NDJSON, CSV, and TSV fixtures through the S3 provider. The initializer mirrors [`examples/storage/global/structured-data`](../../examples/storage/global/structured-data/README.md), including safe malformed and truncated cases. Parquet requests stay on Cagnard's authenticated content endpoint and use S3-backed HTTP ranges rather than browser-visible S3 credentials.

## Provider Settings

```hocon
providers = [
  {
    id = s3-main
    type = s3
    family = s3
    displayName = "Object storage"
    settings {
      region = "us-east-1"
      endpoint = "https://s3.example.test"
      pathStyleAccess = "true"
      sslEnabled = "true"
      trustAllCertificates = "false"
      requestChecksumCalculation = "when_required"
    }
  }
]
```

Custom endpoints, path-style addressing, TLS behavior, and streamed request checksum behavior are explicit so non-AWS providers do not need provider-specific UI code.

## Credentials

Supported modes are static access key/session token, AWS default provider chain, and named profile. Keep access keys in environment substitutions, mounted secret files, workload identity inputs, or a secret manager. They are never returned to the browser.

## Roots

An S3 root specifies a bucket and optional prefix. Paths shown to users are relative to that prefix, and an optional label hides unsuitable bucket names.

```hocon
settings {
  bucket = "company-archive"
  prefix = "documents/alice"
}
label = "Documents"
```

## Object-Store Semantics

- Prefixes are displayed as directories, including deduplicated folder markers.
- Rename and move are degraded copy-then-delete operations.
- Browser pagination uses `ListObjectsV2` continuation tokens for native name-ordered listings.
- Search and non-native sorting may scan multiple pages up to configured safety limits.
- Stream and range reads avoid whole-object buffering for transfers and media.
- S3 file watching uses backend polling and is reported as degraded.

See the [provider capability reference](../reference/provider-capabilities.md) for cross-provider behavior.
