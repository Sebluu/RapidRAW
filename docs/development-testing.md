# Testing the v1.6.9 integration

Latest published upstream release checked on 2026-11-15: v1.6.9, `820d1440`.
The upstream main has additional unreleased changes and a substantial Rust module
reorganization. These test branches deliberately target the published release.

## Combined editor

From an existing clone, with no uncommitted local edits:

```bash
git fetch origin
git switch test/combined-v1.6.9
git pull --ff-only
npm ci
npm start
```

If the branch does not exist locally, `git switch --track origin/test/combined-v1.6.9`.
The combined branch includes Color Harmonizer, targeted Curves and Effect Studio.
The original `pr/color-harmonizer` branch and upstream PR #2086 are unchanged.

For a packaged-like frontend and optimized Rust binary:

```bash
npm run tauri -- build --no-bundle
./src-tauri/target/release/rapidraw
```

Use the repository's normal Linux development dependencies. `npm start` uses a
Vite development server and the Rust dev profile (already optimized at level 2);
the official binary uses a production frontend and release Rust settings.
A comparison between those two alone cannot attribute a slowdown to a feature.

## Performance investigation

The Harmonizer test branch already contained v1.6.9's preview/GPU caching. The
older feature/integration branches did not. The neutral Harmonizer does not set
its GPU specialization bit. Histograms are sampled only while the panel is open,
with a 48-entry frontend LRU and shared in-flight requests; slider movement does
not request another histogram.

The histogram command previously ran synchronously on Tauri's calling thread.
It now snapshots the source preview and calculates the bounded histogram in a
blocking worker. The hue shader now selects the nearest node before evaluating
one Gaussian, rather than evaluating up to four exponentials per pixel. These
are concrete reductions in blocking/work, not a measured laptop speedup.

Compare official v1.6.9 and the feature build on the **same machine**, using the
same build mode, image, window size, preview resolution and settings. First test
with the Harmonizer neutral and collapsed, then opened, then active. For Effect
Studio, test each type separately and the full stack, including strength 100%.
Allow the first shader compilation to settle before recording steady-state times.

Use `bench/replay.js` and `bench/analyze.mjs` for the existing UI replay; see
`bench/README.md`. It measures general UI smoothness, so manually exercise the
Harmonizer wheel and effect sliders as well. Log preview/render timings to
separate decode/upload, shader compilation and steady-state rendering.

## Checks

```bash
node scripts/test-color-harmony.mjs
node --test scripts/test-effect-studio.mjs
npm run build
npm run i18n:runtime-check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo run --manifest-path tools/shader-validation/Cargo.toml
cargo test --manifest-path tools/shader-validation/Cargo.toml
```

TypeScript/ESLint regression scripts compare against a worktree of exact v1.6.9.
They report inherited diagnostics separately; a passing regression check does not
mean upstream has no diagnostics. GPU shader tests need a Vulkan adapter (Mesa
lavapipe is sufficient for functional tests, not a hardware performance claim).
