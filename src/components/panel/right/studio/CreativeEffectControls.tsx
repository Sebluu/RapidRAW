import { useTranslation } from 'react-i18next';
import Slider from '../../../ui/Slider';
import OptionPicker from '../../../ui/OptionPicker';
import { useEditorStore } from '../../../../store/useEditorStore';
import {
  DEFAULT_FEEDBACK,
  DEFAULT_PRISM,
  DEFAULT_LOCAL_NORMALIZE,
  type StudioEffect,
} from '../../../../utils/effectStudio';

type CreativeEffect = Exclude<StudioEffect, { type: 'kaleidoscope' }>;
type Field = { key: string; min: number; max: number; step?: number; suffix?: string };
type Props = { effect: CreativeEffect; onChange: (next: StudioEffect) => void };

const FEEDBACK: Field[] = [
  { key: 'amount', min: 0, max: 100, suffix: '%' },
  { key: 'iterations', min: 1, max: 7 },
  { key: 'scale', min: 0.4, max: 0.95, step: 0.01 },
  { key: 'rotation', min: -180, max: 180, suffix: '°' },
  { key: 'decay', min: 0, max: 100, suffix: '%' },
];
const PRISM: Field[] = [
  { key: 'amount', min: 0, max: 100, suffix: '%' },
  { key: 'separation', min: 0, max: 60, suffix: 'px' },
  { key: 'angle', min: -180, max: 180, suffix: '°' },
  { key: 'refraction', min: 0, max: 100, suffix: '%' },
];
const LOCAL: Field[] = [
  { key: 'amount', min: 0, max: 100, suffix: '%' },
  { key: 'radius', min: 2, max: 64, suffix: 'px' },
  { key: 'smoothing', min: 0, max: 100, suffix: '%' },
];
const MASK: Field[] = [
  { key: 'maskLow', min: 0, max: 100, suffix: '%' },
  { key: 'maskHigh', min: 0, max: 100, suffix: '%' },
  { key: 'feather', min: 0, max: 100, suffix: '%' },
  { key: 'blur', min: 0, max: 30, suffix: 'px' },
];

export default function CreativeEffectControls({ effect, onChange }: Props) {
  const { t } = useTranslation();
  const setEditor = useEditorStore((state) => state.setEditor);
  const l = (key: string): string => t(`editor.effectStudio.${key}` as 'editor.effectStudio.title');
  const defaults =
    effect.type === 'fractalFeedback'
      ? DEFAULT_FEEDBACK
      : effect.type === 'prism'
        ? DEFAULT_PRISM
        : DEFAULT_LOCAL_NORMALIZE;
  const numeric = effect.settings as unknown as Record<string, number>;

  const update = (key: string, value: number | string) => {
    switch (effect.type) {
      case 'fractalFeedback':
        onChange({ ...effect, settings: { ...effect.settings, [key]: value } });
        break;
      case 'prism':
        onChange({ ...effect, settings: { ...effect.settings, [key]: value } });
        break;
      case 'localNormalize':
        onChange({ ...effect, settings: { ...effect.settings, [key]: value } });
        break;
    }
  };

  const slider = (field: Field) => (
    <Slider
      key={field.key}
      label={l(field.key)}
      value={numeric[field.key]}
      defaultValue={(defaults as unknown as Record<string, number>)[field.key]}
      min={field.key === 'maskHigh' ? numeric.maskLow : field.min}
      max={field.key === 'maskLow' ? numeric.maskHigh : field.max}
      step={field.step ?? 1}
      suffix={field.suffix ?? ''}
      onChange={(event) => update(field.key, Number(event.target.value))}
      onDragStateChange={(dragging) => setEditor({ isSliderDragging: dragging })}
    />
  );

  const fields = effect.type === 'fractalFeedback' ? FEEDBACK : effect.type === 'prism' ? PRISM : LOCAL;
  return (
    <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
      {effect.type === 'localNormalize' && <p className="text-xs text-text-secondary">{l('localNormalizeNote')}</p>}
      {effect.type === 'prism' && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">{l('prismMode')}</span>
          <OptionPicker
            ariaLabel={l('prismMode')}
            value={effect.settings.mode}
            options={(['dispersion', 'refraction'] as const).map((mode) => ({ value: mode, label: l(mode) }))}
            onChange={(mode) => update('mode', mode)}
          />
        </div>
      )}
      <div>
        {fields
          .filter(
            (field) => field.key !== 'refraction' || effect.type !== 'prism' || effect.settings.mode === 'refraction',
          )
          .map(slider)}
      </div>
      {effect.type !== 'localNormalize' && (
        <div className="border-t border-border pt-3">
          <div className="mb-2 text-sm font-semibold text-text-primary">{l('luminanceBlend')}</div>
          {MASK.map(slider)}
        </div>
      )}
    </div>
  );
}
