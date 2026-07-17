package api

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/k3rnl/cagnard/backend-go/internal/auth"
	appconfig "github.com/k3rnl/cagnard/backend-go/internal/config"
	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

func TestS3MinIORootDownloadIntegration(t *testing.T) {
	endpoint := os.Getenv("CAGNARD_S3_TEST_ENDPOINT")
	if endpoint == "" {
		t.Skip("CAGNARD_S3_TEST_ENDPOINT is not configured")
	}
	accessKey := environmentOr("CAGNARD_S3_TEST_ACCESS_KEY", "cagnard")
	secretKey := environmentOr("CAGNARD_S3_TEST_SECRET_KEY", "cagnard-secret")
	region := environmentOr("CAGNARD_S3_TEST_REGION", "us-east-1")
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	awsCfg, err := awsconfig.LoadDefaultConfig(
		ctx,
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
	)
	if err != nil {
		t.Fatal(err)
	}
	client := s3.NewFromConfig(awsCfg, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(endpoint)
		options.UsePathStyle = true
	})
	bucket := fmt.Sprintf("cagnard-root-download-%d", time.Now().UnixNano())
	if _, err := client.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: &bucket}); err != nil {
		t.Fatalf("create MinIO test bucket: %v", err)
	}
	keys := []string{"documents/nested/one.txt", "documents/two.txt", "outside.txt"}
	defer func() {
		for _, key := range keys {
			_, _ = client.DeleteObject(context.Background(), &s3.DeleteObjectInput{Bucket: &bucket, Key: &key})
		}
		_, _ = client.DeleteBucket(context.Background(), &s3.DeleteBucketInput{Bucket: &bucket})
	}()

	mode := "development"
	defaultUser := "alice"
	label := "S3 Documents"
	cfg := &appconfig.CagnardConfig{
		Server: appconfig.ServerConfig{Host: "127.0.0.1", Port: 0},
		Auth:   appconfig.AuthConfig{Mode: &mode, ConfiguredUsersEnabled: true, DefaultUser: &defaultUser},
		Users:  []appconfig.ConfiguredUser{{ID: "alice", DisplayName: "Alice", Roles: []string{"user"}, Claims: map[string]string{}}},
		Providers: []appconfig.ProviderConfig{{
			ID: "minio", Type: "s3", Family: "s3", DisplayName: "MinIO",
			Settings: map[string]string{"region": region, "endpoint": endpoint, "pathStyleAccess": "true", "sslEnabled": "false", "requestChecksumCalculation": "when_required"},
		}},
		Accounts: []appconfig.StorageAccountConfig{{
			ID: "minio-account", ProviderID: "minio", DisplayName: "MinIO", Enabled: true, AuthMode: "static",
			Settings: map[string]string{"credentialMode": "static", "accessKeyId": accessKey, "secretAccessKey": secretKey},
		}},
		PersonalStorage: []appconfig.StorageRootConfig{{
			ID: "s3-documents", Label: &label, ProviderID: "minio", AccountID: "minio-account",
			Settings: map[string]string{"bucket": bucket, "prefix": "documents"}, AllowedUsers: []string{"alice"},
		}},
	}
	server := NewServer(cfg)
	root, rootErr := server.rootForIdentity(auth.RequestIdentity{}, "personal", "s3-documents", true)
	if rootErr != nil {
		t.Fatal(rootErr.Error)
	}
	provider, err := server.registry.Provider("minio")
	if err != nil {
		t.Fatal(err)
	}
	for path, content := range map[string]string{"nested/one.txt": "one", "two.txt": "two"} {
		size := int64(len(content))
		if _, err := provider.StreamWriteContext(ctx, root, path, bytes.NewBufferString(content), storage.FileContentInfo{FileName: path, Size: &size}, false, nil); err != nil {
			t.Fatalf("seed %s: %v", path, err)
		}
	}
	outside := "outside"
	if _, err := client.PutObject(ctx, &s3.PutObjectInput{Bucket: &bucket, Key: &keys[2], Body: bytes.NewReader([]byte(outside)), ContentLength: aws.Int64(int64(len(outside)))}); err != nil {
		t.Fatalf("seed outside prefix: %v", err)
	}

	job := postJSON[TaskResponse](t, server, "/api/tasks/downloads", "", `{"sources":[{"tunnel":"personal","rootId":"s3-documents","path":""}]}`)
	if job.Download == nil || job.Download.FileName != "S3 Documents.zip" {
		t.Fatalf("unexpected S3 root download: %#v", job)
	}
	response := doTaskContentRequest(t, server, job.Download.URL, "")
	if response.Code != http.StatusOK {
		t.Fatalf("S3 root archive status=%d body=%s", response.Code, response.Body.String())
	}
	reader, err := zip.NewReader(bytes.NewReader(response.Body.Bytes()), int64(response.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	files := map[string]string{}
	for _, archived := range reader.File {
		if archived.FileInfo().IsDir() {
			continue
		}
		opened, err := archived.Open()
		if err != nil {
			t.Fatal(err)
		}
		content, err := io.ReadAll(opened)
		_ = opened.Close()
		if err != nil {
			t.Fatal(err)
		}
		files[archived.Name] = string(content)
	}
	if files["S3 Documents/nested/one.txt"] != "one" || files["S3 Documents/two.txt"] != "two" {
		t.Fatalf("S3 prefix archive content=%#v", files)
	}
	if _, leaked := files["S3 Documents/outside.txt"]; leaked {
		t.Fatalf("S3 prefix archive leaked bucket content: %#v", files)
	}
}

func environmentOr(name string, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
