package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

func TestIcebergProbeAndAuthorizedContent(t *testing.T) {
	server, home, _ := newTransferTestServer(t)
	metadataDirectory := filepath.Join(home, "warehouse", "events", "metadata")
	if err := os.MkdirAll(metadataDirectory, 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(metadataDirectory, "version-hint.text"), []byte("2\n"))
	writeTestFile(t, filepath.Join(metadataDirectory, "v1.metadata.json"), []byte(`{"format-version":2,"table-uuid":"old"}`))
	writeTestFile(t, filepath.Join(metadataDirectory, "v2.metadata.json"), []byte(`{"format-version":2,"table-uuid":"events-table","location":"old-events-table","current-snapshot-id":42,"snapshots":[{"manifest-list":"old-events-table/metadata/snap-1.avro"},{"manifest-list":"old-events-table/metadata/snap-2.avro"}],"metadata-log":[{"metadata-file":"old-events-table/metadata/v1.metadata.json"}]}`))

	probe := getJSON[IcebergProbeResponse](t, server, "/api/storage/iceberg/probe?tunnel=personal&rootId=home&path=warehouse/events")
	if probe.Status != "supported" || probe.SourceURL == nil || probe.MetadataPath == nil || *probe.MetadataPath != "warehouse/events/metadata/v2.metadata.json" {
		t.Fatalf("unexpected Iceberg probe: %#v", probe)
	}
	if probe.FormatVersion == nil || *probe.FormatVersion != 2 || probe.TableUUID == nil || *probe.TableUUID != "events-table" || probe.SnapshotCount != 2 {
		t.Fatalf("unexpected Iceberg metadata summary: %#v", probe)
	}

	request := httptest.NewRequest(http.MethodGet, *probe.SourceURL, nil)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"table-uuid":"events-table"`) {
		t.Fatalf("unexpected Iceberg content status=%d body=%s", response.Code, response.Body.String())
	}

	rangeRequest := httptest.NewRequest(http.MethodGet, *probe.SourceURL, nil)
	rangeRequest.Header.Set("Range", "bytes=0-15")
	rangeResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(rangeResponse, rangeRequest)
	if rangeResponse.Code != http.StatusPartialContent || rangeResponse.Body.Len() != 16 {
		t.Fatalf("unexpected Iceberg range status=%d bytes=%d", rangeResponse.Code, rangeResponse.Body.Len())
	}
}

func TestIcebergProbeStatesAndConfinement(t *testing.T) {
	server, home, _ := newTransferTestServer(t)
	if err := os.MkdirAll(filepath.Join(home, "ordinary"), 0o755); err != nil {
		t.Fatal(err)
	}
	ordinary := getJSON[IcebergProbeResponse](t, server, "/api/storage/iceberg/probe?tunnel=personal&rootId=home&path=ordinary")
	if ordinary.Status != "not-detected" {
		t.Fatalf("ordinary folder detected as Iceberg: %#v", ordinary)
	}

	metadataDirectory := filepath.Join(home, "candidate", "metadata")
	if err := os.MkdirAll(metadataDirectory, 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(metadataDirectory, "v3.metadata.json"), []byte(`{"format-version":2,"table-uuid":"candidate"}`))
	candidate := getJSON[IcebergProbeResponse](t, server, "/api/storage/iceberg/probe?tunnel=personal&rootId=home&path=candidate")
	if candidate.Status != "candidate" || candidate.SourceURL == nil {
		t.Fatalf("unexpected candidate response: %#v", candidate)
	}

	writeTestFile(t, filepath.Join(home, "private.txt"), []byte("private"))
	escaping := strings.TrimSuffix(*candidate.SourceURL, "metadata/v3.metadata.json") + url.PathEscape("../private.txt")
	request := httptest.NewRequest(http.MethodGet, escaping, nil)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code >= 200 && response.Code < 300 {
		t.Fatalf("escaping Iceberg reference was served: %d %s", response.Code, response.Body.String())
	}

	malformedDirectory := filepath.Join(home, "malformed", "metadata")
	if err := os.MkdirAll(malformedDirectory, 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(malformedDirectory, "version-hint.text"), []byte("1"))
	writeTestFile(t, filepath.Join(malformedDirectory, "v1.metadata.json"), []byte(`not-json`))
	malformed := getJSON[IcebergProbeResponse](t, server, "/api/storage/iceberg/probe?tunnel=personal&rootId=home&path=malformed")
	if malformed.Status != "unsupported" {
		bytes, _ := json.Marshal(malformed)
		t.Fatalf("malformed metadata should be unsupported: %s", bytes)
	}
}

func TestIcebergProbeRejectsUnsafeMetadataReferences(t *testing.T) {
	server, home, _ := newTransferTestServer(t)
	tests := map[string]string{
		"escaping-location": `{"format-version":2,"location":"../outside"}`,
		"external-location": `{"format-version":2,"location":"https://example.test/table"}`,
		"credentialed":      `{"format-version":2,"location":"https://user:secret@example.test/table"}`,
		"absolute":          `{"format-version":2,"location":"/srv/private/table"}`,
		"escaping-manifest": `{"format-version":2,"location":"table","snapshots":[{"manifest-list":"../outside/snap.avro"}]}`,
	}
	for name, metadata := range tests {
		t.Run(name, func(t *testing.T) {
			metadataDirectory := filepath.Join(home, name, "metadata")
			if err := os.MkdirAll(metadataDirectory, 0o755); err != nil {
				t.Fatal(err)
			}
			writeTestFile(t, filepath.Join(metadataDirectory, "version-hint.text"), []byte("1"))
			writeTestFile(t, filepath.Join(metadataDirectory, "v1.metadata.json"), []byte(metadata))
			probe := getJSON[IcebergProbeResponse](t, server, "/api/storage/iceberg/probe?tunnel=personal&rootId=home&path="+url.QueryEscape(name))
			if probe.Status != "unsupported" || probe.SourceURL != nil {
				t.Fatalf("unsafe metadata should be unsupported: %#v", probe)
			}
		})
	}
}

func TestIcebergProbeScansPastFirstMetadataPage(t *testing.T) {
	server, home, _ := newTransferTestServer(t)
	metadataDirectory := filepath.Join(home, "paged", "metadata")
	if err := os.MkdirAll(metadataDirectory, 0o755); err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 510; index++ {
		writeTestFile(t, filepath.Join(metadataDirectory, fmt.Sprintf("artifact-%03d.bin", index)), []byte("fixture"))
	}
	writeTestFile(t, filepath.Join(metadataDirectory, "version-hint.text"), []byte("1"))
	writeTestFile(t, filepath.Join(metadataDirectory, "v1.metadata.json"), []byte(`{"format-version":2,"table-uuid":"paged-table"}`))

	probe := getJSON[IcebergProbeResponse](t, server, "/api/storage/iceberg/probe?tunnel=personal&rootId=home&path=paged")
	if probe.Status != "supported" || probe.TableUUID == nil || *probe.TableUUID != "paged-table" {
		t.Fatalf("unexpected paged probe: %#v", probe)
	}
}

func TestIcebergFacadeRejectsAbsoluteAndUnauthorizedReferences(t *testing.T) {
	server, home, _ := newTransferTestServer(t)
	metadataDirectory := filepath.Join(home, "table", "metadata")
	if err := os.MkdirAll(metadataDirectory, 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(metadataDirectory, "v1.metadata.json"), []byte(`{"format-version":2}`))
	probe := getJSON[IcebergProbeResponse](t, server, "/api/storage/iceberg/probe?tunnel=personal&rootId=home&path=table")
	if probe.SourceURL == nil {
		t.Fatalf("expected source URL: %#v", probe)
	}
	base := strings.TrimSuffix(*probe.SourceURL, "metadata/v1.metadata.json")
	for _, reference := range []string{"%2Fetc%2Fpasswd", "https:%2F%2Fexample.test%2Fdata.parquet", "%252e%252e%252fprivate.txt"} {
		request := httptest.NewRequest(http.MethodGet, base+reference, nil)
		response := httptest.NewRecorder()
		server.Handler().ServeHTTP(response, request)
		if response.Code >= 200 && response.Code < 300 {
			t.Fatalf("unsafe reference %q was served: %d %s", reference, response.Code, response.Body.String())
		}
	}

	request := httptest.NewRequest(http.MethodGet, strings.Replace(*probe.SourceURL, "/home/", "/missing-root/", 1), nil)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("unauthorized root status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestIcebergS3ReferenceValidation(t *testing.T) {
	root := storage.ResolvedStorageRoot{
		ProviderFamily: "s3",
		Target: storage.ObjectStoreRootTarget{
			Bucket: "warehouse",
			Prefix: "tenant-a",
		},
	}
	safe := icebergMetadataSummary{
		Location: "s3://warehouse/old/events",
		Snapshots: []icebergSnapshotReference{
			{ManifestList: "s3a://warehouse/old/events/metadata/snap-1.avro"},
		},
		MetadataLog: []icebergMetadataLogReference{
			{MetadataFile: "s3://warehouse/old/events/metadata/v1.metadata.json"},
		},
	}
	if err := validateIcebergMetadataReferences(safe, root); err != nil {
		t.Fatalf("safe moved S3 references were rejected: %v", err)
	}

	unsafe := []icebergMetadataSummary{
		{Location: "s3://foreign/old/events"},
		{Location: "s3://user:secret@warehouse/old/events"},
		{Location: "s3://warehouse/old/events", Snapshots: []icebergSnapshotReference{{ManifestList: "s3://warehouse/old/private/snap.avro"}}},
		{Location: "s3://warehouse/old/events", Snapshots: []icebergSnapshotReference{{ManifestList: "https://warehouse.example/old/events/snap.avro"}}},
	}
	for index, metadata := range unsafe {
		if err := validateIcebergMetadataReferences(metadata, root); err == nil {
			t.Fatalf("unsafe S3 metadata %d was accepted: %#v", index, metadata)
		}
	}
}
