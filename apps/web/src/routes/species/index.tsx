import { createFileRoute, Link } from '@tanstack/react-router';
import { Badge, Card, PageHeader, Section, TaxonName, TextField } from '@plantpal/ui';
import { useMemo, useState } from 'react';
import { Page } from '../../app/Page';
import { useSpeciesDrafts } from '../../data/queries';
import { CATALOG_TAXA, taxonName } from '../../features/plan/engine';
import { useSpeciesT } from '../../features/species/messages';
import { SpeciesIntake } from '../../features/species/SpeciesIntake';
import { usePrefs } from '../../state/prefs';

export const Route = createFileRoute('/species/')({
  component: SpeciesIndex,
});

function SpeciesIndex() {
  const m = useSpeciesT();
  const locale = usePrefs((s) => s.locale);
  const drafts = useSpeciesDrafts();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...CATALOG_TAXA]
      .filter(
        (t) =>
          !needle ||
          t.scientificName.toLowerCase().includes(needle) ||
          Object.values(t.names).some((n) => n?.toLowerCase().includes(needle)),
      )
      .sort((a, b) => taxonName(a, locale).localeCompare(taxonName(b, locale)));
  }, [q, locale]);

  return (
    <Page>
      <PageHeader title={m.title} description={m.description} />
      <div className="mt-6 flex flex-col gap-8">
        <TextField label={m.search} type="search" value={q} onValueChange={setQ} className="max-w-md" />
        {list.length === 0 ? (
          <p className="text-body-s text-muted">{m.noResults}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="species-list">
            {list.map((t) => (
              <li key={t.id}>
                <Link
                  to="/species/$taxonKey"
                  params={{ taxonKey: t.id }}
                  className="flex flex-col rounded-lg border border-line bg-surface p-3 shadow-1 hover:bg-sunken"
                >
                  <span className="font-medium text-ink">{taxonName(t, locale)}</span>
                  <TaxonName scientificName={t.scientificName} className="text-body-s text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Section title={m.drafts} description={m.draftsHint} headingLevel={2}>
          {drafts && drafts.length > 0 && (
            <ul className="flex flex-col gap-2">
              {drafts.map((d) => (
                <li key={d.id}>
                  <Link
                    to="/species/drafts/$draftId"
                    params={{ draftId: d.id }}
                    className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 hover:bg-sunken"
                  >
                    <TaxonName scientificName={d.scientificName} className="flex-1 text-ink" />
                    <Badge tone="dusk">{m.aiDraft}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Card>
            <SpeciesIntake />
          </Card>
        </Section>
      </div>
    </Page>
  );
}
