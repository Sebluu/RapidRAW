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
  mirrored grid, Geometric Mirrors with 3–12 sides, spiral and bounded recursive Fractal Kaleidoscope.
- Geometric Mirrors provides sides (3–12) and mirror size (0.25–8), independent of image zoom. Triangles, squares and hexagons can repeat regularly, while other side counts form repeated polygonal rosettes rather than gapless regular-polygon tilings.
- Saved `triangle` effects migrate to Geometric Mirrors with 3 sides; previous tile density is mapped to the size setting.
- Controls: segment count, grid density, recursive depth, twist, center X/Y,
  rotation, zoom, segment edge lens softness, edge vignette color and edge width.
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
- The symmetry pivot stays fixed at the output image center. The optional Source X/Y controls shift the sampled photo content independently, and grid rotation is applied in image space.
- Controls reuse RapidRAW's standard sliders (including reset behavior) and the accessible picker shared with Color Harmonizer. The source-position section is collapsed by default.
- Interactive dragging of the image center and true downstream post-effect
  Adjustments passes are not in v1.
- Rust compilation alone does not validate WGSL on every GPU. Confirm behavior in
  the actual editor, especially at high resolution and when exporting.

## Creative effects — experimental v2

Four independent effect types can be created, toggled, edited, removed and saved
per image. Controls are loaded on demand; the compiled GPU shader skips disabled
effect branches via specialization flags.

The current render order is **Local Normalize → Fractal Feedback → Prism →
Kaleidoscope**. All three creative effects sample the source image, and the
Kaleidoscope remaps the source coordinates before their calculation so the
effects remain independently visible when Kaleidoscope is disabled. This is a
fixed pipeline rather than a reorderable multi-pass graph.

- **Fractal Feedback** repeats progressively transformed and rotated samples
  of the source photo (1–7 echoes, scaling, rotation, opacity and decay).
- **Prism & Light** offers dispersion and geometric refraction, with adjustable
  channel separation, direction and strength.
- Both have an independently editable luminance window, feathering and optional
  overlay blur. Luminance is evaluated on the source RGB; nonlinear RGB sources
  can produce different threshold behavior from linear RAW sources.
- **Local Normalize · Experimental** computes a 3×3 neighborhood average and
  standard deviation using nine clamped source samples, adjusting local luma while
  retaining RGB ratios. The algorithm is an approximation for experimentation,
  **not a port of G’MIC's `normalize_local`**. Compare its visual effects with
  RapidRAW's existing Clarity and Structure before considering an upstream PR.
- Pixel-based radii and prism separation scale relative to the shorter image side (1080px reference) to keep preview and export composition comparable.
- Softness and local normalization deliberately increase texture reads. Test
  interactive performance on high-resolution RAWs and the Intel Iris Xe GPU.

Current limitations: feedback samples transformed copies of the *original*
input rather than prior rendered output frames, so this is recursively scaled
echo compositing, not a full multipass feedback graph. Prism does not refract
each generated feedback echo independently; the two source-based effects are
blended in the fixed order above.

## Validation

1. Run feature-branch frontend build and formatting checks.
2. Run integration-branch TypeScript, ESLint, frontend build, Rust formatter and
   `cargo check --locked` workflows.
3. Open a RAW, then Effect Studio; verify merely opening the tab performs no
   Kaleidoscope rendering. Click Create, open the controls and enable the eye.
4. Cycle each pattern, including triangular tessellation, and edit source framing, rotation, zoom and edge controls. The pattern center must stay fixed when Source X/Y changes. Disable the eye
   and confirm normal editing returns without deleting settings.
5. Verify the grid rotates, each slider resets by double-click, the edge tint can be white or colored, and dropdowns use the Color Harmonizer style.
6. Save and reopen the same image; check undo/redo, original comparison, export
   dimensions and the exported result.
7. Test both 8-bit and high-precision export settings, large resolutions, zoomed
   previews, masks, and the shared Color Harmonizer integration branch.
