import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import OptionPicker from '../../../ui/OptionPicker';
import Slider from '../../../ui/Slider';
import { useEditorStore } from '../../../../store/useEditorStore';
import {
  DEFAULT_KALEIDOSCOPE,
  type KaleidoscopeSettings,
  type KaleidoscopeMode,
  type MirrorAxis,
} from '../../../../utils/effectStudio';

type Props = { settings: KaleidoscopeSettings; onChange: (next: KaleidoscopeSettings) => void };
type NumericKey = Exclude<keyof KaleidoscopeSettings, 'mode' | 'mirrorAxis' | 'edgeColor'>;

const PATTERNS: KaleidoscopeMode[] = ['radial', 'mirror', 'grid', 'geometric', 'spiral', 'fractal'];
const AXES: MirrorAxis[] = ['horizontal', 'vertical', 'quad', 'diagonal'];

export default function KaleidoscopeControls({ settings, onChange }: Props) {
  const { t } = useTranslation();
  const [showPosition, setShowPosition] = useState(false);
  const setEditor = useEditorStore((state) => state.setEditor);
  const l = (key: string): string => t(`editor.effectStudio.${key}` as 'editor.effectStudio.title');
  const change = <K extends keyof KaleidoscopeSettings>(key: K, value: KaleidoscopeSettings[K]) =>
    onChange({ ...settings, [key]: value });
  const onDragStateChange = (dragging: boolean) => setEditor({ isSliderDragging: dragging });

  const slider = (key: NumericKey, label: string, min: number, max: number, step = 1, suffix = '') => (
    <Slider
      label={label}
      value={settings[key]}
      defaultValue={DEFAULT_KALEIDOSCOPE[key]}
      min={min}
      max={max}
      step={step}
      suffix={suffix}
      onChange={(event) => change(key, Number(event.target.value))}
      onDragStateChange={onDragStateChange}
    />
  );

  return (
    <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">{l('pattern')}</span>
        <OptionPicker
          ariaLabel={l('pattern')}
          value={settings.mode}
          options={PATTERNS.map((mode) => ({ value: mode, label: l(mode) }))}
          onChange={(mode) => change('mode', mode)}
        />
      </div>
      {settings.mode === 'mirror' && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">{l('axis')}</span>
          <OptionPicker
            ariaLabel={l('axis')}
            value={settings.mirrorAxis}
            options={AXES.map((axis) => ({ value: axis, label: l(axis) }))}
            onChange={(axis) => change('mirrorAxis', axis)}
          />
        </div>
      )}
      <div>
        {(settings.mode === 'radial' || settings.mode === 'spiral' || settings.mode === 'fractal') &&
          slider('segments', l('segments'), 2, 32)}
        {settings.mode === 'grid' && slider('grid', l('tiles'), 2, 12)}
        {settings.mode === 'geometric' && (
          <>
            {slider('polygonSides', l('polygonSides'), 3, 12)}
            {slider('mirrorSize', l('mirrorSize'), 0.25, 8, 0.05)}
          </>
        )}
        {settings.mode === 'fractal' && slider('depth', l('depth'), 1, 6)}
        {settings.mode === 'spiral' && slider('twist', l('twist'), -10, 10, 0.25)}
        {slider('rotation', l('rotation'), -180, 180, 1, '°')}
        {slider('zoom', l('zoom'), 0.25, 4, 0.05)}
      </div>
      <div className="border-t border-border pt-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-sm font-medium text-text-secondary hover:text-text-primary"
          aria-expanded={showPosition}
          onClick={() => setShowPosition((open) => !open)}
        >
          {l('sourcePosition')}
          <ChevronDown size={15} className={`transition-transform ${showPosition ? 'rotate-180' : ''}`} />
        </button>
        {showPosition && (
          <div className="pt-2">
            <p className="mb-3 text-xs text-text-secondary">{l('sourcePositionDesc')}</p>
            {slider('centerX', l('sourceX'), 0, 100, 1, '%')}
            {slider('centerY', l('sourceY'), 0, 100, 1, '%')}
          </div>
        )}
      </div>
      <div className="border-t border-border pt-3">
        <div className="mb-3 text-sm font-semibold text-text-primary">{l('segmentEdges')}</div>
        {slider('edgeBlur', l('lensSoftness'), 0, 100, 1, '%')}
        <div className="relative">
          {slider('edgeVignette', l('edgeVignette'), 0, 100, 1, '%')}
          <input
            type="color"
            aria-label={l('edgeColor')}
            title={l('edgeColor')}
            value={settings.edgeColor}
            className="absolute right-16 top-0.5 h-5 w-6 cursor-pointer rounded border border-border bg-transparent p-0.5"
            onChange={(event) => change('edgeColor', event.target.value)}
          />
        </div>
        {(settings.edgeBlur > 0 || settings.edgeVignette > 0) && slider('edgeWidth', l('edgeWidth'), 1, 100, 1, '%')}
      </div>
      <button
        type="button"
        className="self-end rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface"
        onClick={() => onChange({ ...DEFAULT_KALEIDOSCOPE })}
      >
        {l('reset')}
      </button>
    </div>
  );
}
