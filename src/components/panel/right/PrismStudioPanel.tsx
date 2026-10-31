import { Blocks, GitBranch, Orbit, Scan } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Dedicated creative-effects workspace. Intentionally no editing state or
 * GPU processing yet: the feature is a navigation / architecture skeleton.
 * Subsequent modules should use a nondestructive ordered effect stack.
 */
export default function PrismStudioPanel() {
  const { t } = useTranslation();
  const modules = [
    { id: 'kaleidoscope', Icon: Orbit },
    { id: 'flow', Icon: Scan },
    { id: 'feedback', Icon: GitBranch },
  ] as const;

  return (
    <section
      className="flex h-full flex-col gap-4 overflow-y-auto custom-scrollbar px-3 py-4"
      aria-label={t('editor.prism.title')}
    >
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-text-primary">
          <Blocks size={21} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary">{t('editor.prism.title')}</h2>
          <p className="text-xs text-text-secondary">{t('editor.prism.subtitle')}</p>
        </div>
      </header>
      <p className="text-xs leading-relaxed text-text-secondary">{t('editor.prism.intro')}</p>
      <div className="flex items-center justify-between text-[11px] font-semibold text-text-secondary">
        <span>{t('editor.prism.planned')}</span>
      </div>
      <div className="flex flex-col gap-2">
        {modules.map(({ id, Icon }) => (
          <div
            key={id}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface/40 px-3 py-3 opacity-80"
          >
            <Icon size={19} aria-hidden="true" className="shrink-0 text-text-secondary" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-text-primary">{t(`editor.prism.${id}`)}</p>
              <p className="text-[11px] leading-relaxed text-text-secondary">{t(`editor.prism.${id}Desc`)}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-auto text-[11px] text-text-secondary">{t('editor.prism.status')}</p>
    </section>
  );
}
