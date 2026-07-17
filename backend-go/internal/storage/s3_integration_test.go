package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/k3rnl/cagnard/backend-go/internal/config"
)

func TestS3MinIOStreamingIntegration(t *testing.T) {
	endpoint := os.Getenv("CAGNARD_S3_TEST_ENDPOINT")
	if endpoint == "" {
		t.Skip("CAGNARD_S3_TEST_ENDPOINT is not configured")
	}
	accessKey := environmentOrDefault("CAGNARD_S3_TEST_ACCESS_KEY", "cagnard")
	secretKey := environmentOrDefault("CAGNARD_S3_TEST_SECRET_KEY", "cagnard-secret")
	region := environmentOrDefault("CAGNARD_S3_TEST_REGION", "us-east-1")
	client, err := NewAwsS3ObjectClient(
		S3ProviderSettings{
			Endpoint: &endpoint, Region: region, PathStyleAccess: true,
			RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		},
		S3AccountSettings{CredentialMode: "static", AccessKeyID: &accessKey, SecretAccessKey: &secretKey},
	)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	bucket := fmt.Sprintf("cagnard-stream-%d", time.Now().UnixNano())
	if _, err := client.client.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: &bucket}); err != nil {
		t.Fatalf("create MinIO test bucket: %v", err)
	}
	defer func() {
		_, _ = client.client.DeleteBucket(context.Background(), &s3.DeleteBucketInput{Bucket: &bucket})
	}()

	provider := newS3StorageProvider(
		config.ProviderConfig{ID: "minio", Type: "s3", Family: "s3", DisplayName: "MinIO"},
		S3ProviderSettings{Region: region, Endpoint: &endpoint, PathStyleAccess: true, MaxListPages: 100},
		map[string]S3ObjectClient{"minio-account": client},
	)
	root := ResolvedStorageRoot{
		ID: "minio-test", Label: "MinIO test", Tunnel: "global", ProviderID: "minio", AccountID: "minio-account", ProviderFamily: "s3",
		Target: ObjectStoreRootTarget{Bucket: bucket, Prefix: "streaming"}, Settings: map[string]string{},
	}
	payload := bytes.Repeat([]byte("cagnard-stream\n"), 600000)
	var written int64
	entry, err := provider.StreamWriteContext(ctx, root, "nested/large.txt", bytes.NewReader(payload), FileContentInfo{
		FileName: "large.txt", MIMEType: ptr("text/plain"), Size: nil,
	}, false, func(delta int64) { written += delta })
	if err != nil {
		t.Fatalf("multipart stream write: %v", err)
	}
	if written != int64(len(payload)) || entry.Metadata.Size == nil || *entry.Metadata.Size != int64(len(payload)) {
		t.Fatalf("write progress=%d entry=%#v", written, entry)
	}

	var downloaded bytes.Buffer
	var read int64
	if _, err := provider.StreamReadContext(ctx, root, "nested/large.txt", &downloaded, func(delta int64) { read += delta }); err != nil {
		t.Fatalf("stream read: %v", err)
	}
	if read != int64(len(payload)) || !bytes.Equal(downloaded.Bytes(), payload) {
		t.Fatalf("stream read mismatch: progress=%d size=%d", read, downloaded.Len())
	}
	directPayload := []byte("known-size-stream")
	directSize := int64(len(directPayload))
	if _, err := provider.StreamWriteContext(ctx, root, "nested/direct.txt", struct{ io.Reader }{bytes.NewReader(directPayload)}, FileContentInfo{
		FileName: "direct.txt", MIMEType: ptr("text/plain"), Size: &directSize,
	}, false, nil); err != nil {
		t.Fatalf("direct unseekable stream write: %v", err)
	}

	summary, err := provider.DeleteRecursive(ctx, root, "nested", nil)
	if err != nil {
		t.Fatalf("recursive prefix delete: %v", err)
	}
	if summary.Deleted != 2 || summary.Failed != 0 {
		t.Fatalf("recursive delete summary=%#v", summary)
	}
}

func environmentOrDefault(name string, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
