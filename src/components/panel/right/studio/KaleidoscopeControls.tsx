import { useTranslation } from 'react-i18next';
import { useEditorStore } from '../../../../store/useEditorStore';
import { DEFAULT_KALEIDOSCOPE, type KaleidoscopeSettings } from '../../../../utils/effectStudio';

type Props = { settings: KaleidoscopeSettings; onChange: (next: KaleidoscopeSettings) => void };

function Slider({
  title,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  title: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const setEditor = useEditorStore((s) => s.setEditor);
  return (
    <label className="block py-1">
      <span className="mb-1 flex justify-between text-xs text-text-secondary">
        <span>{title}</span>
        <span className="tabular-nums">
          {value}
          {unit}
        </span>
      </span>
      <input
        className="w-full accent-accent cursor-pointer"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={() => setEditor({ isSliderDragging: true })}
        onPointerUp={() => setEditor({ isSliderDragging: false })}
        onPointerCancel={() => setEditor({ isSliderDragging: false })}
        onBlur={() => setEditor({ isSliderDragging: false })}
      />
    </label>
  );
}

export default function KaleidoscopeControls({ settings: s, onChange }: Props) {
  const { t } = useTranslation();
  const l = (key: string): string => t(`editor.effectStudio.${key}` as 'editor.effectStudio.title');
  const change = (key: keyof KaleidoscopeSettings, value: string | number) => onChange({ ...s, [key]: value });
  return (
    <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {l('pattern')}
        <select
          className="rounded-md border border-border bg-background px-2 py-2 text-text-primary"
          value={s.mode}
          onChange={(e) => change('mode', e.target.value)}
        >
          {(['radial', 'mirror', 'grid', 'spiral', 'fractal'] as const).map((mode) => (
            <option key={mode} value={mode}>
              {l(mode)}
            </option>
          ))}
        </select>
      </label>
      {s.mode === 'mirror' && (
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {l('axis')}
          <select
            className="rounded-md border border-border bg-background px-2 py-2 text-text-primary"
            value={s.mirrorAxis}
            onChange={(e) => change('mirrorAxis', e.target.value)}
          >
            {(['horizontal', 'vertical', 'quad', 'diagonal'] as const).map((axis) => (
              <option key={axis} value={axis}>
                {l(axis)}
              </option>
            ))}
          </select>
        </label>
      )}
      {(s.mode === 'radial' || s.mode === 'spiral' || s.mode === 'fractal') && (
        <Slider title={l('segments')} value={s.segments} min={2} max={32} onChange={(v) => change('segments', v)} />
      )}
      {s.mode === 'grid' && (
        <Slider title={l('tiles')} value={s.grid} min={2} max={12} onChange={(v) => change('grid', v)} />
      )}
      {s.mode === 'fractal' && (
        <Slider title={l('depth')} value={s.depth} min={1} max={6} onChange={(v) => change('depth', v)} />
      )}
      {s.mode === 'spiral' && (
        <Slider
          title={l('twist')}
          value={s.twist}
          min={-10}
          max={10}
          step={0.25}
          onChange={(v) => change('twist', v)}
        />
      )}
      <Slider
        title={l('centerX')}
        value={s.centerX}
        min={0}
        max={100}
        onChange={(v) => change('centerX', v)}
        unit="%"
      />
      <Slider
        title={l('centerY')}
        value={s.centerY}
        min={0}
        max={100}
        onChange={(v) => change('centerY', v)}
        unit="%"
      />
      <Slider
        title={l('rotation')}
        value={s.rotation}
        min={-180}
        max={180}
        onChange={(v) => change('rotation', v)}
        unit="°"
      />
      <Slider title={l('zoom')} value={s.zoom} min={0.25} max={4} step={0.05} onChange={(v) => change('zoom', v)} />
      <div className="mt-1 border-t border-border pt-3">
        <div className="mb-2 text-xs font-semibold text-text-primary">{l('segmentEdges')}</div>
        <Slider
          title={l('lensSoftness')}
          value={s.edgeBlur}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => change('edgeBlur', v)}
        />
        <Slider
          title={l('edgeVignette')}
          value={s.edgeVignette}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => change('edgeVignette', v)}
        />
        {(s.edgeBlur > 0 || s.edgeVignette > 0) && (
          <Slider
            title={l('edgeWidth')}
            value={s.edgeWidth}
            min={1}
            max={100}
            unit="%"
            onChange={(v) => change('edgeWidth', v)}
          />
        )}
      </div>
      <button
        className="self-end rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface"
        onClick={() => onChange({ ...DEFAULT_KALEIDOSCOPE })}
      >
        {l('reset')}
      </button>
    </div>
  );
}
