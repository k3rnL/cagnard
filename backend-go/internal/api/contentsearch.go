package api

import (
	"bufio"
	"io"
	"net/http"
	"regexp"
	"strings"

	"github.com/k3rnl/cagnard/backend-go/internal/storage"
)

const contentSearchDefaultMaxMatches = 100
const contentSearchMaxMatches = 500
const contentSearchScanBudgetBytes = 8 * 1024 * 1024
const contentSearchLineBufferBytes = 256 * 1024
const contentSearchMatchTextLimit = 400

func (s *Server) contentSearch(w http.ResponseWriter, r *http.Request) {
	root, provider, ok := s.providerForRequest(w, r, queryValue(r, "tunnel"), queryValue(r, "rootId"), false)
	if !ok {
		return
	}
	query := queryValue(r, "query")
	if strings.TrimSpace(query) == "" {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "invalid_request", Message: "Search query cannot be empty"})
		return
	}
	matcher, err := lineMatcherFor(query, queryBool(r, "regex"), queryBool(r, "caseSensitive"))
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "invalid_search_pattern", Message: err.Error()})
		return
	}
	path := queryValue(r, "path")
	info, err := provider.ContentInfo(root, path)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "storage_search_failed", Message: err.Error()})
		return
	}
	if !storage.IsTextLike(info.FileName, info.MIMEType) {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "storage_search_failed", Message: "File type is not supported for content search"})
		return
	}

	maxMatches := contentSearchDefaultMaxMatches
	if requested := queryInt64(r, "maxMatches"); requested > 0 {
		maxMatches = int(min(requested, contentSearchMaxMatches))
	}
	fromOffset := queryInt64(r, "fromOffset")
	fromLine := queryInt64(r, "fromLine")
	if fromLine <= 0 {
		fromLine = 1
	}

	size := int64(0)
	if info.Size != nil {
		size = *info.Size
	}
	response := ContentSearchResponse{Path: path, Matches: []ContentSearchMatch{}, NextOffset: fromOffset, NextLine: fromLine}
	if size == 0 || fromOffset >= size {
		writeJSON(w, http.StatusOK, response)
		return
	}

	reader, _, err := provider.RangeRead(root, path, fromOffset, -1)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "storage_search_failed", Message: err.Error()})
		return
	}
	defer reader.Close()

	scanLinesForMatches(reader, matcher, maxMatches, &response)
	writeJSON(w, http.StatusOK, response)
}

func scanLinesForMatches(input io.Reader, matcher func(string) bool, maxMatches int, response *ContentSearchResponse) {
	reader := bufio.NewReaderSize(input, contentSearchLineBufferBytes)
	offset := response.NextOffset
	line := response.NextLine
	scanned := int64(0)
	for {
		text, lineLen, err := readLine(reader)
		if lineLen == 0 && err != nil {
			return
		}
		if matcher(text) {
			response.Matches = append(response.Matches, ContentSearchMatch{
				Line:   line,
				Offset: offset,
				Text:   truncateMatchText(text),
			})
		}
		offset += lineLen
		line++
		scanned += lineLen
		response.NextOffset = offset
		response.NextLine = line
		if err != nil {
			return
		}
		if len(response.Matches) >= maxMatches || scanned >= contentSearchScanBudgetBytes {
			response.More = true
			return
		}
	}
}

// readLine returns one line (without its terminator), the total byte length
// consumed including the terminator, and a non-nil error at end of input.
// Lines longer than the reader buffer are consumed fully but matched against
// their leading buffered portion only.
func readLine(reader *bufio.Reader) (string, int64, error) {
	chunk, err := reader.ReadSlice('\n')
	text := string(chunk)
	length := int64(len(chunk))
	for err == bufio.ErrBufferFull {
		var more []byte
		more, err = reader.ReadSlice('\n')
		length += int64(len(more))
	}
	return strings.TrimRight(text, "\r\n"), length, err
}

func lineMatcherFor(query string, useRegex bool, caseSensitive bool) (func(string) bool, error) {
	if useRegex {
		pattern := query
		if !caseSensitive {
			pattern = "(?i)" + pattern
		}
		expression, err := regexp.Compile(pattern)
		if err != nil {
			return nil, err
		}
		return expression.MatchString, nil
	}
	if caseSensitive {
		return func(line string) bool { return strings.Contains(line, query) }, nil
	}
	lowered := strings.ToLower(query)
	return func(line string) bool { return strings.Contains(strings.ToLower(line), lowered) }, nil
}

func truncateMatchText(text string) string {
	if len(text) <= contentSearchMatchTextLimit {
		return text
	}
	return strings.ToValidUTF8(text[:contentSearchMatchTextLimit], "") + "…"
}
