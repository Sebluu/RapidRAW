# Prism Studio — effects workspace foundation

Feature branch: `feature/prism-studio` based on `main`.

Prism Studio is a **separate right-sidebar workspace**, placed between Inpaint and Presets. It intentionally does **not** add a shader, modify adjustment state, change exports, or pretend that its planned effects work. This first commit only establishes navigation, saved workspace migration (including previously customized layouts), icon, mobile switcher, localizations, and an honest empty-state interface.

## Future implementation contracts

1. **Nondestructive ordered effect stack**, independent of normal adjustment panels, with stable per-effect IDs, versioned settings, enable state and deterministic serialization. Support inserting/reordering/disabling individual effects and maintaining Undo/Redo history.
2. A **single GPU graph** for preview and export, reusing identical effect semantics; never render entire intermediate images on the CPU just for a UI slider.
3. **Incremental graph invalidation**: changing effect N recomputes only affected passes N onward; reuse upstream textures with bounded memory and explicit eviction, measured on high-resolution RAWs.
4. Explicit separation between interactive preview quality and final-export quality, with correct image geometry/zoom.
5. First planned module: **Kaleidoscope** (horizontal/vertical/diagonal, radial 2–32 sectors, infinite mirrors, tile grids, freely draggable center, rotation, zoom). Later candidates: Flow Fields, Fractal Feedback and Dream Lens.
6. Keep effect implementations in individual branches and sync them to a `test/` integration branch for real-world testing. This foundational UI should remain a small independent upstream PR if desired.

## Validation

- [ ] Typecheck/build in CI (baseline inherited from RapidRAW)
- [ ] Verify panel visible in desktop + mobile navigation
- [ ] Verify existing saved workspace layouts automatically place Prism after Inpaint
- [ ] Verify switching panels never changes edited image, thumbnails or GPU state
- [ ] Test dark/light themes and narrow widths

No effects are implemented in this branch by design.
