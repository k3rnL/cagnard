package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const watchKeepaliveInterval = 20 * time.Second

type watchEventPayload struct {
	Offset int64 `json:"offset,omitempty"`
	Length int64 `json:"length,omitempty"`
}

func (s *Server) watchStorage(w http.ResponseWriter, r *http.Request) {
	root, provider, ok := s.providerForRequest(w, r, queryValue(r, "tunnel"), queryValue(r, "rootId"), false)
	if !ok {
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeAPIError(w, http.StatusInternalServerError, APIError{Code: "streaming_unsupported", Message: "Streaming responses are not supported"})
		return
	}
	events, err := provider.Watch(root, queryValue(r, "path"), r.Context().Done())
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, APIError{Code: "storage_watch_failed", Message: err.Error()})
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	keepalive := time.NewTicker(watchKeepaliveInterval)
	defer keepalive.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			payload, err := json.Marshal(watchEventPayload{Offset: event.Offset, Length: event.Length})
			if err != nil {
				continue
			}
			if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Kind, payload); err != nil {
				return
			}
			flusher.Flush()
		case <-keepalive.C:
			if _, err := fmt.Fprint(w, ": keepalive\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
