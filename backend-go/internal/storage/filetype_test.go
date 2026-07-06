package storage

import "testing"

func TestClassifyJSONMIMETypesAsTextLike(t *testing.T) {
	tests := []struct {
		name     string
		fileName string
		mimeType string
		category string
		icon     string
	}{
		{name: "exact json without extension", fileName: "payload", mimeType: "application/json", category: "json", icon: "file-json"},
		{name: "json with parameters", fileName: "payload.json", mimeType: "application/json; charset=utf-8", category: "json", icon: "file-json"},
		{name: "structured json suffix", fileName: "problem", mimeType: "application/problem+json", category: "json", icon: "file-json"},
		{name: "ndjson", fileName: "events", mimeType: "application/x-ndjson", category: "json", icon: "file-json"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			classification := classify(test.fileName, &test.mimeType)
			if classification.category != test.category {
				t.Fatalf("category = %q, want %q", classification.category, test.category)
			}
			if classification.icon != test.icon {
				t.Fatalf("icon = %q, want %q", classification.icon, test.icon)
			}
			if !classification.textLike {
				t.Fatal("classification is not text-like")
			}
		})
	}
}

func TestClassifySVGAsImageText(t *testing.T) {
	mimeType := "image/svg+xml"
	classification := classify("vector", &mimeType)
	if classification.category != "image" {
		t.Fatalf("category = %q, want image", classification.category)
	}
	if classification.icon != "file-image" {
		t.Fatalf("icon = %q, want file-image", classification.icon)
	}
	if !classification.textLike {
		t.Fatal("classification is not text-like")
	}
}
