import { Badge, Button, Card, EmptyState, NumberInput, Spinner, TextField } from '@plantpal/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarDays, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { community, type CommunityEvent } from '../../community/api';
import { useFormat } from '../../i18n';
import { problemText } from './hooks';
import { useCommunityT } from './messages';

export const EVENTS_KEY = ['community-content', 'events'] as const;

/** `YYYY-MM-DDTHH:mm` in the device's time zone → epoch ms, or null. */
export function localInputToMs(v: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function Events() {
  const c = useCommunityT();
  const events = useQuery({ queryKey: EVENTS_KEY, queryFn: community.events });
  const [creating, setCreating] = useState(false);
  const list = events.data?.events ?? [];
  return (
    <div className="flex flex-col gap-4">
      {creating ? (
        <EventForm onDone={() => setCreating(false)} />
      ) : (
        <div>
          <Button icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => setCreating(true)}>
            {c.events.create}
          </Button>
        </div>
      )}
      {events.isPending ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState
          illustration={<CalendarDays className="size-14" strokeWidth={1.25} aria-hidden="true" />}
          title={c.events.empty}
          description={c.events.emptyBody}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label={c.tabs.events}>
          {list.map((e) => (
            <li key={e.id}>
              <EventCard event={e} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EventWhen({ event: e }: { event: Pick<CommunityEvent, 'startsAt' | 'endsAt'> }) {
  const fmt = useFormat();
  const start = new Date(e.startsAt);
  return (
    <time dateTime={start.toISOString()}>
      {fmt.date(start, { weekday: 'short', day: 'numeric', month: 'short' })} · {fmt.time(start)}–
      {fmt.time(new Date(e.endsAt))}
    </time>
  );
}

function EventCard({ event: e }: { event: CommunityEvent }) {
  const c = useCommunityT();
  return (
    <Link
      to="/community/events/$eventId"
      params={{ eventId: e.id }}
      className="flex h-full flex-col gap-1 rounded-lg border border-line bg-surface p-4 shadow-1 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus"
    >
      <span className="font-medium text-ink">{e.title}</span>
      <span className="text-body-s text-muted">
        <EventWhen event={e} />
      </span>
      <span className="text-body-s text-muted">{e.place}</span>
      <span className="mt-1 flex flex-wrap gap-2">
        {e.cancelledAt ? (
          <Badge tone="danger">{c.events.cancelled}</Badge>
        ) : (
          <Badge tone={e.mine ? 'accent' : 'neutral'}>{c.events.counts(e.going, e.maybe, e.capacity)}</Badge>
        )}
        {e.visibility === 'hidden' && <Badge tone="warning">{c.hidden}</Badge>}
      </span>
    </Link>
  );
}

function EventForm({ onDone }: { onDone: () => void }) {
  const c = useCommunityT();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  const [capacity, setCapacity] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const startsAt = localInputToMs(starts);
  const endsAt = localInputToMs(ends);
  const badTimes = startsAt !== null && endsAt !== null && endsAt <= startsAt;
  const ok = title.trim() && place.trim() && startsAt !== null && endsAt !== null && !badTimes;

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      await community.createEvent({
        title: title.trim(),
        body: body.trim(),
        place: place.trim(),
        startsAt: startsAt!,
        endsAt: endsAt!,
        capacity,
      });
      toast.success(c.events.created);
      await qc.invalidateQueries({ queryKey: EVENTS_KEY });
      onDone();
    } catch (e) {
      toast.error(problemText(e, c.failed));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <h3 className="text-body font-semibold text-ink">{c.events.create}</h3>
      <TextField label={c.events.what} value={title} onValueChange={setTitle} maxLength={120} required />
      <TextField label={c.events.place} value={place} onValueChange={setPlace} maxLength={120} required />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={c.events.starts}
          type="datetime-local"
          value={starts}
          onValueChange={setStarts}
          required
        />
        <TextField
          label={c.events.ends}
          type="datetime-local"
          value={ends}
          onValueChange={setEnds}
          min={starts || undefined}
          error={badTimes ? c.events.badTimes : undefined}
          required
        />
      </div>
      <NumberInput
        label={c.events.capacity}
        value={capacity}
        onValueChange={setCapacity}
        min={1}
        max={500}
        step={1}
      />
      <TextField
        label={c.events.body}
        value={body}
        onValueChange={setBody}
        maxLength={2000}
        multiline
        rows={3}
      />
      <div className="flex flex-wrap gap-2">
        <Button loading={busy} disabled={!ok} onClick={() => void save()}>
          {c.events.save}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {c.setup.close}
        </Button>
      </div>
    </Card>
  );
}
