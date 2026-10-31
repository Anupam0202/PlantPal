import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { useNavigate } from '@tanstack/react-router';
import { Command } from 'cmdk';
import {
  Database,
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
                placeholder="Search pages and commands"
                className="h-14 w-full bg-transparent text-body text-ink outline-none placeholder:text-subtle"
              />
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-body-s text-muted">
                No matches.
              </Command.Empty>
              <Command.Group
                heading="Go to"
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
              </Command.Group>
              <Command.Group
                heading="Commands"
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
                  value="Open Garden Copilot ask AI assistant chat"
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
                  value="Toggle theme dark light"
                  onSelect={() => run(() => setPrefs({ theme: theme === 'dark' ? 'light' : 'dark' }))}
                  className={item}
                >
                  {theme === 'dark' ? (
                    <Sun className="size-5 text-muted" aria-hidden="true" />
                  ) : (
                    <Moon className="size-5 text-muted" aria-hidden="true" />
                  )}
                  Toggle theme
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
