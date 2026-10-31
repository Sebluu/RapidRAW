/** Versioned, nondestructive creative effects, stored with each image's adjustments. */
export type KaleidoscopeMode = 'radial' | 'mirror' | 'grid' | 'spiral' | 'fractal';
export type MirrorAxis = 'horizontal' | 'vertical' | 'quad' | 'diagonal';

export interface KaleidoscopeSettings {
  mode: KaleidoscopeMode;
  mirrorAxis: MirrorAxis;
  segments: number;
  grid: number;
  depth: number;
  centerX: number;
  centerY: number;
  rotation: number;
  zoom: number;
  twist: number;
  edgeBlur: number;
  edgeVignette: number;
  edgeWidth: number;
}
export interface KaleidoscopeEffect {
  id: string;
  type: 'kaleidoscope';
  version: 1;
  visible: boolean;
  settings: KaleidoscopeSettings;
}
export interface EffectStudioState {
  version: 1;
  effects: KaleidoscopeEffect[];
}
export const EMPTY_EFFECT_STUDIO: EffectStudioState = { version: 1, effects: [] };
export const DEFAULT_KALEIDOSCOPE: KaleidoscopeSettings = {
  mode: 'radial',
  mirrorAxis: 'quad',
  segments: 8,
  grid: 4,
  depth: 3,
  centerX: 50,
  centerY: 50,
  rotation: 0,
  zoom: 1,
  twist: 2,
  edgeBlur: 0,
  edgeVignette: 0,
  edgeWidth: 30,
};
const finite = (value: unknown, fallback: number, low: number, high: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;
const modes: KaleidoscopeMode[] = ['radial', 'mirror', 'grid', 'spiral', 'fractal'];
const axes: MirrorAxis[] = ['horizontal', 'vertical', 'quad', 'diagonal'];

export function normalizeKaleidoscope(input: unknown): KaleidoscopeSettings {
  const s = (input && typeof input === 'object' ? input : {}) as Partial<KaleidoscopeSettings>;
  const d = DEFAULT_KALEIDOSCOPE;
  return {
    mode: modes.includes(s.mode as KaleidoscopeMode) ? s.mode! : d.mode,
    mirrorAxis: axes.includes(s.mirrorAxis as MirrorAxis) ? s.mirrorAxis! : d.mirrorAxis,
    segments: Math.round(finite(s.segments, d.segments, 2, 32)),
    grid: Math.round(finite(s.grid, d.grid, 2, 12)),
    depth: Math.round(finite(s.depth, d.depth, 1, 6)),
    centerX: finite(s.centerX, d.centerX, 0, 100),
    centerY: finite(s.centerY, d.centerY, 0, 100),
    rotation: finite(s.rotation, d.rotation, -180, 180),
    zoom: finite(s.zoom, d.zoom, 0.25, 4),
    twist: finite(s.twist, d.twist, -10, 10),
    edgeBlur: finite(s.edgeBlur, d.edgeBlur, 0, 100),
    edgeVignette: finite(s.edgeVignette, d.edgeVignette, 0, 100),
    edgeWidth: finite(s.edgeWidth, d.edgeWidth, 1, 100),
  };
}
/** Unknown future effects remain in saved metadata; only known types render in v1. */
export function normalizeEffectStudio(input: unknown): EffectStudioState {
  const raw = (input && typeof input === 'object' ? input : {}) as { effects?: unknown };
  const effects = Array.isArray(raw.effects) ? raw.effects : [];
  return {
    version: 1,
    effects: effects
      .filter((e): e is KaleidoscopeEffect => !!e && typeof e === 'object' && e.type === 'kaleidoscope')
      .slice(0, 1)
      .map((e) => ({
        id: typeof e.id === 'string' && e.id ? e.id : 'kaleidoscope-primary',
        type: 'kaleidoscope' as const,
        version: 1 as const,
        visible: e.visible === true,
        settings: normalizeKaleidoscope(e.settings),
      })),
  };
}
export function createKaleidoscope(): KaleidoscopeEffect {
  return {
    id: 'kaleidoscope-primary',
    type: 'kaleidoscope',
    version: 1,
    visible: false,
    settings: { ...DEFAULT_KALEIDOSCOPE },
  };
}
