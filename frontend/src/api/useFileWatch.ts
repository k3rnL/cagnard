import { useEffect, useRef } from "react";

export interface FileWatchAppendedEvent {
  offset: number;
  length: number;
}

export interface FileWatchHandlers {
  onAppended?: (event: FileWatchAppendedEvent) => void;
  onReplaced?: () => void;
  onRemoved?: () => void;
}

// Subscribes to the generic per-file change stream (SSE). Independent of the
// transfer-job polling mechanism: any consumer that cares about one file's
// content changing can use this hook.
export function useFileWatch(
  enabled: boolean,
  root: { tunnel: string; id: string } | undefined,
  path: string | undefined,
  handlers: FileWatchHandlers
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled || !root || path === undefined) return;
    const params = new URLSearchParams({ tunnel: root.tunnel, rootId: root.id, path });
    const source = new EventSource(`/api/storage/watch?${params}`);
    source.addEventListener("appended", (event) => {
      try {
        handlersRef.current.onAppended?.(JSON.parse((event as MessageEvent<string>).data) as FileWatchAppendedEvent);
      } catch {
        // Malformed event payloads are dropped; the next event resynchronizes.
      }
    });
    source.addEventListener("replaced", () => handlersRef.current.onReplaced?.());
    source.addEventListener("removed", () => handlersRef.current.onRemoved?.());
    return () => source.close();
  }, [enabled, root?.tunnel, root?.id, path]);
}
