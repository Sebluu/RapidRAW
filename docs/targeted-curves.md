# Targeted Curve Adjustment — implementation notes (prototype)

Status: **experimental, not yet build-verified or PR-ready**. Implementation lives only on `feature/targeted-curves`, not `main`.

## Goal

Provide a Lightroom-like targeted curve picker: select Luma/R/G/B in the Curves panel, activate the pipette, click on the photo, and drag vertically to move the tone on the selected curve. The rest of the image is affected according to the existing curve interpolation; this is **not** a local mask.

## Approach

- React/Zustand state stores the active channel and the selected sampled tone. This transient state is not serialized with photo edits.
- The existing Konva image canvas supplies display-to-source UV mapping, respecting current crop/transform mappings.
- A new `sample_curve_tone` Tauri command validates the image identity and geometry cache, then renders a one-pixel region of interest using the **existing GPU pipeline**.
- Shader `curve_sample_mode` exits immediately before global curves. RGB channel sampling includes the global Luma curve, because the channel-specific curves execute after Luma. The Luma sample uses pre-Luma RGB weighted by (0.2126, 0.7152, 0.0722).
- No separate CPU copy of the grading pipeline and no full-frame GPU readback. Standard rendering has `curve_sample_mode = 0`.
- Changes are placed on a feature branch to make upstream sync and isolated review easier.

## Review/test checklist

- [ ] Rust `cargo check` and `cargo test` on supported desktop target.
- [ ] Frontend `npm run build`, ESLint, formatting.
- [ ] Verify sRGB, RAW, AgX, clipping, colored channels, negative conversion and scene/display LUTs.
- [ ] Test geometry: crop, rotation, flips, perspective, zoom, WGPU/CPU preview paths.
- [ ] Test click-to-point, drag while sampling is pending, release, cancellation on image change and undo/redo.
- [ ] Check that modifications are grouped sensibly in edit history and are not excessively re-rendered.
- [ ] Assess performance with high-resolution RAW files; check shader layout alignment and GPU readback on all supported platforms.
- [ ] Add localization keys and accessibility improvements before proposing upstream.

## Known prototype limitations

The active UI is currently mouse-oriented; sampled response latency can make immediate click-drag interaction inconsistent. The baseline and gesture lifecycle require end-to-end testing. The tiny ROI render still invokes the general GPU processing path (including auxiliary texture handling), so *one-pixel readback* does not imply constant-time sampling. Curve points may be inserted even if users release the click before the async response, intentionally allowing click-only picking. Existing point hit proximity and endpoint handling require testing.

Potential follow-up: dedicated pre-curve sample compute kernel reading cached intermediate textures, or a cached pre-curve preview if performance warrants it. This should be justified by benchmarks rather than introduced preemptively.

## Upstream PR scope

Keep this feature separate from Color Harmonizer. Before a PR, squash commits after tests, attach before/after GIF, benchmark data, and screenshots. No claim of production readiness until builds and manual editor interaction pass.
