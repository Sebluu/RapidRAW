import { lazy, Suspense, useState } from 'react';
import { Blocks, ChevronDown, ChevronRight, Eye, EyeOff, GitBranch, Orbit, Plus, Shapes, Trash2, Contrast } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEditorStore } from '../../../store/useEditorStore';
import { useEditorActions } from '../../../hooks/useEditorActions';
import {
  createStudioEffect,
  normalizeEffectStudio,
  type EffectStudioState,
  type StudioEffect,
  type StudioEffectType,
} from '../../../utils/effectStudio';

const KaleidoscopeControls = lazy(() => import('./studio/KaleidoscopeControls'));
const CreativeEffectControls = lazy(() => import('./studio/CreativeEffectControls'));

const MODULES = [
  { type: 'kaleidoscope', Icon: Orbit },
  { type: 'fractalFeedback', Icon: GitBranch },
  { type: 'prism', Icon: Shapes },
  { type: 'localNormalize', Icon: Contrast },
] as const;

export default function PrismStudioPanel() {
  const { t } = useTranslation();
  const l = (key: string): string => t(`editor.effectStudio.${key}` as 'editor.effectStudio.title');
  const selectedImage = useEditorStore((s) => s.selectedImage);
  const saved = useEditorStore((s) => s.adjustments.effectStudio);
  const { setAdjustments } = useEditorActions();
  const [expanded, setExpanded] = useState<Partial<Record<StudioEffectType, boolean>>>({});
  const studio = normalizeEffectStudio(saved);

  const change = (fn: (s: EffectStudioState) => EffectStudioState, label?: string) =>
    setAdjustments((prev) => ({ ...prev, effectStudio: fn(normalizeEffectStudio(prev.effectStudio)) }), label);

  const addEffect = (type: StudioEffectType) => {
    change((state) => ({ ...state, effects: [...state.effects, createStudioEffect(type)] }), `Add ${type}`);
    setExpanded((state) => ({ ...state, [type]: true }));
  };

  const saveEffect = (next: StudioEffect) =>
    change((state) => ({
      ...state,
      effects: state.effects.map((effect) => (effect.type === next.type ? next : effect)),
    }));

  const toggleVisibility = (type: StudioEffectType) =>
    change((state) => ({
      ...state,
      effects: state.effects.map((effect) => (effect.type === type ? { ...effect, visible: !effect.visible } : effect)),
    }), `Toggle ${type}`);

  const removeEffect = (type: StudioEffectType) => {
    change((state) => ({ ...state, effects: state.effects.filter((effect) => effect.type !== type) }), `Remove ${type}`);
    setExpanded((state) => ({ ...state, [type]: false }));
  };

  return (
    <section className="flex h-full flex-col gap-3 overflow-y-auto custom-scrollbar px-3 py-4" aria-label={l('title')}>
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-text-primary">
          <Blocks size={21} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary">{l('title')}</h2>
          <p className="text-xs text-text-secondary">{l('subtitle')}</p>
        </div>
      </header>
      {!selectedImage && <p className="text-xs text-text-secondary">{l('selectImage')}</p>}
      {MODULES.map(({ type, Icon }) => {
        const effect = studio.effects.find((item) => item.type === type);
        const open = !!expanded[type];
        return (
          <div key={type} className="rounded-xl border border-border bg-surface/40">
            <div className="flex items-center gap-2 px-3 py-3">
              <Icon size={19} className="shrink-0 text-text-secondary" aria-hidden />
              <button type="button" className="flex min-w-0 grow items-center gap-2 text-left"
                disabled={!selectedImage || !effect} aria-expanded={open && !!effect}
                onClick={() => setExpanded((value) => ({ ...value, [type]: !value[type] }))}>
                <span className="min-w-0 grow">
                  <span className="block text-xs font-semibold text-text-primary">{l(type)}</span>
                  <span className="block text-[11px] text-text-secondary">{l(type + 'Desc')}</span>
                </span>
                {effect && (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
              </button>
              {effect ? (
                <>
                  <button type="button" aria-label={effect.visible ? l('hide') : l('show')}
                    title={effect.visible ? l('hide') : l('show')}
                    className="rounded-md p-1.5 text-text-primary hover:bg-surface"
                    onClick={() => toggleVisibility(type)}>
                    {effect.visible ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                  <button type="button" aria-label={l('remove')} title={l('remove')}
                    className="rounded-md p-1.5 text-text-secondary hover:bg-surface"
                    onClick={() => removeEffect(type)}>
                    <Trash2 size={16} />
                  </button>
                </>
              ) : (
                <button type="button" disabled={!selectedImage} aria-label={l('create')} title={l('create')}
                  onClick={() => addEffect(type)}
                  className="rounded-md p-1.5 text-text-primary hover:bg-surface disabled:opacity-40">
                  <Plus size={20} />
                </button>
              )}
            </div>
            {effect && open && (
              <Suspense fallback={<div className="p-3 text-xs text-text-secondary">{l('loading')}</div>}>
                {effect.type === 'kaleidoscope' ? (
                  <KaleidoscopeControls settings={effect.settings}
                    onChange={(settings) => saveEffect({ ...effect, settings })} />
                ) : (
                  <CreativeEffectControls effect={effect} onChange={saveEffect} />
                )}
              </Suspense>
            )}
          </div>
        );
      })}
      <p className="px-1 text-[11px] text-text-secondary">{l('pipelineOrder')}</p>
    </section>
  );
}
