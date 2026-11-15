# Effect Studio

The creative-effects workspace is separate from Adjustments → Effects. It reuses
RapidRAW's sliders, picker, eye toggles, history and nondestructive metadata.
Controls load on demand. Opening the workspace does not enable an effect.

## Branches

- `feature/prism-studio`: original development before the v1.6.9 port.
- `feature/effect-studio-v1.6.9`: isolated Effect Studio port and fixes.
- `test/combined-v1.6.9`: current combined test with Color Harmonizer and Curves.
- `test/combined-v1.6.9-staging`: earlier combined port.
- `test/harmonizer-and-curves`: older integration, before v1.6.9.

The base is the latest published release, **v1.6.9** (`820d1440`), not the
unreleased upstream main. Main and the contribution PR branches stay separate.

## Effects

- **Kaleidoscope:** radial, mirrored grid, geometric mirrors (3–12 sides),
  horizontal/vertical/four-way/diagonal mirrors, spiral and bounded recursion.
  Source position is independent of the centered symmetry pivot. Mirror size,
  zoom, rotation, edge softness and colored edge vignette remain editable.
  Old triangle settings migrate to three-sided geometric mirrors.
- **Fractal Feedback:** 1–7 progressively scaled and rotated image echoes,
  with decay, strength and optional blur. These are transformed copies of the
  input to this stage, not previous frames of a temporal feedback simulation.
- **Prism & Light:** RGB dispersion or geometric refraction, direction,
  separation, strength and optional blur.
- **Local Normalize · Experimental:** a nine-sample neighborhood approximation
  that changes local luminance while retaining RGB ratios. It is not a port of
  G'MIC's `normalize_local`; compare its usefulness with Clarity and Structure.

One instance of each type is supported. Effects can be independently hidden,
removed and saved; their order is fixed rather than freely reorderable.

## Whole image or luminance window

New Feedback and Prism effects start with **Limit by luminance off** and 100%
strength. They replace their input with the transformed image. Lower strength
blends that result with the input to the stage.

Enable **Limit by luminance** to restrict either effect to its low/high range,
with feathering. Switching it off retains the window settings. Blur remains
available in both modes. A full 0–100% window includes scene-linear highlights
above 1.0. Luminance is evaluated on each stage's input RGB; nonlinear source
formats and linear RAW sources can produce different threshold behavior.

Saved effects without the new switch retain luminance masking and their saved
strength. Stacking at high strengths now differs intentionally: Prism processes
Feedback's result instead of replacing it with samples from the original photo.

## GPU pipeline and performance

**Local Normalize → Fractal Feedback → Prism → Kaleidoscope → standard Adjustments
(including Color Harmonizer)**.

The first three effects use separate half-float GPU passes through RapidRAW's
existing compute encoder and texture pool. Each pass samples the previous pass's
output. Sampling cost therefore adds across effects instead of multiplying.
Alpha is preserved. Pixel radii and prism separation scale with the shorter
image side (1080px reference), matching preview and export composition.

Only visible, nonzero effects run. Their pipelines are lazy and excluded from
startup warming. Disabled studio effects allocate no studio textures or guided
maps. A single cached result is keyed by source identity and effect uniforms;
ordinary adjustment changes reuse it. Guided and haze maps are rebuilt from the
processed source when the studio changes. Disabling all three clears the cached
entry. Active effects require intermediate GPU memory, especially for large
exports; the shared texture pool retains memory under its existing limits.

Kaleidoscope remains specialized in the main shader. It remaps the processed
source before standard Adjustments; source-space masks and neighborhood tools
are not separate post-kaleidoscope image passes.

## Validation

Run the combined workflow for build, regression checks, state persistence,
Rust compilation, WGSL validation and GPU behavior tests. See
[development-testing.md](development-testing.md) for reproducible local tests.

Manual review still needs the real editor: toggles, each geometry mode, undo/redo,
image switches, saved sidecars, masks, original comparison, zoomed preview and
8/16-bit exports. Pay particular attention to high-resolution RAWs on Intel Iris
Xe and to compositions with multiple enabled effects.
