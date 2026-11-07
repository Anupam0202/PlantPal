import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { useNavigate } from '@tanstack/react-router';
import { Command } from 'cmdk';
import {
  Bird,
  Database,
  LayoutGrid,
  Moon,
  NotebookPen,
  Plus,
  Search,
  Settings,
  Sprout,
  Sun,
  BookOpen,
  HeartPulse,
  PencilRuler,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { usePrefs } from '../state/prefs';
import { useCapture } from '../state/capture';
import { destinations } from './nav';

/** ⌘K / Ctrl+K palette: navigation and quick commands (§5.3). */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const setPrefs = usePrefs((s) => s.set);
  const theme = usePrefs((s) => s.theme);
  const openCapture = useCapture((s) => s.openCapture);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  // Every page a person may look for, in their language, with English words that also find it.
  const p = t.palette.pages;
  const pages = [
    { to: '/garden/spaces', label: t.garden.tabSpaces, words: 'spaces zones balcony', icon: Sprout },
    { to: '/garden/journal', label: t.garden.tabJournal, words: 'journal notes history', icon: Sprout },
    { to: '/garden/health', label: t.garden.tabHealth, words: 'health cases sick', icon: Sprout },
    { to: '/garden/harvest', label: t.garden.tabHarvest, words: 'harvest pick produce pantry', icon: Sprout },
    { to: '/garden/seeds', label: t.garden.tabSeeds, words: 'seeds seed library', icon: Sprout },
    { to: '/garden/labels', label: t.garden.tabLabels, words: 'labels qr print', icon: Sprout },
    { to: '/plan/sun', label: p.sun, words: 'sun hours light shade', icon: LayoutGrid },
    { to: '/plan/calendar', label: p.calendar, words: 'calendar sow plant when', icon: LayoutGrid },
    { to: '/nature/climate', label: p.climate, words: 'climate fit weather', icon: Bird },
    { to: '/nature/count', label: p.count, words: 'pollinator count insects bees', icon: Bird },
    { to: '/nature/birds', label: p.birds, words: 'bird count', icon: Bird },
    { to: '/nature/sighting', label: p.sighting, words: 'sighting bee butterfly bird', icon: Bird },
    { to: '/nature/phenology', label: p.phenology, words: 'flowering fruiting checks', icon: Bird },
    { to: '/nature/log', label: p.natureLog, words: 'nature log visits', icon: Bird },
    { to: '/nature/bloom', label: p.bloom, words: 'bloom bridge pollinators months', icon: Bird },
    { to: '/nature/lens', label: p.lens, words: 'native invasive', icon: Bird },
    { to: '/nature/nearby', label: p.nearby, words: 'nearby wildlife records', icon: Bird },
    { to: '/nature/corridor', label: p.corridor, words: 'corridor map green', icon: Bird },
    { to: '/nature/impact', label: p.impact, words: 'impact ledger', icon: Bird },
    { to: '/nature/stamps', label: p.stamps, words: 'stamps badges', icon: Bird },
    { to: '/nature/story', label: p.story, words: 'story year review', icon: Bird },
    { to: '/learn', label: p.learn, words: 'learn lessons guides', icon: BookOpen },
    { to: '/settings/ai', label: t.settings.ai, words: 'ai gemini key models', icon: Settings },
    { to: '/settings/sources', label: t.env.sources.title, words: 'data sources weather', icon: Settings },
    { to: '/settings/account', label: p.account, words: 'account sync sign in', icon: Settings },
  ] as const;

  const item =
    'flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-body-s text-ink data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent-ink';

  return (
    <BaseDialog.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-scrim transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <BaseDialog.Popup className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-raised shadow-3 outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <BaseDialog.Title className="sr-only">{t.nav.commandPalette}</BaseDialog.Title>
          <Command label={t.nav.commandPalette} loop>
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-5 text-muted" aria-hidden="true" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={t.palette.placeholder}
                className="h-14 w-full bg-transparent text-body text-ink outline-none placeholder:text-subtle"
              />
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-body-s text-muted">
                {t.palette.empty}
              </Command.Empty>
              <Command.Group
                heading={t.palette.goTo}
                className="text-caption text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2"
              >
                {destinations.map((d) => (
                  <Command.Item
                    key={d.to}
                    value={t.nav[d.key]}
                    onSelect={() => run(() => void navigate({ to: d.to }))}
                    className={item}
                  >
                    <d.icon className="size-5 text-muted" aria-hidden="true" />
                    {t.nav[d.key]}
                  </Command.Item>
                ))}
                <Command.Item
                  value={t.nav.settings}
                  onSelect={() => run(() => void navigate({ to: '/settings' }))}
                  className={item}
                >
                  <Settings className="size-5 text-muted" aria-hidden="true" />
                  {t.nav.settings}
                </Command.Item>
                {pages.map((pg) => (
                  <Command.Item
                    key={pg.to}
                    value={`${pg.label} ${pg.words}`}
                    onSelect={() => run(() => void navigate({ to: pg.to }))}
                    className={item}
                  >
                    <pg.icon className="size-5 text-muted" aria-hidden="true" />
                    {pg.label}
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group
                heading={t.palette.commands}
                className="text-caption text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2"
              >
                <Command.Item
                  value={`${t.capture.open} log care water`}
                  onSelect={() => run(() => openCapture())}
                  className={item}
                >
                  <NotebookPen className="size-5 text-muted" aria-hidden="true" />
                  {t.capture.open}
                </Command.Item>
                <Command.Item
                  value={`${t.garden.addPlant} add plant`}
                  onSelect={() => run(() => void navigate({ to: '/garden/plants/new' }))}
                  className={item}
                >
                  <Sprout className="size-5 text-muted" aria-hidden="true" />
                  {t.garden.addPlant}
                </Command.Item>
                <Command.Item
                  value={`${t.garden.newHealthCase} health sick plant`}
                  onSelect={() => run(() => void navigate({ to: '/garden/health/new' }))}
                  className={item}
                >
                  <HeartPulse className="size-5 text-muted" aria-hidden="true" />
                  {t.garden.newHealthCase}
                </Command.Item>
                <Command.Item
                  value={`${t.garden.speciesIndex} species plants guide`}
                  onSelect={() => run(() => void navigate({ to: '/species' }))}
                  className={item}
                >
                  <BookOpen className="size-5 text-muted" aria-hidden="true" />
                  {t.garden.speciesIndex}
                </Command.Item>
                <Command.Item
                  value={`${t.garden.spaceDesigner} layout design plan drawing`}
                  onSelect={() => run(() => void navigate({ to: '/plan/design' }))}
                  className={item}
                >
                  <PencilRuler className="size-5 text-muted" aria-hidden="true" />
                  {t.garden.spaceDesigner}
                </Command.Item>
                <Command.Item
                  value={`${t.copilot.open} copilot ask ai assistant chat`}
                  onSelect={() => run(() => void navigate({ to: '/copilot' }))}
                  className={item}
                >
                  <Sparkles className="size-5 text-muted" aria-hidden="true" />
                  {t.copilot.open}
                </Command.Item>
                <Command.Item
                  value={`${t.garden.newGarden} new garden`}
                  onSelect={() => run(() => void navigate({ to: '/garden/new' }))}
                  className={item}
                >
                  <Plus className="size-5 text-muted" aria-hidden="true" />
                  {t.garden.newGarden}
                </Command.Item>
                <Command.Item
                  value={`${t.data.title} export backup import data`}
                  onSelect={() => run(() => void navigate({ to: '/settings/data' }))}
                  className={item}
                >
                  <Database className="size-5 text-muted" aria-hidden="true" />
                  {t.data.title}
                </Command.Item>
                <Command.Item
                  value={`${t.palette.toggleTheme} theme dark light`}
                  onSelect={() => run(() => setPrefs({ theme: theme === 'dark' ? 'light' : 'dark' }))}
                  className={item}
                >
                  {theme === 'dark' ? (
                    <Sun className="size-5 text-muted" aria-hidden="true" />
                  ) : (
                    <Moon className="size-5 text-muted" aria-hidden="true" />
                  )}
                  {t.palette.toggleTheme}
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
