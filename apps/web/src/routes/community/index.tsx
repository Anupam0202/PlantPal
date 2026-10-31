import { buttonClasses, Button, Card, PageHeader, Tabs } from '@plantpal/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ShieldCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Page } from '../../app/Page';
import { CommunityGate, type Member } from '../../features/community/CommunityGate';
import { CommunityMap } from '../../features/community/CommunityMap';
import { Events } from '../../features/community/Events';
import { Exchange } from '../../features/community/Exchange';
import { Feed } from '../../features/community/Feed';
import { useCommunityT } from '../../features/community/messages';
import { useMapT } from '../../features/maps/messages';
import { ProfileForm } from '../../features/community/ProfileForm';
import { BlockedPeople } from '../../features/community/Safety';
import { useT } from '../../i18n';

type Tab = 'feed' | 'events' | 'exchange' | 'map';
const TABS: Tab[] = ['feed', 'events', 'exchange', 'map'];

export const Route = createFileRoute('/community/')({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) ? { tab: search.tab as Tab } : {},
  component: CommunityIndex,
});

function CommunityIndex() {
  const t = useT();
  return (
    <Page>
      <PageHeader title={t.community.title} />
      <CommunityGate>{(me) => <CommunityHome me={me} />}</CommunityGate>
    </Page>
  );
}

function CommunityHome({ me }: { me: Member }) {
  const t = useT();
  const c = useCommunityT();
  const mt = useMapT();
  const navigate = Route.useNavigate();
  const { tab = 'feed' } = Route.useSearch();
  const [editing, setEditing] = useState(false);
  return (
    <div className="mt-2 flex flex-col gap-4">
      <p className="text-body-s text-muted">{c.intro}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<UserRound className="size-4" aria-hidden="true" />}
          aria-expanded={editing}
          onClick={() => setEditing((v) => !v)}
        >
          {c.setup.edit}
        </Button>
        {me.staff && (
          <Link to="/admin" className={buttonClasses('ghost', 'sm')}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            {c.admin.link}
          </Link>
        )}
      </div>
      {editing && (
        <div className="flex flex-col gap-3">
          <ProfileForm profile={me.profile} onDone={() => setEditing(false)} />
          <Card>
            <BlockedPeople />
          </Card>
        </div>
      )}
      <Tabs<Tab>
        label={t.community.title}
        value={tab}
        onValueChange={(next) => void navigate({ search: { tab: next }, replace: true })}
        items={[
          { value: 'feed', label: c.tabs.feed, content: tab === 'feed' && <Feed me={me} /> },
          { value: 'events', label: c.tabs.events, content: tab === 'events' && <Events /> },
          { value: 'exchange', label: c.tabs.exchange, content: tab === 'exchange' && <Exchange /> },
          { value: 'map', label: mt.community.tab, content: tab === 'map' && <CommunityMap /> },
        ]}
      />
    </div>
  );
}
