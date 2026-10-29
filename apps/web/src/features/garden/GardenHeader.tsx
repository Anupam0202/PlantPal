import { Link, useRouterState } from '@tanstack/react-router';
import { buttonClasses, cn, PageHeader, SelectField } from '@plantpal/ui';
import type { Garden } from '@plantpal/schemas';
import { Plus, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { setActiveGarden } from '../../data/commands';
import { useT } from '../../i18n';

const TABS = [
  { to: '/garden', key: 'tabPlants' },
  { to: '/garden/spaces', key: 'tabSpaces' },
  { to: '/garden/journal', key: 'tabJournal' },
  { to: '/garden/health', key: 'tabHealth' },
] as const;

/** Garden title, switcher and section tabs shared by the garden pages. */
export function GardenHeader({
  garden,
  gardens,
  actions,
}: {
  garden: Garden;
  gardens: Garden[];
  actions?: ReactNode;
}) {
  const t = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={garden.place?.label ?? undefined}
        title={garden.name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <Link
              to="/garden/edit"
              className={buttonClasses('ghost', 'icon')}
              aria-label={t.garden.settings}
              title={t.garden.settings}
            >
              <Settings2 className="size-5" aria-hidden="true" />
            </Link>
          </div>
        }
      />
      {gardens.length > 1 && (
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label={t.garden.switchGarden}
            value={garden.id}
            onValueChange={(id) => void setActiveGarden(id)}
            options={gardens.map((g) => ({ value: g.id, label: g.name }))}
            className="min-w-56"
          />
          <Link to="/garden/new" className={buttonClasses('ghost', 'sm')}>
            <Plus className="size-4" aria-hidden="true" />
            {t.garden.newGarden}
          </Link>
        </div>
      )}
      <nav aria-label={t.garden.sections} className="-mx-1 overflow-x-auto">
        <ul className="flex gap-1 border-b border-line px-1">
          {TABS.map((tab) => {
            const active =
              tab.to === '/garden'
                ? pathname === '/garden' || pathname === '/garden/'
                : pathname.startsWith(tab.to);
            return (
              <li key={tab.to}>
                <Link
                  to={tab.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    '-mb-px inline-flex h-11 items-center border-b-2 px-3 text-body-s font-medium',
                    active ? 'border-accent text-accent-ink' : 'border-transparent text-muted hover:text-ink',
                  )}
                  activeOptions={{ exact: true }}
                >
                  {t.garden[tab.key]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
