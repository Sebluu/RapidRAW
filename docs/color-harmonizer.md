# Color Harmonizer — RapidRAW experimental feature

Branch: `feature/color-harmonizer` (based on **main**; intentionally independent from `feature/targeted-curves`).

Status: **development prototype; compilation, color correctness, GPU render, and mask interaction must pass before upstream PR**.

## What it does

The Color Harmonizer offers palette-based hue attraction in a perceptual color space. It is a separate collapsible editing section, disabled by default, with the same React component and `colorHarmony` settings model for global adjustments and individual mask containers.

The interface has nine palette patterns plus a custom mode:
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

There is **no full-resolution CPU color-conversion pass**. Only the open panel's hue-distribution preview is calculated by sampling up to roughly 65,000 pixels of the cached, geometry-corrected source preview (72 bins, chroma weighted). This analysis is intentionally decoupled from live GPU grading and is *not* an exact post-adjustment histogram. It is recomputed on opening another image, not on every drag or slider update.

The wheel pointer handler batches adjustment changes with `requestAnimationFrame`. It uses pointer capture for mouse/pen/touch drags and informs the existing interactive-render system via `onDragStateChange`.

## Relationship to darktable

Design, attraction principle, preset set and UI affordances studied from:
- https://github.com/darktable-org/darktable/blob/master/src/iop/colorharmonizer.c
- https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/color-harmonizer/

darktable's Color Harmonizer operates in **darktable UCS/JCH** and uses an **RYB hue conversion** for predefined harmony templates. RapidRAW currently uses **OKLab/OKLCH**, with template offsets expressed directly in OKLCH angular degrees. The perceptual color coordinates and resulting output cannot be pixel-identical. We do *not* embed darktable's color-space conversion code or import the GPL-licensed C implementation. The algorithm was written for RapidRAW's GPU pipeline using publicly documented color science and the documented nearest-node Gaussian attraction principle. Preserve this acknowledgement in any upstream PR; review the licenses (darktable GPLv3, RapidRAW AGPLv3) if any direct port is considered.

darktable's optional **spatial smoothing** is **not implemented** in this first version: adding a second full-image GPU processing/blur path without performance measurements would violate the feature's zero-overhead-off requirement. Its neutral default behaviour is covered without that parameter.

## Test and review checklist

- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- [ ] `cargo check --locked --manifest-path src-tauri/Cargo.toml`
- [ ] `npm run build`; no new TypeScript/ESLint diagnostics relative to main
- [ ] Check the *runtime* WGSL validator and 64-byte Rust/WGSL layout; `cargo check` alone does **not** validate shader execution
- [ ] Test each palette rule at multiple rotations and arbitrary 2/3/4 custom nodes, including hue wraparound at 0/360°
- [ ] Verify the default disabled + strength-zero state reproduces original pixels
- [ ] Test global operation and mask-specific operation, opacity/inversion, mask creation, delete, duplication, undo/redo, save/reopen, presets, copy/paste, 8-bit/16-bit export
- [ ] Test wide-gamut/RAW, AgX, scene/output LUT, saturation boost and gamut clipping, black and neutral pixels
- [ ] Confirm pointer capture and correct drag on touchscreens and at non-100% UI scaling
- [ ] Performance: high-resolution RAW & multiple masks; verify feature flag eliminates cost when off and identify pixel costs when enabled
- [ ] Verify histograms correctly sample source preview and handle early open/preview-not-ready
- [ ] Add translations in other shipped languages before submitting upstream

## Known limitations / follow-ups

- The internal source histogram is intentionally *not* a live, pre-harmonizer after-other-edits vectorscope. Accurate stage-correct live scope needs a dedicated measured GPU/analytics pass (not yet implemented).
- Spatial correction smoothing, optional automatic best-harmony-rule search, and anchor eyedropper are omitted pending correctness/performance review.
- Tests on actual hardware, manual visual review, and export parity have not yet been completed.
- The *other branch*'s targeted-curve pipette uses global interaction state and still needs explicit mask scoping; it is **not** implicitly mask-aware simply because the curves component is shared.

## Upstream strategy

Keep this change independent of targeted curves. Merge or rebase from upstream main after validation, preserve developer-facing test evidence and benchmark numbers, and only then propose it as a PR. Avoid unverified claims such as 'darktable pixel parity' or 'zero performance cost under all conditions'.
