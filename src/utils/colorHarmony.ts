import type { ColorHarmonySettings, HarmonyRule } from './adjustments';

export const HARMONY_RULES: HarmonyRule[] = [
  'monochromatic',
  'analogous',
  'analogousComplementary',
  'complementary',
  'splitComplementary',
  'dyad',
  'triad',
  'tetrad',
  'square',
  'custom',
];

// Angles in perceptual OKLCH hue space. Unlike darktable's RYB guides these
// offsets are not RYB-warped; they are the true angles used by our GPU kernel.
export const HARMONY_OFFSETS: Record<Exclude<HarmonyRule, 'custom'>, number[]> = {
  monochromatic: [0],
  analogous: [-30, 0, 30],
  analogousComplementary: [-30, 0, 30, 180],
  complementary: [0, 180],
  splitComplementary: [0, 150, 210],
  dyad: [-30, 30],
  triad: [0, 120, 240],
  tetrad: [-30, 30, 150, 210],
  square: [0, 90, 180, 270],
};

export const wrapHue = (angle: number): number => ((angle % 360) + 360) % 360;

export function ruleNodes(rule: Exclude<HarmonyRule, 'custom'>, anchor: number): number[] {
  return HARMONY_OFFSETS[rule].map((angle) => wrapHue(anchor + angle));
}

export function setHarmonyRule(harmony: ColorHarmonySettings, rule: HarmonyRule): ColorHarmonySettings {
  if (rule === 'custom') {
    return { ...harmony, rule, nodes: [...harmony.nodes], nodeSaturation: [...harmony.nodeSaturation] };
  }
  return { ...harmony, rule, nodes: ruleNodes(rule, harmony.anchor) };
}

export function rotateHarmony(harmony: ColorHarmonySettings, angle: number): ColorHarmonySettings {
  const anchor = wrapHue(angle);
  if (harmony.rule === 'custom') {
    const difference = ((anchor - harmony.anchor + 540) % 360) - 180;
    return { ...harmony, anchor, nodes: harmony.nodes.map((hue) => wrapHue(hue + difference)) };
  }
  return { ...harmony, anchor, nodes: ruleNodes(harmony.rule, anchor) };
}

export function moveHarmonyNode(harmony: ColorHarmonySettings, index: number, angle: number): ColorHarmonySettings {
  const nodes = [...harmony.nodes];
  nodes[index] = wrapHue(angle);
  // Dragging a node detaches from the symmetry pattern without moving others.
  return { ...harmony, rule: 'custom', nodes };
}

/**
 * The pull falloff is Gaussian in the GPU shader with sigma = width * 180° / count.
 * At this upper bound the weakest-covered (largest gap midpoint) hue still
 * gets roughly 84% influence. Wider values increasingly approach a uniform
 * pull and make the slider appear unresponsive.
 *
 * The limit adapts to the *actual* node layout: evenly spaced palettes need
 * less range, whereas analogous or custom clustered nodes need more.
 * Preserve legacy saved values above this UI limit until the user edits them.
 */
export function getHarmonyWidthMax(nodes: number[]): number {
  const sorted = nodes
    .filter(Number.isFinite)
    .map(wrapHue)
    .sort((a, b) => a - b);
  const count = sorted.length;
  if (count <= 1) return 1.7;

  let largestGap = 0;
  for (let i = 0; i < count; i++) {
    const next = i + 1 < count ? sorted[i + 1] : sorted[0] + 360;
    largestGap = Math.max(largestGap, next - sorted[i]);
  }
  return Math.min(4, Math.max(1.7, (1.7 * largestGap * count) / 360));
}

/**
 * Return the strongest distinct hue peaks, not adjacent bins from a single
 * color cloud. The source histogram uses 72 circular OKLCH hue bins (5°).
 * A short circular kernel smooths sampling/quantization noise, then local
 * maxima are ranked by strength with 30° nonmaximum suppression.
 *
 * If an image contains fewer real chromatic peaks than requested, return
 * fewer hues rather than inventing colors that were never detected.
 */
export function dominantHarmonyHues(histogram: number[], desiredCount: number): number[] {
  const binCount = 72;
  if (histogram.length !== binCount || desiredCount <= 0) return [];

  const bins = histogram.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const sample = (index: number) => bins[(index + binCount) % binCount];
  const smoothed = bins.map(
    (_, i) => sample(i) * 0.4 + (sample(i - 1) + sample(i + 1)) * 0.25 + (sample(i - 2) + sample(i + 2)) * 0.05,
  );
  const peakStrength = Math.max(...smoothed);
  if (peakStrength <= 0) return [];

  const candidates = smoothed
    .map((strength, index) => ({ strength, index }))
    .filter(
      ({ strength, index }) =>
        strength >= peakStrength * 0.01 &&
        strength >= smoothed[(index + binCount - 1) % binCount] &&
        strength >= smoothed[(index + 1) % binCount],
    )
    .sort((a, b) => b.strength - a.strength || a.index - b.index);

  const chosen: number[] = [];
  for (const { index } of candidates) {
    if (chosen.every((other) => Math.min(Math.abs(index - other), binCount - Math.abs(index - other)) >= 6)) {
      chosen.push(index);
      if (chosen.length >= Math.min(4, desiredCount)) break;
    }
  }

  return chosen.map((index) => wrapHue((index + 0.5) * 5));
}
