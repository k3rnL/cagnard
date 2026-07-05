# improve-large-files-copy

Improve Cagnard's copy and move pipeline for large files and directory transfers. The change must replace bounded buffered cross-provider transfers with streaming-capable provider-neutral transfer flows, introduce durable job/task tracking for copy and move operations, and define correct failure handling for partial copies, retries, cancellation, cleanup, and user-facing diagnostics.
