import type { Specimen } from '@plantpal/schemas';
import { Badge, buttonClasses, Section } from '@plantpal/ui';
import { Link } from '@tanstack/react-router';
import { HeartPulse } from 'lucide-react';
import { useHealthCases } from '../../data/queries';
import { useFormat } from '../../i18n';
import { useHealthT } from './messages';

/** Health cases for one plant, with a link to start a new one (§6.8). */
export function PlantHealth({ specimen }: { specimen: Specimen }) {
  const m = useHealthT();
  const fmt = useFormat();
  const cases = (useHealthCases(specimen.gardenId) ?? []).filter((c) => c.specimenId === specimen.id);
  return (
    <Section
      title={m.plantHealth}
      headingLevel={2}
      action={
        <Link
          to="/garden/health/new"
          search={{ plant: specimen.id }}
          className={buttonClasses('secondary', 'sm')}
        >
          <HeartPulse className="size-4" aria-hidden="true" />
          {m.newCase}
        </Link>
      }
    >
      {cases.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-body-s">
          {cases.map((c) => (
            <li key={c.id}>
              <Link
                to="/garden/health/$caseId"
                params={{ caseId: c.id }}
                className="inline-flex items-center gap-2 text-accent-ink underline"
              >
                {m.opened(fmt.date(new Date(c.openedAt)))}
              </Link>{' '}
              <Badge tone={c.status === 'closed' ? 'neutral' : 'warning'}>{m.status[c.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
