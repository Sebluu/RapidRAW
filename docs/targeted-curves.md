# Targeted Curves eyedropper

A proposed addition to RapidRAW's **global Curves** adjustment.

## Why this is useful

Finding the right place on a tone curve is easier when you can point at the
actual subject rather than guess its position on a graph. This tool connects
the two: sample a tone directly from the photograph, then drag to adjust its
curve. It is particularly useful for balancing skies, shadows, skin tones and
individual RGB channels without repeatedly switching between the photo and
the curve graph.

The tool **changes the normal, global tone curve**, not a local painted mask.

## How to use it

1. Open **Curves**, choose **Luma**, **Red**, **Green** or **Blue**, and activate
   the eyedropper button.
2. Hover over the image to see the circular magnifier.
3. Press the left mouse button on the tone you want to adjust, **hold it and
   drag up or down**, then release. Only the movement while pressed changes
   the curve; a simple click without dragging does not.
4. Repeat elsewhere in the photo. The eyedropper stays active until you turn
   it off or select another control. The same gesture also works in the
   parametric curve view, where it changes the corresponding tonal region.

Panning and click-to-zoom are suspended while the picker is armed so that
curve adjustments do not accidentally move the photo.

## Implementation, for reviewers

- A temporary picker state in the React/Zustand editor identifies the channel
  and active pointer gesture; it is not stored in image metadata.
- A Tauri command, `sample_curve_tone`, samples a small region through
  RapidRAW's existing GPU processing path **before the selected curve stage**.
  The shader has an explicit sampling mode; normal rendering remains
  unchanged when the picker is idle.
- Image-space coordinates use the existing crop/orientation/transform mapping.
  For RGB channel curves, sampling includes the earlier Luma curve.
- The sampled tonal value is mapped to an existing curve point or inserted
  into the normal point-curve representation. Parametric mode adjusts its
  existing shadows/darks/lights/highlights parameter and curve together.
- Vertical movement uses `requestAnimationFrame` coalescing to avoid sending
  every raw pointer event through the adjustment system. Late asynchronous
  responses are discarded after the gesture ends or the image changes.
- The DOM photo surface owns pointer capture from press through release,
  including `pointercancel` and lost capture, rather than mixing the new
  gesture with Konva's legacy event lifecycle.
- The eyedropper cursor and small magnifier appear only for this tool.
  The magnifier draws a 104×104-pixel crop from a decoded, cached preview;
  it does **not** mount a full-image overlay or read the GPU on every hover.

### Scope and limitations

**The magnifier is the principal known visual limitation.** On the tested
Linux/WebKitGTK setup, its hover preview is not consistently as sharp or
visually faithful as the native GPU image. It can still produce distracting
visual changes while hovering, especially when zoomed. The interaction
itself is usable; a fully stage-correct, GPU-quality loupe is **not solved**.
The image sample used to change the curve comes from the GPU sampling command,
not from the low-resolution magnifier. I would welcome guidance on integrating
a better magnifier with RapidRAW's native WGPU display.

The eyedropper currently applies only to **global curves**. It is disabled
for mask-local curves until the sampling pipeline can correctly identify the
mask's pre-curve stage. This is intentional: silently modifying the global
curve from a mask panel would be worse than temporarily limiting the tool.

The single-pixel sampling route still uses parts of the normal GPU processing
pipeline, so its latency should be measured on additional hardware. The
feature needs maintainer review for color-managed rendering, undo/redo,
geometry edge cases, keyboard/accessibility, and export consistency.

## Testing

Automated checks on the feature branch:

- Frontend Vite production build: **passed**.
- TypeScript and ESLint compared with the unchanged fork baseline:
  **no new diagnostics**.
- Prettier formatting: **passed**.
- Rust format and `cargo check --locked`: **passed**.

Reference CI: https://github.com/Sebluu/RapidRAW/actions/runs/41218753739

Human review: the main press/drag/release workflow and magnifier interaction
have been exercised on Ubuntu Linux using the fork's development build.
The remaining hover-visual issue above is **still reproducible**. No claim
is made that full-platform QA, every RAW format, or export parity is verified.

### Suggested maintainer QA

- Luma and individual RGB channels; point and parametric curves.
- Press/drag/release, click without drag, rapid repeat, release outside
  the image, switch images and deactivate mid-gesture.
- Crop, rotation, flip, 1:1 zoom, high zoom, and CPU/WGPU display.
- RAW versus JPEG; history/undo, saved edits, before/after and exports.
- Linux/WebKitGTK hover artifacts and source-preview scaling.

## Development and acknowledgments

This feature was developed through an **AI-assisted, user-directed workflow**.
The interaction design and testing feedback came from a photographer using
RapidRAW; ChatGPT generated and revised much of the implementation and
documentation. Automated checks were run, but the code would benefit from
experienced maintainer review and platform-specific testing.

The proposal is independent of the Color Harmonizer and the separate
experimental effects work. No changes are proposed to RapidRAW's main branch
without review.
