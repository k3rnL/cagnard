package api

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
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

func TestS3MinIOIcebergFacadeIntegration(t *testing.T) {
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
	bucket := fmt.Sprintf("cagnard-iceberg-%d", time.Now().UnixNano())
	if _, err := client.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: &bucket}); err != nil {
		t.Fatalf("create MinIO test bucket: %v", err)
	}

	mode := "development"
	defaultUser := "alice"
	label := "S3 Iceberg"
	cfg := &appconfig.CagnardConfig{
		Server: appconfig.ServerConfig{Host: "127.0.0.1", Port: 0},
		Auth:   appconfig.AuthConfig{Mode: &mode, ConfiguredUsersEnabled: true, DefaultUser: &defaultUser},
		Users:  []appconfig.ConfiguredUser{{ID: "alice", DisplayName: "Alice", Roles: []string{"user"}, Claims: map[string]string{}}},
		Providers: []appconfig.ProviderConfig{{
			ID: "minio", Type: "s3", Family: "s3", DisplayName: "MinIO",
			Settings: map[string]string{
				"region": region, "endpoint": endpoint, "pathStyleAccess": "true",
				"sslEnabled": "false", "requestChecksumCalculation": "when_required",
			},
		}},
		Accounts: []appconfig.StorageAccountConfig{{
			ID: "minio-account", ProviderID: "minio", DisplayName: "MinIO", Enabled: true, AuthMode: "static",
			Settings: map[string]string{"credentialMode": "static", "accessKeyId": accessKey, "secretAccessKey": secretKey},
		}},
		GlobalStorage: []appconfig.StorageRootConfig{{
			ID: "s3-iceberg", Label: &label, ProviderID: "minio", AccountID: "minio-account",
			Settings: map[string]string{"bucket": bucket, "prefix": "documents"}, AllowedRoles: []string{"user"},
		}},
	}
	server := NewServer(cfg)
	root, rootErr := server.rootForIdentity(auth.RequestIdentity{}, "global", "s3-iceberg", true)
	if rootErr != nil {
		t.Fatal(rootErr.Error)
	}
	provider, err := server.registry.Provider("minio")
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = provider.DeleteRecursive(context.Background(), root, "tables", nil)
		_, _ = client.DeleteBucket(context.Background(), &s3.DeleteBucketInput{Bucket: &bucket})
	}()

	table := "tables/events"
	location := fmt.Sprintf("s3://%s/documents/%s", bucket, table)
	metadata := fmt.Sprintf(
		`{"format-version":2,"table-uuid":"s3-events","location":%q,"current-snapshot-id":7,"snapshots":[{"snapshot-id":7,"manifest-list":%q}]}`,
		location,
		location+"/metadata/snap-7.avro",
	)
	objects := map[string][]byte{
		table + "/metadata/version-hint.text": []byte("1\n"),
		table + "/metadata/v1.metadata.json":  []byte(metadata),
		table + "/metadata/snap-7.avro":       []byte("manifest-list"),
		table + "/data/part-1.parquet":        bytes.Repeat([]byte{0x50, 0x41, 0x52, 0x31}, 32),
	}
	for objectPath, content := range objects {
		size := int64(len(content))
		if _, err := provider.StreamWriteContext(ctx, root, objectPath, bytes.NewReader(content), storage.FileContentInfo{
			FileName: objectPath, Size: &size,
		}, false, nil); err != nil {
			t.Fatalf("seed %s: %v", objectPath, err)
		}
	}

	probe := getJSON[IcebergProbeResponse](t, server, "/api/storage/iceberg/probe?tunnel=global&rootId=s3-iceberg&path=tables/events")
	if probe.Status != "supported" || probe.SourceURL == nil || probe.TableUUID == nil || *probe.TableUUID != "s3-events" {
		t.Fatalf("unexpected S3 Iceberg probe: %#v", probe)
	}
	base := strings.TrimSuffix(*probe.SourceURL, "metadata/v1.metadata.json")
	manifestRequest := httptest.NewRequest(http.MethodGet, base+"metadata/snap-7.avro", nil)
	manifestResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(manifestResponse, manifestRequest)
	if manifestResponse.Code != http.StatusOK || manifestResponse.Body.String() != "manifest-list" {
		t.Fatalf("unexpected manifest response status=%d body=%q", manifestResponse.Code, manifestResponse.Body.String())
	}

	dataRequest := httptest.NewRequest(http.MethodGet, base+"data/part-1.parquet", nil)
	dataRequest.Header.Set("Range", "bytes=4-11")
	dataResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(dataResponse, dataRequest)
	if dataResponse.Code != http.StatusPartialContent || dataResponse.Body.Len() != 8 || dataResponse.Header().Get("Accept-Ranges") != "bytes" {
		t.Fatalf("unexpected data range status=%d bytes=%d headers=%v", dataResponse.Code, dataResponse.Body.Len(), dataResponse.Header())
	}

	unsafeMetadata := strings.Replace(metadata, location, "s3://foreign-bucket/private/events", 1)
	size := int64(len(unsafeMetadata))
	if _, err := provider.StreamWriteContext(ctx, root, table+"/metadata/v1.metadata.json", strings.NewReader(unsafeMetadata), storage.FileContentInfo{
		FileName: "v1.metadata.json", Size: &size,
	}, true, nil); err != nil {
		t.Fatalf("replace unsafe metadata: %v", err)
	}
	unsafeProbe := getJSON[IcebergProbeResponse](t, server, "/api/storage/iceberg/probe?tunnel=global&rootId=s3-iceberg&path=tables/events")
	if unsafeProbe.Status != "unsupported" || unsafeProbe.SourceURL != nil {
		t.Fatalf("foreign S3 reference should be unsupported: %#v", unsafeProbe)
	}
}
