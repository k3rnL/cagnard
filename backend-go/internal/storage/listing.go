package storage

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	ListAccuracyExact       = "exact"
	ListAccuracyUnknown     = "unknown"
	ListAccuracyUnsupported = "unsupported"

	DefaultListSortKey       = "name"
	DefaultListSortDirection = "asc"
)

func ExactListAccuracy(totalKnown bool) ListAccuracy {
	total := ListAccuracyUnknown
	if totalKnown {
		total = ListAccuracyExact
	}
	return ListAccuracy{Search: ListAccuracyExact, Sort: ListAccuracyExact, Total: total}
}

func FilterSortAndSliceEntries(entries []StorageEntry, options ListOptions) (ListPage, error) {
	filtered := FilterEntries(entries, options.Query)
	SortEntries(filtered, options.SortKey, options.SortDirection)
	start, err := OffsetCursor(options.Cursor)
	if err != nil {
		return ListPage{}, err
	}
	if start > len(filtered) {
		start = len(filtered)
	}
	pageSize := options.PageSize
	if pageSize <= 0 {
		pageSize = len(filtered)
	}
	end := start + pageSize
	if end > len(filtered) {
		end = len(filtered)
	}
	pageEntries := append([]StorageEntry{}, filtered[start:end]...)
	var next *string
	if end < len(filtered) {
		value := strconv.Itoa(end)
		next = &value
	}
	total := len(entries)
	filteredCount := len(filtered)
	return ListPage{
		Entries:       pageEntries,
		NextCursor:    next,
		TotalCount:    &total,
		FilteredCount: &filteredCount,
		Accuracy:      ExactListAccuracy(true),
	}, nil
}

func OffsetCursor(cursor *string) (int, error) {
	if cursor == nil || strings.TrimSpace(*cursor) == "" {
		return 0, nil
	}
	value, err := strconv.Atoi(strings.TrimSpace(*cursor))
	if err != nil || value < 0 {
		return 0, fmt.Errorf("Invalid page cursor")
	}
	return value, nil
}

func FilterEntries(entries []StorageEntry, query string) []StorageEntry {
	terms := strings.Fields(strings.ToLower(strings.TrimSpace(query)))
	if len(terms) == 0 {
		return append([]StorageEntry{}, entries...)
	}
	out := make([]StorageEntry, 0, len(entries))
	for _, entry := range entries {
		haystack := entrySearchHaystack(entry)
		matches := true
		for _, term := range terms {
			if !strings.Contains(haystack, term) {
				matches = false
				break
			}
		}
		if matches {
			out = append(out, entry)
		}
	}
	return out
}

func SortEntries(entries []StorageEntry, sortKey string, direction string) {
	key := normalizedSortKey(sortKey)
	desc := strings.EqualFold(direction, "desc")
	sort.SliceStable(entries, func(i, j int) bool {
		left := entries[i]
		right := entries[j]
		missingComparison := compareMissing(left, right, key)
		if missingComparison != 0 {
			return missingComparison < 0
		}
		fieldComparison := compareByField(left, right, key)
		if fieldComparison != 0 {
			if desc {
				return fieldComparison > 0
			}
			return fieldComparison < 0
		}
		return compareText(left.Name, right.Name) < 0
	})
}

func normalizedSortKey(sortKey string) string {
	switch strings.TrimSpace(sortKey) {
	case "kind", "type", "size", "modifiedTime", "mimeType", "fileCategory":
		return strings.TrimSpace(sortKey)
	default:
		return DefaultListSortKey
	}
}

func entrySearchHaystack(entry StorageEntry) string {
	values := []string{
		entry.Name,
		entry.Path,
		entry.Kind,
		ptrValue(entry.Metadata.MIMEType),
		ptrValue(entry.Metadata.FileCategory),
		ptrValue(entry.Metadata.FileIcon),
		ptrValue(entry.Metadata.Owner),
		ptrValue(entry.Metadata.Permissions),
		ptrValue(entry.Metadata.ModifiedTime),
		ptrValue(entry.Metadata.Version),
		ptrValue(entry.Metadata.Retention),
		ptrValue(entry.Metadata.Encryption),
	}
	for _, capability := range entry.Capabilities {
		values = append(values, capability.Name, capability.Status, ptrValue(capability.Description))
	}
	for _, value := range entry.ProviderSpecific {
		values = append(values, value)
	}
	return strings.ToLower(strings.Join(values, " "))
}

func compareMissing(left StorageEntry, right StorageEntry, field string) int {
	leftMissing := missingValue(left, field)
	rightMissing := missingValue(right, field)
	if leftMissing == rightMissing {
		return 0
	}
	if leftMissing {
		return 1
	}
	return -1
}

func missingValue(entry StorageEntry, field string) bool {
	switch field {
	case "size":
		return entry.Metadata.Size == nil
	case "modifiedTime":
		return ptrValue(entry.Metadata.ModifiedTime) == ""
	case "mimeType":
		return ptrValue(entry.Metadata.MIMEType) == ""
	case "fileCategory", "type":
		return ptrValue(entry.Metadata.FileCategory) == ""
	default:
		return false
	}
}

func compareByField(left StorageEntry, right StorageEntry, field string) int {
	switch field {
	case "kind":
		return compareText(left.Kind, right.Kind)
	case "size":
		return compareInt64Ptr(left.Metadata.Size, right.Metadata.Size)
	case "modifiedTime":
		return compareTimeString(ptrValue(left.Metadata.ModifiedTime), ptrValue(right.Metadata.ModifiedTime))
	case "mimeType":
		return compareText(ptrValue(left.Metadata.MIMEType), ptrValue(right.Metadata.MIMEType))
	case "fileCategory", "type":
		return compareText(ptrValue(left.Metadata.FileCategory), ptrValue(right.Metadata.FileCategory))
	case "name":
		fallthrough
	default:
		return compareText(left.Name, right.Name)
	}
}

func compareText(left string, right string) int {
	return strings.Compare(strings.ToLower(left), strings.ToLower(right))
}

func compareInt64Ptr(left *int64, right *int64) int {
	if left == nil && right == nil {
		return 0
	}
	if left == nil {
		return -1
	}
	if right == nil {
		return 1
	}
	switch {
	case *left < *right:
		return -1
	case *left > *right:
		return 1
	default:
		return 0
	}
}

func compareTimeString(left string, right string) int {
	leftTime, leftErr := time.Parse(time.RFC3339Nano, left)
	rightTime, rightErr := time.Parse(time.RFC3339Nano, right)
	if leftErr == nil && rightErr == nil {
		switch {
		case leftTime.Before(rightTime):
			return -1
		case leftTime.After(rightTime):
			return 1
		default:
			return 0
		}
	}
	return compareText(left, right)
}

func ptrValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
