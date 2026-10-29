import { createFileRoute } from '@tanstack/react-router';
import { taxonById } from '@plantpal/catalog';
import { sowMonths, sowWindows, trait } from '@plantpal/domain';
import { Badge, EmptyState, MagnifierLeafIllustration, PageHeader } from '@plantpal/ui';
import { Page } from '../../app/Page';
import { useActiveGarden, useSpecimens } from '../../data/queries';
import { gardenCoords, useClimateProfile } from '../../env/hooks';
import { useCareT } from '../../features/care/messages';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { monthName, taxonName } from '../../features/plan/engine';
import { usePrefs } from '../../state/prefs';

export const Route = createFileRoute('/plan/calendar')({
  component: CalendarPage,
});

/** Sowing and planting windows for planned and growing plants (§5.2 /plan/calendar, §6.15). */
function CalendarPage() {
  const m = useCareT();
  const locale = usePrefs((s) => s.locale);
  const { garden } = useActiveGarden();
  const specimens = useSpecimens(garden?.id);
  const coords = gardenCoords(garden);
  const climate = useClimateProfile(coords);

  if (garden === undefined || (garden && specimens === undefined))
    return (
      <Page>
        <GardenLoading />
      </Page>
    );
  if (garden === null)
    return (
      <Page>
        <NoGarden />
      </Page>
    );

  const measured = climate.data && climate.data.extremeMinC !== null ? climate.data : null;
  const windows = measured ? sowWindows(measured.months) : null;
  const lat =
    coords?.lat ?? (garden.hemisphere === 'south' ? -30 : garden.hemisphere === 'north' ? 30 : null);
  const seen = new Set<string>();
  const rows = (specimens ?? [])
    .filter((s) => (s.status === 'planned' || s.status === 'active') && s.catalogTaxonId)
    .flatMap((s) => {
      const t = s.catalogTaxonId ? taxonById(s.catalogTaxonId) : undefined;
      if (!t || seen.has(t.id)) return [];
      seen.add(t.id);
      const season = trait(t, 'sowSeason') ?? 'any';
      const months =
        season === 'any'
          ? Array.from({ length: 12 }, (_, i) => i)
          : windows && (season === 'warm' ? windows.warm : windows.cool).length > 0
            ? season === 'warm'
              ? windows.warm
              : windows.cool
            : sowMonths(season, lat);
      return [{ id: t.id, name: taxonName(t, locale), season, months: new Set(months) }];
    });

  return (
    <Page width="wide">
      <PageHeader title={m.calendar.title} description={m.calendar.description} />
      <p className="mt-2 text-caption text-muted">{windows ? m.calendar.basis : m.calendar.noClimate}</p>
      {rows.length === 0 ? (
        <EmptyState className="mt-8" illustration={<MagnifierLeafIllustration />} title={m.calendar.none} />
      ) : (
        <div className="mt-6">
          <table
            className="w-full table-fixed border-separate border-spacing-0.5 text-left text-body-s sm:border-spacing-1"
            data-testid="calendar"
          >
            <caption className="sr-only">{m.calendar.sow}</caption>
            <thead>
              <tr>
                <th scope="col" className="w-28 sm:w-48">
                  <span className="sr-only">{m.calendar.sow}</span>
                </th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} scope="col" className="text-center text-caption font-medium text-muted">
                    <abbr title={monthName(i, locale)} className="no-underline">
                      <span className="sm:hidden">{monthName(i, locale).slice(0, 1)}</span>
                      <span className="hidden sm:inline">{monthName(i, locale).slice(0, 3)}</span>
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="pr-1 font-normal sm:pr-2">
                    <span className="block truncate font-medium text-ink">{r.name}</span>
                    <Badge tone={r.season === 'warm' ? 'pollen' : r.season === 'cool' ? 'info' : 'neutral'}>
                      {r.season === 'warm'
                        ? m.calendar.warm
                        : r.season === 'cool'
                          ? m.calendar.cool
                          : m.calendar.any}
                    </Badge>
                  </th>
                  {Array.from({ length: 12 }, (_, i) => (
                    <td
                      key={i}
                      className={
                        r.months.has(i)
                          ? 'h-8 rounded-sm bg-accent-soft text-center text-accent-ink'
                          : 'h-8 rounded-sm bg-sunken'
                      }
                    >
                      {r.months.has(i) ? (
                        <span aria-label={`${m.calendar.sow}: ${monthName(i, locale)}`}>●</span>
                      ) : (
                        <span className="sr-only">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
