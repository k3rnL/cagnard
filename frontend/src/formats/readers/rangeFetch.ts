import { StructuredReaderError } from "./shared";

export interface ByteRangeResponse {
  bytes: Uint8Array;
  start: number;
  end: number;
  total?: number;
  partial: boolean;
}

export async function fetchByteRange(
  url: string,
  start: number,
  length: number,
  signal: AbortSignal
): Promise<ByteRangeResponse> {
  signal.throwIfAborted();
  const requestedEnd = start + Math.max(1, length) - 1;
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Range: `bytes=${start}-${requestedEnd}` },
    signal
  });
  if (response.status === 401 || response.status === 403) {
    throw new StructuredReaderError("authorization", "Access to this file was denied.");
  }
  if (response.status === 416) return { bytes: new Uint8Array(), start, end: start - 1, partial: true };
  if (!response.ok) {
    throw new StructuredReaderError("network", `Storage returned HTTP ${response.status}.`, { retryable: true });
  }
  if (start > 0 && response.status !== 206) {
    throw new StructuredReaderError(
      "range-unavailable",
      "This storage endpoint does not support the byte ranges required by this viewer."
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentRange = parseContentRange(response.headers.get("Content-Range"));
  const actualStart = contentRange?.start ?? 0;
  return {
    bytes,
    start: actualStart,
    end: contentRange?.end ?? actualStart + bytes.byteLength - 1,
    total: contentRange?.total ?? parseOptionalNumber(response.headers.get("Content-Length")),
    partial: response.status === 206
  };
}

export async function fetchBoundedFile(
  url: string,
  declaredSize: number | undefined,
  maxBytes: number,
  signal: AbortSignal
): Promise<Uint8Array> {
  signal.throwIfAborted();
  if (declaredSize !== undefined && declaredSize > maxBytes) {
    throw new StructuredReaderError("limit", `This format is buffered in the browser and is limited to ${formatBytes(maxBytes)}.`);
  }
  const response = await fetch(url, { credentials: "same-origin", signal });
  if (response.status === 401 || response.status === 403) {
    throw new StructuredReaderError("authorization", "Access to this file was denied.");
  }
  if (!response.ok) throw new StructuredReaderError("network", `Storage returned HTTP ${response.status}.`, { retryable: true });
  const contentLength = parseOptionalNumber(response.headers.get("Content-Length"));
  if (contentLength !== undefined && contentLength > maxBytes) {
    throw new StructuredReaderError("limit", `This format is buffered in the browser and is limited to ${formatBytes(maxBytes)}.`);
  }
  const bytes = await readBoundedBody(response, maxBytes, signal);
  if (bytes.byteLength > maxBytes) {
    throw new StructuredReaderError("limit", `This format is buffered in the browser and is limited to ${formatBytes(maxBytes)}.`);
  }
  return bytes;
}

async function readBoundedBody(response: Response, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => void reader.cancel(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new StructuredReaderError("limit", `This format is buffered in the browser and is limited to ${formatBytes(maxBytes)}.`);
      }
      chunks.push(result.value);
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseContentRange(value: string | null): { start: number; end: number; total?: number } | undefined {
  const match = value?.match(/^bytes (\d+)-(\d+)\/(\d+|\*)$/i);
  if (!match) return undefined;
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    total: match[3] === "*" ? undefined : Number(match[3])
  };
}

function parseOptionalNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}
