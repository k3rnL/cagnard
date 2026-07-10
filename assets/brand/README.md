# Cagnard Brand Assets

The source artwork in `source/` was supplied by the project owner on 2026-07-10.

- `cagnard-filled-source.png` is the small-size application and favicon source.
- `cagnard-outlined-source.png` is the editorial and banner source.
- `cagnard-mark-transparent.png` is a background-extracted derivative for flexible documentation use.

Keep source artwork unchanged. Generate optimized frontend and documentation derivatives from these files rather than referencing the large source PNGs directly.

The transparent derivative was produced from a flat chroma-key intermediate with the maintained image-generation background-removal helper, then visually checked at source and favicon sizes. The README banner at `docs/assets/brand/cagnard-banner.png` combines the exact outlined source tile with a generated, text-free storage/network background. The product screenshot at `docs/assets/screenshots/storage-browser.png` was captured from the combined filesystem and MinIO demo using only generated example data.
