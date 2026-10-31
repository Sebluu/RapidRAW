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

The active UI is currently mouse-oriented; sampled response latency can make immediate click-drag interaction inconsistent. The baseline and gesture lifecycle require end-to-end testing. The tiny ROI render still invokes the general GPU processing path (including auxiliary texture handling), so _one-pixel readback_ does not imply constant-time sampling. Curve points may be inserted even if users release the click before the async response, intentionally allowing click-only picking. Existing point hit proximity and endpoint handling require testing.

Potential follow-up: dedicated pre-curve sample compute kernel reading cached intermediate textures, or a cached pre-curve preview if performance warrants it. This should be justified by benchmarks rather than introduced preemptively.

## Upstream PR scope

Keep this feature separate from Color Harmonizer. Before a PR, squash commits after tests, attach before/after GIF, benchmark data, and screenshots. No claim of production readiness until builds and manual editor interaction pass.

## Gesture revision (October 2026)

The picker is now **press → drag vertically → release**, rather than click-to-create:

- A plain click causes no curve mutation.
- A single GPU sample is made at pointer-down, with late responses ignored if the
  user releases, changes image or disarms the tool.
- Pointer movements while sampling are retained. Once sampling finishes, the
  latest pressed position is applied; the next moves are coalesced with
  `requestAnimationFrame` to avoid excessive React/render updates.
- Global mousemove/up handlers finish a gesture even when the pointer leaves the
  image. The picker stays armed for another press, but no previously picked
  point remains locked to the cursor.
- Point curves use the existing point-curve representation. Parametric curves
  target Shadows/Darks/Lights/Highlights according to the currently configured
  split thresholds; the corresponding existing parameter and generated curve
  are updated together, with values anchored to the start of the drag.
- Channel buttons wrap to a second row in narrow panels and active pipette
  uses the app's light-on-dark selection convention.
- A tiny high-contrast square is a compositor cursor; **no magnification loupe**
  is provided yet. Accurate zoomed sampling must use the actual render mapping,
  and is deliberately deferred rather than adding full-image readbacks per move.

**Important scope limitation:** sampling currently uses global pre-curve
rendering. The pixel picker is disabled in mask-specific curves until a
pre-mask sampling stage and container-scoped gesture ownership have been added.
This avoids modifying the wrong curve and is a required item before an
upstream-ready mask picker.

Manual QA: press without moving; drag quickly before the GPU sample returns;
release outside image; switch photos while sampling; point and parametric modes
on all four channels; change split boundaries; narrow panel; undo/redo;
compare RAW and JPEG. The branch CI does not substitute for these checks.

## Eyedropper loupe and pan arbitration (October 2026)

When the global eyedropper is armed, the parent Editor disables all image
panning and click-to-zoom gestures (including modifier drags). Regular
navigation is restored immediately when the eyedropper is disabled.

A compact 24×24 native SVG pipette cursor (hotspot at the actual tip, 2×22) replaces the square cursor. On hover, a
110-pixel circular **3.5× magnifier** shows the locally zoomed existing image
preview, positioned above and to the right of the cursor (or flipped to stay
onscreen). It is hidden outside the image, during an active press/drag, and
when another image tool is active. The loupe performs **no GPU readbacks and
no React state updates per pointer move**; its CSS transforms are updated
imperatively. Its source is the cached display preview where available, with
a thumbnail fallback for the WebGPU renderer. This source may not be a
pixel-identical view of the live, recently graded GPU frame and must be
visually verified on hardware before an upstream PR.

## Picker dismissal and magnifier alignment (October 2026)

The picker is now dismissed on capture-phase `pointerdown` for any other UI
control, including Effect Studio, another adjustment, and the empty background.
Only its own button and presses inside the visible photo keep it armed.
Unmounting global Curves also disarms it. Clicking L/R/G/B while armed changes
the channel and disarms, rather than silently rearming. The magnifier center
accounts for its border and aligns its crosshair to the cursor hotspot.

## Loupe zoom and GPU overlay (October 2026)

The pipette now samples via a pointer event on the existing image DOM surface;
arming it does not mount a Konva stage. The native WebGPU image is never
covered by a second, lower-resolution full-frame image just to accept picker
input. The loupe alone reuses the cached display preview. Its effective zoom
factor is `3.5 * transformScale`, matching the editor zoom proportionally; the
preview is scaled with compositor transforms, without per-move image resizing
or GPU readbacks. Mouse-up outside the photo and async sampling cancellation
continue to use the existing gesture lifecycle. Check WGPU/CPU, 1:1/high zoom,
RAW/JPEG, crop and transformed photos on hardware before upstream submission.

## Native pointer capture and isolated loupe painting (October 2026)

The curve picker is a **gesture**, not a latched drag state: left pointer
down on the image selects a tone; vertical pointer motion updates its curve;
pointer up or cancel commits and clears the active gesture, even when released
outside the photo. The existing DOM image surface now captures its pointer
ID and receives `pointermove`, `pointerup`, `pointercancel` and
`lostpointercapture` explicitly. An outside-window blur still ends a
gesture. Curves stays armed for the next selection; clicking another UI
control disarms it. This fixes a regression introduced when pointer-down
moved from Konva to the DOM but move/up still depended on legacy listeners.

The loupe no longer mounts a **large, CSS-transformed preview image**.
WebKitGTK's compositing of an `<img>` scaled across the whole native GPU
viewport could escape the circular overflow clip and soften the main image
while simply hovering. The decoded preview is now a display:none source and
only the precise 104×104 inner-loupe crop is copied to a fixed-size canvas,
at up to 2× display resolution; the canvas is clipped to the same 110px
circle. The expensive *engine* image remains untouched. The loupe zoom still
tracks the editor zoom and retains the existing hotspot alignment. There
are **no GPU readbacks or Rust invocations on pointer move**. The loupe
draws a bounded small crop from the cached preview, which may itself have
lower resolution than the native zoomed image; full GPU-quality magnification
would require a separate rendering pipeline and is not implied here.

Manual verification required: mouse-down/drag/up, release outside the
image/window, rapid repeated clicks, move into another adjustment, change
photo while dragging, 1:1 and high zoom, WGPU/CPU renderer and RAW/JPEG.
