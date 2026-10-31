import {
  Badge,
  Button,
  buttonClasses,
  Card,
  EmptyState,
  PageHeader,
  SegmentedControl,
  Spinner,
} from '@plantpal/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../../app/Page';
import { community, type CommunityEvent } from '../../../community/api';
import { CommunityGate, type Member } from '../../../features/community/CommunityGate';
import { EVENTS_KEY, EventWhen } from '../../../features/community/Events';
import { problemText } from '../../../features/community/hooks';
import { useCommunityT } from '../../../features/community/messages';
import { BlockButton, ReportButton } from '../../../features/community/Safety';
import { useT } from '../../../i18n';
import { ApiError } from '../../../sync/api';

export const Route = createFileRoute('/community/events/$eventId')({
  component: EventPage,
});

type Answer = 'going' | 'maybe' | 'no';

function EventPage() {
  const c = useCommunityT();
  return (
    <Page width="narrow">
      <Link to="/community" search={{ tab: 'events' }} className={buttonClasses('ghost', 'sm')}>
        <ChevronLeft className="size-4" aria-hidden="true" />
        {c.events.back}
      </Link>
      <CommunityGate>{(me) => <EventDetail me={me} />}</CommunityGate>
    </Page>
  );
}

function EventDetail({ me }: { me: Member }) {
  const t = useT();
  const c = useCommunityT();
  const qc = useQueryClient();
  const { eventId } = Route.useParams();
  const key = [...EVENTS_KEY, eventId];
  const q = useQuery({ queryKey: key, queryFn: () => community.event(eventId), retry: false });
  const [busy, setBusy] = useState(false);

  if (q.isPending) return <Spinner />;
  if (q.isError || !q.data)
    return (
      <EmptyState
        className="mt-6"
        title={q.error instanceof ApiError && q.error.status === 404 ? t.notFound.title : c.failed}
        description={q.error instanceof ApiError && q.error.status === 404 ? t.notFound.body : undefined}
      />
    );
  const e = q.data.event;
  const mine = e.organiserId === me.profile.userId;

  const update = (ev: CommunityEvent) => {
    qc.setQueryData(key, { event: ev });
    void qc.invalidateQueries({ queryKey: EVENTS_KEY, exact: true });
  };
  const answer = async (a: Answer) => {
    setBusy(true);
    try {
      update((await community.rsvp(e.id, a === 'no' ? null : a)).event);
    } catch (err) {
      toast.error(problemText(err, c.failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={e.title} eyebrow={c.events.organiser(e.organiserName)} />
      <div className="mt-6 flex flex-col gap-4">
        <Card className="flex flex-col gap-2">
          <p className="text-body text-ink">
            <EventWhen event={e} />
          </p>
          <p className="text-body-s text-muted">{e.place}</p>
          <div className="flex flex-wrap gap-2">
            {e.cancelledAt ? (
              <Badge tone="danger">{c.events.cancelled}</Badge>
            ) : (
              <Badge>{c.events.counts(e.going, e.maybe, e.capacity)}</Badge>
            )}
            {e.visibility === 'hidden' && <Badge tone="warning">{c.hidden}</Badge>}
          </div>
          {e.body && (
            <p className="mt-2 text-body whitespace-pre-line text-ink [overflow-wrap:anywhere]">{e.body}</p>
          )}
        </Card>
        {!e.cancelledAt && e.visibility === 'visible' && (
          <Card className="flex flex-col gap-3">
            <h2 className="text-body font-semibold text-ink">{c.events.rsvp}</h2>
            <SegmentedControl<Answer>
              label={c.events.rsvp}
              value={e.mine ?? 'no'}
              onValueChange={(a) => {
                if (!busy) void answer(a);
              }}
              options={[
                { value: 'going', label: c.events.going },
                { value: 'maybe', label: c.events.maybe },
                { value: 'no', label: c.events.notGoing },
              ]}
            />
          </Card>
        )}
        <div className="-ml-2 flex flex-wrap gap-1">
          {mine && !e.cancelledAt && (
            <Button
              variant="danger-soft"
              size="sm"
              onClick={async () => {
                try {
                  await community.cancelEvent(e.id);
                  toast(c.events.cancelDone);
                  await qc.invalidateQueries({ queryKey: EVENTS_KEY });
                } catch (err) {
                  toast.error(problemText(err, c.failed));
                }
              }}
            >
              {c.events.cancel}
            </Button>
          )}
          {!mine && (
            <>
              <ReportButton type="event" id={e.id} />
              <BlockButton userId={e.organiserId} name={e.organiserName} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
