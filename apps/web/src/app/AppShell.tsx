import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { cn, IconButton, Kbd } from '@plantpal/ui';
import { Plus, Search, Settings } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { useT } from '../i18n';
import { useCapture } from '../state/capture';
import { destinations } from './nav';
import { ThemeController } from './ThemeController';
import { UpdatePrompt } from './UpdatePrompt';

const CommandPalette = lazy(() => import('./CommandPalette').then((m) => ({ default: m.CommandPalette })));
const QuickCapture = lazy(() =>
  import('../features/garden/QuickCapture').then((m) => ({ default: m.QuickCapture })),
);

/** Floating "Log care" button; the sheet itself loads on first use. */
function CaptureLauncher() {
  const t = useT();
  const open = useCapture((s) => s.open);
  const openCapture = useCapture((s) => s.openCapture);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (open) setLoaded(true);
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => openCapture()}
        aria-label={t.capture.open}
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 inline-flex size-14 items-center justify-center gap-2 rounded-full bg-accent text-on-accent shadow-3 transition-transform duration-150 hover:scale-[1.03] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:right-8 md:bottom-8 md:h-12 md:w-auto md:px-5"
      >
        <Plus className="size-6 md:size-5" aria-hidden="true" />
        <span className="hidden font-medium md:inline" aria-hidden="true">
          {t.capture.open}
        </span>
      </button>
      {loaded && (
        <Suspense fallback={null}>
          <QuickCapture />
        </Suspense>
      )}
    </>
  );
}

/** Home link that is never marked as the current page (only nav items carry aria-current). */
function HomeLink({ children, className }: { children: ReactNode; className?: string }) {
  const navigate = useNavigate();
  return (
    <a
      href="/today"
      aria-label="PlantPal home"
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        void navigate({ to: '/today' });
      }}
    >
      {children}
    </a>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="32" height="32" viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
        <rect width="64" height="64" rx="16" className="fill-accent" />
        <path d="M32 52V30" stroke="var(--pp-on-accent)" strokeWidth="4" strokeLinecap="round" />
        <path d="M32 36c-1.5-9-8.5-14-17-14 0 9 6.5 15.5 17 14Z" fill="var(--pp-on-accent)" opacity="0.75" />
        <path d="M32 30c1.5-10 9.5-16 20-16 0 11-8 17.5-20 16Z" fill="var(--pp-on-accent)" />
      </svg>
      {!compact && <span className="font-display text-h3 text-ink">PlantPal</span>}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Onboarding and the plant-sitter page (no account, no garden) show without app navigation.
  const onboarding = pathname.startsWith('/welcome') || pathname === '/sit';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  return (
    <>
      <ThemeController />
      <UpdatePrompt />
      <a
        href="#main"
        className="fixed top-2 left-2 z-[60] -translate-y-20 rounded-full bg-accent px-4 py-2 text-body-s font-medium text-on-accent focus:translate-y-0"
      >
        {t.skipToContent}
      </a>

      <div
        className={cn(
          'min-h-dvh',
          !onboarding && 'md:grid md:grid-cols-[5.5rem_1fr] xl:grid-cols-[15rem_1fr]',
        )}
      >
        {!onboarding && (
          <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface md:flex">
            <div className="flex h-16 items-center justify-center px-4 xl:justify-start">
              <HomeLink className="rounded-md">
                <span className="xl:hidden">
                  <Logo compact />
                </span>
                <span className="hidden xl:inline">
                  <Logo />
                </span>
              </HomeLink>
            </div>
            <nav aria-label={t.nav.primary} className="flex flex-1 flex-col gap-1 px-3 py-2">
              {destinations.map((d) => {
                const active = isActive(d.to);
                return (
                  <Link
                    key={d.to}
                    to={d.to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-caption font-medium text-muted transition-colors hover:bg-sunken hover:text-ink xl:flex-row xl:gap-3 xl:px-3 xl:text-body-s',
                      active && 'bg-accent-soft text-accent-ink hover:bg-accent-soft hover:text-accent-ink',
                    )}
                  >
                    <d.icon
                      className="size-6 shrink-0 xl:size-5"
                      aria-hidden="true"
                      strokeWidth={active ? 2.25 : 1.75}
                    />
                    <span>{t.nav[d.key]}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="flex flex-col gap-1 border-t border-line px-3 py-3">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="flex items-center justify-center gap-3 rounded-lg px-2 py-2.5 text-body-s text-muted hover:bg-sunken hover:text-ink xl:justify-start xl:px-3"
                title={t.nav.commandPalette}
              >
                <Search className="size-5" aria-hidden="true" />
                <span className="sr-only flex-1 text-left xl:not-sr-only">Search</span>
                <span className="hidden gap-1 xl:flex" aria-hidden="true">
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </span>
              </button>
              <Link
                to="/settings"
                aria-current={isActive('/settings') ? 'page' : undefined}
                className={cn(
                  'flex items-center justify-center gap-3 rounded-lg px-2 py-2.5 text-body-s text-muted hover:bg-sunken hover:text-ink xl:justify-start xl:px-3',
                  isActive('/settings') && 'bg-accent-soft text-accent-ink',
                )}
              >
                <Settings className="size-5" aria-hidden="true" />
                <span className="hidden xl:inline">{t.nav.settings}</span>
                <span className="sr-only xl:hidden">{t.nav.settings}</span>
              </Link>
            </div>
          </aside>
        )}

        <div className="flex min-w-0 flex-col">
          {!onboarding && (
            <header className="safe-top sticky top-0 z-30 flex min-h-14 flex-wrap items-center justify-between gap-x-2 border-b border-line bg-bg/85 px-4 backdrop-blur-md md:hidden">
              <HomeLink>
                <Logo />
              </HomeLink>
              <div className="flex items-center gap-1">
                <IconButton label={t.nav.commandPalette} onClick={() => setPaletteOpen(true)}>
                  <Search className="size-5" aria-hidden="true" />
                </IconButton>
                <Link
                  to="/settings"
                  aria-label={t.nav.settings}
                  className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-sunken"
                >
                  <Settings className="size-5" aria-hidden="true" />
                </Link>
              </div>
            </header>
          )}

          <main
            id="main"
            tabIndex={-1}
            className={cn('flex-1 outline-none', !onboarding && 'pb-24 md:pb-10')}
          >
            {children}
          </main>
        </div>
      </div>

      {!onboarding && (
        <nav
          aria-label={t.nav.primary}
          className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md md:hidden"
        >
          <ul className="mx-auto grid max-w-lg grid-cols-5">
            {destinations.map((d) => {
              const active = isActive(d.to);
              return (
                <li key={d.to}>
                  <Link
                    to={d.to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-16 flex-col items-center justify-center gap-1 text-[0.75rem] font-medium text-muted',
                      active && 'text-accent-ink',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200',
                        active && 'bg-accent-soft',
                      )}
                    >
                      <d.icon className="size-5" aria-hidden="true" strokeWidth={active ? 2.25 : 1.75} />
                    </span>
                    {t.nav[d.key]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {!onboarding && <CaptureLauncher />}
      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </Suspense>
      )}
      <Toaster
        position="bottom-center"
        offset={88}
        mobileOffset={{ bottom: 88 }}
        toastOptions={{
          className: '!rounded-lg !border !border-line !bg-raised !text-ink !shadow-3 !font-sans',
          classNames: {
            // Sonner's default action button colours do not meet contrast on our surfaces.
            actionButton: '!bg-accent !text-on-accent !font-medium',
            cancelButton: '!bg-sunken !text-ink',
          },
        }}
      />
    </>
  );
}
