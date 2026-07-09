package storage

const (
	WatchEventAppended = "appended"
	WatchEventReplaced = "replaced"
	WatchEventRemoved  = "removed"
)

type FileWatchEvent struct {
	Kind   string
	Offset int64
	Length int64
}

// watchState tracks the last observed file state and turns stat observations
// into watch events shared by every provider implementation.
type watchState struct {
	exists bool
	size   int64
	marker string
}

func newWatchState(size int64, marker string) watchState {
	return watchState{exists: true, size: size, marker: marker}
}

func (s *watchState) observeMissing() *FileWatchEvent {
	if !s.exists {
		return nil
	}
	s.exists = false
	s.size = 0
	s.marker = ""
	return &FileWatchEvent{Kind: WatchEventRemoved}
}

// observe compares the newly observed size and change marker (modification
// time, ETag, …) with the previous state. Content that grew with an otherwise
// consistent identity is an append; anything else that changed is a replace.
func (s *watchState) observe(size int64, marker string) *FileWatchEvent {
	if !s.exists {
		s.exists = true
		s.size = size
		s.marker = marker
		return &FileWatchEvent{Kind: WatchEventReplaced}
	}
	previousSize := s.size
	changed := marker != s.marker || size != s.size
	if !changed {
		return nil
	}
	s.size = size
	s.marker = marker
	if size > previousSize {
		return &FileWatchEvent{Kind: WatchEventAppended, Offset: previousSize, Length: size - previousSize}
	}
	return &FileWatchEvent{Kind: WatchEventReplaced}
}
