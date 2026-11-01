export type KaleidoscopeMode = 'radial' | 'mirror' | 'grid' | 'spiral' | 'fractal' | 'geometric' | 'triangle';
export type MirrorAxis = 'horizontal' | 'vertical' | 'quad' | 'diagonal';

export interface KaleidoscopeSettings {
  mode: KaleidoscopeMode;
  mirrorAxis: MirrorAxis;
  segments: number;
  grid: number;
  polygonSides: number;
  mirrorSize: number;
  depth: number;
  centerX: number;
  centerY: number;
  rotation: number;
  zoom: number;
  twist: number;
  edgeBlur: number;
  edgeVignette: number;
  edgeColor: string;
  edgeWidth: number;
}
export interface LuminanceBlend {
  maskLow: number;
  maskHigh: number;
  feather: number;
  blur: number;
}
export interface FractalFeedbackSettings extends LuminanceBlend {
  iterations: number;
  scale: number;
  rotation: number;
  amount: number;
  decay: number;
}
export interface PrismSettings extends LuminanceBlend {
  mode: 'dispersion' | 'refraction';
  amount: number;
  separation: number;
  angle: number;
  refraction: number;
}
export interface LocalNormalizeSettings {
  amount: number;
  radius: number;
  smoothing: number;
}
export interface KaleidoscopeEffect {
  id: string;
  type: 'kaleidoscope';
  version: 1;
  visible: boolean;
  settings: KaleidoscopeSettings;
}
export type StudioEffect =
  | KaleidoscopeEffect
  | { id: string; type: 'fractalFeedback'; version: 1; visible: boolean; settings: FractalFeedbackSettings }
  | { id: string; type: 'prism'; version: 1; visible: boolean; settings: PrismSettings }
  | { id: string; type: 'localNormalize'; version: 1; visible: boolean; settings: LocalNormalizeSettings };
export type StudioEffectType = StudioEffect['type'];
export interface EffectStudioState {
  version: 1;
  effects: StudioEffect[];
}
export const EMPTY_EFFECT_STUDIO: EffectStudioState = { version: 1, effects: [] };
export const DEFAULT_KALEIDOSCOPE: KaleidoscopeSettings = {
  mode: 'radial',
  mirrorAxis: 'quad',
  segments: 8,
  grid: 4,
  polygonSides: 3,
  mirrorSize: 2,
  depth: 3,
  centerX: 50,
  centerY: 50,
  rotation: 0,
  zoom: 1,
  twist: 2,
  edgeBlur: 0,
  edgeVignette: 0,
  edgeColor: '#000000',
  edgeWidth: 30,
};
export const DEFAULT_FEEDBACK: FractalFeedbackSettings = {
  iterations: 4, scale: 0.78, rotation: 12, amount: 38, decay: 65,
  maskLow: 0, maskHigh: 100, feather: 10, blur: 0,
};
export const DEFAULT_PRISM: PrismSettings = {
  mode: 'dispersion', amount: 45, separation: 12, angle: 0, refraction: 25,
  maskLow: 0, maskHigh: 100, feather: 10, blur: 0,
};
export const DEFAULT_LOCAL_NORMALIZE: LocalNormalizeSettings = { amount: 25, radius: 16, smoothing: 50 };
const finite = (value: unknown, fallback: number, low: number, high: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;
const modes: KaleidoscopeMode[] = ['radial', 'mirror', 'grid', 'spiral', 'fractal', 'geometric', 'triangle'];
const axes: MirrorAxis[] = ['horizontal', 'vertical', 'quad', 'diagonal'];

export function normalizeKaleidoscope(input: unknown): KaleidoscopeSettings {
  const s = (input && typeof input === 'object' ? input : {}) as Partial<KaleidoscopeSettings>;
  const d = DEFAULT_KALEIDOSCOPE;
  return {
    mode: s.mode === 'triangle' ? 'geometric' : modes.includes(s.mode as KaleidoscopeMode) ? s.mode! : d.mode,
    mirrorAxis: axes.includes(s.mirrorAxis as MirrorAxis) ? s.mirrorAxis! : d.mirrorAxis,
    segments: Math.round(finite(s.segments, d.segments, 2, 32)),
    grid: Math.round(finite(s.grid, d.grid, 2, 12)),
    polygonSides: Math.round(finite(s.polygonSides, d.polygonSides, 3, 12)),
    mirrorSize: finite(s.mirrorSize, s.mode === 'triangle' ? 2 / finite(s.grid, d.grid, 2, 12) : d.mirrorSize, 0.25, 8),
    depth: Math.round(finite(s.depth, d.depth, 1, 6)),
    centerX: finite(s.centerX, d.centerX, 0, 100),
    centerY: finite(s.centerY, d.centerY, 0, 100),
    rotation: finite(s.rotation, d.rotation, -180, 180),
    zoom: finite(s.zoom, d.zoom, 0.25, 4),
    twist: finite(s.twist, d.twist, -10, 10),
    edgeBlur: finite(s.edgeBlur, d.edgeBlur, 0, 100),
    edgeVignette: finite(s.edgeVignette, d.edgeVignette, 0, 100),
    edgeColor: typeof s.edgeColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.edgeColor) ? s.edgeColor : d.edgeColor,
    edgeWidth: finite(s.edgeWidth, d.edgeWidth, 1, 100),
  };
}
function normalizeLuminance(s: Partial<LuminanceBlend>): LuminanceBlend {
  const a = finite(s.maskLow, 0, 0, 100);
  const b = finite(s.maskHigh, 100, 0, 100);
  return {
    maskLow: Math.min(a, b),
    maskHigh: Math.max(a, b),
    feather: finite(s.feather, 10, 0, 100),
    blur: finite(s.blur, 0, 0, 30),
  };
}
export function normalizeFeedback(input: unknown): FractalFeedbackSettings {
  const s = (input && typeof input === 'object' ? input : {}) as Partial<FractalFeedbackSettings>;
  const d = DEFAULT_FEEDBACK;
  return {
    ...normalizeLuminance(s),
    iterations: Math.round(finite(s.iterations, d.iterations, 1, 7)),
    scale: finite(s.scale, d.scale, 0.4, 0.95),
    rotation: finite(s.rotation, d.rotation, -180, 180),
    amount: finite(s.amount, d.amount, 0, 100),
    decay: finite(s.decay, d.decay, 0, 100),
  };
}
export function normalizePrism(input: unknown): PrismSettings {
  const s = (input && typeof input === 'object' ? input : {}) as Partial<PrismSettings>;
  const d = DEFAULT_PRISM;
  return {
    ...normalizeLuminance(s),
    mode: s.mode === 'refraction' ? 'refraction' : 'dispersion',
    amount: finite(s.amount, d.amount, 0, 100),
    separation: finite(s.separation, d.separation, 0, 60),
    angle: finite(s.angle, d.angle, -180, 180),
    refraction: finite(s.refraction, d.refraction, 0, 100),
  };
}
export function normalizeLocalNormalize(input: unknown): LocalNormalizeSettings {
  const s = (input && typeof input === 'object' ? input : {}) as Partial<LocalNormalizeSettings>;
  const d = DEFAULT_LOCAL_NORMALIZE;
  return {
    amount: finite(s.amount, d.amount, 0, 100),
    radius: finite(s.radius, d.radius, 2, 64),
    smoothing: finite(s.smoothing, d.smoothing, 0, 100),
  };
}
export function normalizeEffectStudio(input: unknown): EffectStudioState {
  const raw = (input && typeof input === 'object' ? input : {}) as { effects?: unknown };
  const items = Array.isArray(raw.effects) ? raw.effects : [];
  const seen = new Set<StudioEffectType>();
  const effects: StudioEffect[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Partial<StudioEffect>;
    if (!e.type || seen.has(e.type)) continue;
    const shared = {
      id: typeof e.id === 'string' && e.id ? e.id : e.type + '-primary',
      version: 1 as const,
      visible: e.visible === true,
    };
    switch (e.type) {
      case 'kaleidoscope':
        effects.push({ ...shared, type: e.type, settings: normalizeKaleidoscope(e.settings) });
        break;
      case 'fractalFeedback':
        effects.push({ ...shared, type: e.type, settings: normalizeFeedback(e.settings) });
        break;
      case 'prism':
        effects.push({ ...shared, type: e.type, settings: normalizePrism(e.settings) });
        break;
      case 'localNormalize':
        effects.push({ ...shared, type: e.type, settings: normalizeLocalNormalize(e.settings) });
        break;
      default:
        continue;
    }
    seen.add(e.type);
  }
  return { version: 1, effects };
}
export function createStudioEffect(type: StudioEffectType): StudioEffect {
  const shared = { id: type + '-primary', version: 1 as const, visible: false };
  switch (type) {
    case 'kaleidoscope': return { ...shared, type, settings: { ...DEFAULT_KALEIDOSCOPE } };
    case 'fractalFeedback': return { ...shared, type, settings: { ...DEFAULT_FEEDBACK } };
    case 'prism': return { ...shared, type, settings: { ...DEFAULT_PRISM } };
    case 'localNormalize': return { ...shared, type, settings: { ...DEFAULT_LOCAL_NORMALIZE } };
  }
}
export const createKaleidoscope = () => createStudioEffect('kaleidoscope');
