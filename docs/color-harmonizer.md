# Color Harmonizer — RapidRAW experimental feature

Branch: `feature/color-harmonizer` (based on **main**; intentionally independent from `feature/targeted-curves`).

Status: **development prototype; compilation, color correctness, GPU render, and mask interaction must pass before upstream PR**.

## What it does

The Color Harmonizer offers palette-based hue attraction in a perceptual color space. It is a collapsible **Color → Color Harmonizer** subsection directly after Color Mixer, enabled by default through the existing eye/visibility control **but neutral (strength 0, saturation 1)**. The same React component and `colorHarmony` settings model are used for global adjustments and individual mask containers. Existing prototype edits with `colorHarmony.enabled` are migrated to the eye control when no explicit visibility flag exists.

The harmony preset selector uses a keyboard-accessible, portal-rendered popover so its menu stays legible and is not clipped by the nested collapsing panels. The interface has nine palette patterns plus a custom mode:

- Monochromatic (1 node)
- Analogous (3)
- Analogous + complementary (4)
- Complementary (2)
- Split complementary (3)
- Dyad (2)
- Triad (3)
- Tetrad (4)
- Square (4)
- Custom (2–4, independent nodes)

Nodes display directly on a private color wheel in the tool; not over the application's global vectorscope. Linked presets rotate as a group. Unlinking to Custom preserves actual node hues, allowing users to drag individual nodes independently, including non-complementary two-node palettes. Strength, pull width, low-chroma protection, and per-node saturation are user-controlled. Preset defaults are intentionally neutral (strength 0; node saturations 100%).

## Processing architecture

The TypeScript panel is reused unchanged in both the global adjustment panel and the mask panel, which supply different `adjustments` and `setAdjustments` props. `ColorHarmonySettings` are serialized with other nondestructive adjustments, and existing undo/redo/history and mask copy/paste machinery should therefore apply.

In Rust, `parse_color_harmony` validates and clamps parameters before writing a fixed-size 64-byte uniform-like block to the GPU adjustment buffer. The WGSL mirror uses the same layout and `F_COLOR_HARMONY` specialization prevents extra shader processing when no active harmonizer can alter pixels.

The WGSL processing function converts linear sRGB to OKLab, derives OKLCH hue/chroma, chooses the nearest harmony node using a Gaussian angular falloff, pulls hue toward that node, attenuates the effect on low-chroma pixels, applies the winning node's independent saturation multiplier, and converts back to linear sRGB. Global adjustments are applied after creative color and before color grading. Mask adjustments blend after global and mask color grading using the mask's existing influence texture.

There is **no full-resolution CPU color-conversion pass**. Only the open panel's hue-distribution preview is calculated by sampling up to roughly 65,000 pixels of the cached, geometry-corrected source preview (72 bins, chroma weighted). This analysis is intentionally decoupled from live GPU grading and is _not_ an exact post-adjustment histogram. Results are cached per image (48-entry bounded LRU) and only computed when the subsection is open, not on every drag or slider update.

The wheel pointer handler batches adjustment changes with `requestAnimationFrame`. It uses pointer capture for mouse/pen/touch drags and informs the existing interactive-render system via `onDragStateChange`.

## Relationship to darktable

Design, attraction principle, preset set and UI affordances studied from:

- https://github.com/darktable-org/darktable/blob/master/src/iop/colorharmonizer.c
- https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/color-harmonizer/

darktable's Color Harmonizer operates in **darktable UCS/JCH** and uses an **RYB hue conversion** for predefined harmony templates. RapidRAW currently uses **OKLab/OKLCH**, with template offsets expressed directly in OKLCH angular degrees. The perceptual color coordinates and resulting output cannot be pixel-identical. We do _not_ embed darktable's color-space conversion code or import the GPL-licensed C implementation. The algorithm was written for RapidRAW's GPU pipeline using publicly documented color science and the documented nearest-node Gaussian attraction principle. Preserve this acknowledgement in any upstream PR; review the licenses (darktable GPLv3, RapidRAW AGPLv3) if any direct port is considered.

darktable's optional **spatial smoothing** is **not implemented** in this first version: adding a second full-image GPU processing/blur path without performance measurements would violate the feature's zero-overhead-off requirement. Its neutral default behaviour is covered without that parameter.

## Test and review checklist

- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- [ ] `cargo check --locked --manifest-path src-tauri/Cargo.toml`
- [ ] `npm run build`; no new TypeScript/ESLint diagnostics relative to main
- [ ] Check the _runtime_ WGSL validator and 64-byte Rust/WGSL layout; `cargo check` alone does **not** validate shader execution
- [ ] Test each palette rule at multiple rotations and arbitrary 2/3/4 custom nodes, including hue wraparound at 0/360°
- [ ] Verify the default **enabled but neutral** state reproduces original pixels
- [ ] Test global operation and mask-specific operation, opacity/inversion, mask creation, delete, duplication, undo/redo, save/reopen, presets, copy/paste, 8-bit/16-bit export
- [ ] Test wide-gamut/RAW, AgX, scene/output LUT, saturation boost and gamut clipping, black and neutral pixels
- [ ] Confirm pointer capture and correct drag on touchscreens and at non-100% UI scaling
- [ ] Performance: high-resolution RAW & multiple masks; verify feature flag eliminates cost when off and identify pixel costs when enabled
- [ ] Verify histograms correctly sample source preview and handle early open/preview-not-ready
- [ ] Add translations in other shipped languages before submitting upstream

## Known limitations / follow-ups

- The internal source histogram is intentionally _not_ a live, pre-harmonizer after-other-edits vectorscope. Accurate stage-correct live scope needs a dedicated measured GPU/analytics pass (not yet implemented).
- Spatial correction smoothing, optional automatic best-harmony-rule search, and anchor eyedropper are omitted pending correctness/performance review.
- Tests on actual hardware, manual visual review, and export parity have not yet been completed.
- The _other branch_'s targeted-curve pipette uses global interaction state and still needs explicit mask scoping; it is **not** implicitly mask-aware simply because the curves component is shared.

## Upstream strategy

Keep this change independent of targeted curves. Merge or rebase from upstream main after validation, preserve developer-facing test evidence and benchmark numbers, and only then propose it as a PR. Avoid unverified claims such as 'darktable pixel parity' or 'zero performance cost under all conditions'.

## Histogram loading optimization (October 2026)

The cached-preview hue histogram is now evaluated only while **both** the
parent Color adjustment section and Color Harmonizer subsection are expanded.
Opening an image or switching between images when either section is closed
does not trigger hue sampling or its retry timers. Collapsing either section
invalidates pending JavaScript results. The GPU operation remains separate
from the sampling and uses the existing shader specialization; no new
per-frame histogram work was added.

## Lazy histogram activation (October 2026)

The Color Harmonizer subsection now starts **collapsed**, independent of
whether its parent Color section is open. Its actual expanded state is passed
through the existing shared `AdjustmentSubSection` component, not inferred
from a separate UI state approximation. The Rust hue-distribution sampling
runs only after the user explicitly expands the subsection while Color is
open. This does not affect the per-pixel GPU harmonization path. Expansion
is intentionally opt-in on each new panel mount to avoid unexpected analysis
on image selection.

## Per-image analysis cache

Hue distributions are computed once per source image **per running editing session**
when the Color Harmonizer subsection is first opened. Completed 72-bin
histograms are stored in a bounded, 48-image, least-recently-used in-memory
cache keyed by the selected image's path. Reopening the module or returning
to an image restores the original bins without another Rust sample. Requests
already running for the same image share a single Promise, including across
global and mask panels. Unsuccessful requests are never cached, so temporary
preview-not-ready errors can still be retried. Results from a previously
selected image cannot overwrite the newly selected image's UI.

The cache contains only derived histogram values (not image pixels), occupies
roughly 27 KiB for 48 × 72 JavaScript numbers, plus array and Map overhead, and
is discarded when RapidRAW restarts. An edited original file at the **same
path** is not automatically invalidated in this prototype; introduce an
explicit source revision/mtime key before supporting external file changes.

## Neutral thumbnail stability and cache bounds (October 2026)

- Fresh editors and masks have an **enabled** subsection eye with a neutral pull strength (0) and 1.0× node saturation, consistent with RapidRAW's other tools. Previously saved explicit visibility choices are preserved.
- Saving only visually neutral harmonizer values or eye state updates sidecar metadata **without regenerating the filmstrip thumbnail**. This avoids surprising brightness/decoding differences between initial embedded previews and processed thumbnails when the actual pixels do not change. The normal thumbnail refresh still runs whenever non-neutral harmonizer settings or any other visible adjustment changes.
- The source-color distribution uses a **48-image LRU**: a successful hit is moved to most-recent, and insertion evicts the least-recent. The separately tracked in-flight analyses are also capped at 48, with identity-checked completion so an evicted, late-resolving request cannot repopulate the cache unexpectedly. In-flight operations are not forcibly cancelled; their promises still settle for any original callers.
- This addresses unnecessary thumbnail regeneration rather than altering color-managed rendering. Visual verification across embedded RAW thumbnails, processed RAW previews, masks and exports is still required.

## Native slider styling and default visibility (October 2026)

All strength, width, neutral protection and per-node saturation controls now
use RapidRAW's shared `Slider` component, including numeric inputs, reset,
keyboard/drag interaction and matching typography. UI percent values are
converted to shader-compatible 0–1 (or 0–2) values, with width retained in
its existing units. New images default to enabled with zero strength; legacy
explicit off states remain off. The `getActiveTools` fallback also handles
panel contexts where only `activeTools` and `sectionVisibility` are supplied.
