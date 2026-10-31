import { lazy, Suspense, useState } from 'react';
import { Blocks, ChevronDown, ChevronRight, Eye, EyeOff, GitBranch, Orbit, Plus, Trash2, Shapes } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEditorStore } from '../../../store/useEditorStore';
import { useEditorActions } from '../../../hooks/useEditorActions';
import {
  createKaleidoscope, normalizeEffectStudio,
  type EffectStudioState, type KaleidoscopeSettings,
} from '../../../utils/effectStudio';

// Even the Kaleidoscope control code is fetched only when explicitly opened.
const KaleidoscopeControls = lazy(() => import('./studio/KaleidoscopeControls'));

export default function PrismStudioPanel() {
  const { t } = useTranslation();
  const l = (key: string) => t('editor.effectStudio.' + key);
  const selectedImage = useEditorStore((s) => s.selectedImage);
  const saved = useEditorStore((s) => s.adjustments.effectStudio);
  const { setAdjustments } = useEditorActions();
  const [expanded, setExpanded] = useState(false);
  const effect = normalizeEffectStudio(saved).effects[0];
  const change = (fn: (s: EffectStudioState) => EffectStudioState, label?: string) =>
    setAdjustments((prev) => ({ ...prev, effectStudio: fn(normalizeEffectStudio(prev.effectStudio)) }), label);
  const addEffect = () => {
    change((s) => ({ ...s, effects: [createKaleidoscope()] }), 'Add Kaleidoscope');
    setExpanded(true);
  };
  const setSettings = (settings: KaleidoscopeSettings) =>
    change((s) => ({ ...s, effects: s.effects.map((e) => ({ ...e, settings })) }));

  return (
    <section className="flex h-full flex-col gap-3 overflow-y-auto custom-scrollbar px-3 py-4"
      aria-label={l('title')}>
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
      <div className="rounded-xl border border-border bg-surface/40">
        <div className="flex items-center gap-2 px-3 py-3">
          <Orbit size={19} className="shrink-0 text-text-secondary" aria-hidden />
          <button type="button" className="flex min-w-0 grow items-center gap-2 text-left"
            disabled={!selectedImage || !effect}
            onClick={() => setExpanded((v) => !v)} aria-expanded={expanded && !!effect}>
            <span className="min-w-0 grow">
              <span className="block text-xs font-semibold text-text-primary">{l('kaleidoscope')}</span>
              <span className="block text-[11px] text-text-secondary">{l('kaleidoscopeDesc')}</span>
            </span>
            {effect && (expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
          </button>
          {effect ? (
            <>
              <button type="button" aria-label={effect.visible ? l('hide') : l('show')}
                title={effect.visible ? l('hide') : l('show')}
                className="rounded-md p-1.5 text-text-primary hover:bg-surface"
                onClick={() => change((s) => ({ ...s, effects: s.effects.map((e) =>
                  ({ ...e, visible: !e.visible })) }), 'Toggle Kaleidoscope')}>
                {effect.visible ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
              <button type="button" aria-label={l('remove')} title={l('remove')}
                className="rounded-md p-1.5 text-text-secondary hover:bg-surface"
                onClick={() => { change((s) => ({ ...s, effects: [] }), 'Remove Kaleidoscope'); setExpanded(false); }}>
                <Trash2 size={16} />
              </button>
            </>
          ) : (
            <button type="button" disabled={!selectedImage} title={l('create')} aria-label={l('create')}
              onClick={addEffect} className="rounded-md p-1.5 text-text-primary hover:bg-surface disabled:opacity-40">
              <Plus size={20} />
            </button>
          )}
        </div>
        {effect && expanded && (
          <Suspense fallback={<div className="p-3 text-xs text-text-secondary">{l('loading')}</div>}>
            <KaleidoscopeControls settings={effect.settings} onChange={setSettings} />
          </Suspense>
        )}
      </div>
      <div className="mt-2 text-[11px] font-semibold text-text-secondary">{l('comingSoon')}</div>
      {([{ name: 'feedback', Icon: GitBranch }, { name: 'prism', Icon: Shapes }] as const).map(({ name, Icon }) => (
        <div key={name} className="flex items-center gap-3 rounded-xl border border-border bg-surface/30 px-3 py-3 opacity-60">
          <Icon size={19} className="shrink-0 text-text-secondary" aria-hidden />
          <div>
            <p className="text-xs font-medium text-text-primary">{l(name)}</p>
            <p className="text-[11px] text-text-secondary">{l(name + 'Desc')}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
