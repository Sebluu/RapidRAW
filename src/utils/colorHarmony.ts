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
