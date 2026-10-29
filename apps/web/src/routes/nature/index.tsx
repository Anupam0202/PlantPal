import { createFileRoute, Link } from '@tanstack/react-router';
import { Card, PageHeader } from '@plantpal/ui';
import {
  Bird,
  BookOpen,
  Bug,
  ChevronRight,
  Eye,
  Flower2,
  Leaf,
  ListChecks,
  MapPin,
  NotebookTabs,
  Scale,
  ShieldQuestion,
  Thermometer,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import { useCareT } from '../../features/care/messages';
import { useNatureT } from '../../features/nature/messages';
import { useSpeciesT } from '../../features/species/messages';
import { Page } from '../../app/Page';
import { useT } from '../../i18n';

export const Route = createFileRoute('/nature/')({
  component: NatureIndex,
});

interface Entry {
  to: string;
  icon: LucideIcon;
  title: string;
  body: string;
  tone: string;
}

function Group({ title, items }: { title: string; items: Entry[] }) {
  return (
    <section className="mt-6" aria-label={title}>
      <h2 className="mb-2 text-body-s font-semibold tracking-wide text-muted uppercase">{title}</h2>
      <Card padding="none">
        {items.map((e, i) => (
          <Link
            key={e.to}
            to={e.to}
            className={`flex min-h-16 items-center gap-3 rounded-lg p-4 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus ${
              i > 0 ? 'border-t border-line' : ''
            }`}
          >
            <e.icon className={`size-6 shrink-0 ${e.tone}`} aria-hidden="true" />
            <span className="flex-1">
              <span className="block font-semibold text-ink">{e.title}</span>
              <span className="block text-body-s text-muted">{e.body}</span>
            </span>
            <ChevronRight className="size-5 text-subtle" aria-hidden="true" />
          </Link>
        ))}
      </Card>
    </section>
  );
}

function NatureIndex() {
  const t = useT();
  const m = useCareT();
  const sm = useSpeciesT();
  const n = useNatureT();
  return (
    <Page>
      <PageHeader title={t.nature.title} />
      <Group
        title={n.hub.log}
        items={[
          {
            to: '/nature/count',
            icon: Bug,
            title: n.hub.count,
            body: n.hub.countBody,
            tone: 'text-accent-ink',
          },
          {
            to: '/nature/birds',
            icon: Bird,
            title: n.hub.birds,
            body: n.hub.birdsBody,
            tone: 'text-accent-ink',
          },
          {
            to: '/nature/sighting',
            icon: Eye,
            title: n.hub.sighting,
            body: n.hub.sightingBody,
            tone: 'text-accent-ink',
          },
          {
            to: '/nature/phenology',
            icon: ListChecks,
            title: n.hub.phenology,
            body: n.hub.phenologyBody,
            tone: 'text-accent-ink',
          },
          {
            to: '/nature/log',
            icon: NotebookTabs,
            title: n.hub.log,
            body: n.hub.logBody,
            tone: 'text-accent-ink',
          },
        ]}
      />
      <Group
        title={t.nature.title}
        items={[
          {
            to: '/nature/bloom',
            icon: Flower2,
            title: n.hub.bloom,
            body: n.hub.bloomBody,
            tone: 'text-clay',
          },
          {
            to: '/nature/lens',
            icon: ShieldQuestion,
            title: n.hub.lens,
            body: n.hub.lensBody,
            tone: 'text-clay',
          },
          {
            to: '/nature/nearby',
            icon: MapPin,
            title: n.hub.nearby,
            body: n.hub.nearbyBody,
            tone: 'text-clay',
          },
          {
            to: '/nature/climate',
            icon: Thermometer,
            title: m.climate.title,
            body: m.climate.description,
            tone: 'text-clay',
          },
          { to: '/species', icon: BookOpen, title: sm.title, body: sm.description, tone: 'text-clay' },
        ]}
      />
      <Group
        title={n.hub.impact}
        items={[
          {
            to: '/garden/harvest',
            icon: Wheat,
            title: n.hub.harvest,
            body: n.hub.harvestBody,
            tone: 'text-ink',
          },
          {
            to: '/nature/impact',
            icon: Scale,
            title: n.hub.impact,
            body: n.hub.impactBody,
            tone: 'text-ink',
          },
        ]}
      />
      <p className="mt-6 flex items-center gap-2 text-caption text-muted">
        <Leaf className="size-4" aria-hidden="true" />
        {n.fit.credit}
      </p>
    </Page>
  );
}
