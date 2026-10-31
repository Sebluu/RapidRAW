# Effect Studio — creative GPU effects

Effect Studio is the dedicated creative-effects workspace in RapidRAW, separate from
**Adjustments → Effects**. It deliberately does not duplicate global effects such as
Lens Blur, LUTs, Glow or the standard Vignette. Existing Adjustments and the Color
Harmonizer remain editable and are not replaced.

## Branches

- **Module development:** `feature/prism-studio` (the original branch name remains).
- **Combined integration testing:** `test/harmonizer-and-curves`.
- **Production:** `main` is not modified by this work.

Transfer changes by targeted commits rather than replacing files from the integration
branch: it contains other developing features, particularly the Color Harmonizer and
targeted curves, including additional GPU data fields.

## Kaleidoscope v1

- One image-local, nondestructive Kaleidoscope effect; initially **hidden**.
- Explicit **Create** action, followed by independent **eye visibility** and **Remove**.
- Pattern modes: Radial, Mirror (horizontal/vertical/four-way/diagonal),
  mirrored grid, spiral and bounded recursive Fractal Kaleidoscope.
- Controls: segment count, grid density, recursive depth, twist, center X/Y,
  rotation, zoom, segment edge lens softness, edge vignette and edge width.
- Frontend `PrismStudioPanel` is code-split with `React.lazy` and loads only when
  the studio is opened. The heavier Kaleidoscope controls are separately code-split
  and mount only after an existing effect is expanded or explicitly created.
- Metadata is stored as `adjustments.effectStudio`, with a schema version, effect
  ID, visibility and normalized settings. Changes participate in existing history,
  metadata saving, and copy/paste.
- The Rust GPU adjustment converter reads visible effects. The WGSL compute shader
  specializes Kaleidoscope work behind `F_KALEIDOSCOPE = 8192`. Invisible or absent
  Kaleidoscope effects do not activate this feature.
- The same GPU image-processing route serves both previews and exports. The initial
  implementation remaps coordinates before the standard Adjustments shader, then
  adds segment-edge vignette after global color processing.

### Current limitations (intentional)

- This is a **first working effect**, not yet a freely orderable GPU effect stack.
  Although settings use an extensible container, v1 supports one Kaleidoscope item.
- Segment-specific full Adjustments, separately rendered Fractal Feedback, Prism
  & Light, configurable effect combinations, and independent overlay compositing
  are future work. Placeholder cards must not imply these modules already run.
- Lens softness currently uses an image-space five-tap sampling approximation
  near segment boundaries, not depth-map-driven lens bokeh.
- Interactive dragging of the image center and true downstream post-effect
  Adjustments passes are not in v1.
- Rust compilation alone does not validate WGSL on every GPU. Confirm behavior in
  the actual editor, especially at high resolution and when exporting.

## Validation

1. Run feature-branch frontend build and formatting checks.
2. Run integration-branch TypeScript, ESLint, frontend build, Rust formatter and
   `cargo check --locked` workflows.
3. Open a RAW, then Effect Studio; verify merely opening the tab performs no
   Kaleidoscope rendering. Click Create, open the controls and enable the eye.
4. Cycle each pattern and edit center/rotation/zoom/edge controls. Disable the eye
   and confirm normal editing returns without deleting settings.
5. Save and reopen the same image; check undo/redo, original comparison, export
   dimensions and the exported result.
6. Test both 8-bit and high-precision export settings, large resolutions, zoomed
   previews, masks, and the shared Color Harmonizer integration branch.
