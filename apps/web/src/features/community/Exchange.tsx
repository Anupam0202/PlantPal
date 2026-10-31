import { Badge, Button, Card, EmptyState, SelectField, Spinner, TextField } from '@plantpal/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus, Sprout } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { community, type Listing, type ListingKind, type ListingState } from '../../community/api';
import { problemText } from './hooks';
import { useCommunityT } from './messages';

export const LISTINGS_KEY = ['community-content', 'listings'] as const;
const KINDS: ListingKind[] = ['seeds', 'cuttings', 'seedlings', 'produce', 'tools'];
const ALL = '__all';

export const stateTone = (s: ListingState) =>
  s === 'listed' ? 'accent' : s === 'reserved' || s === 'handoff_confirmed' ? 'info' : 'neutral';

export function Exchange() {
  const c = useCommunityT();
  const [kind, setKind] = useState<ListingKind | typeof ALL>(ALL);
  const [creating, setCreating] = useState(false);
  const listings = useQuery({
    queryKey: [...LISTINGS_KEY, kind],
    queryFn: () => community.listings(kind === ALL ? undefined : kind),
  });
  const list = listings.data?.listings ?? [];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-s text-muted">{c.exchange.intro}</p>
      {creating ? (
        <ListingForm onDone={() => setCreating(false)} />
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Button icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => setCreating(true)}>
            {c.exchange.create}
          </Button>
          <SelectField<ListingKind | typeof ALL>
            label={c.exchange.filter}
            value={kind}
            onValueChange={setKind}
            className="min-w-44"
            options={[
              { value: ALL, label: c.exchange.all },
              ...KINDS.map((k) => ({ value: k, label: c.kinds[k] })),
            ]}
          />
        </div>
      )}
      {listings.isPending ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState
          illustration={<Sprout className="size-14" strokeWidth={1.25} aria-hidden="true" />}
          title={c.exchange.empty}
          description={c.exchange.emptyBody}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label={c.tabs.exchange}>
          {list.map((l) => (
            <li key={l.id}>
              <ListingCard listing={l} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListingCard({ listing: l }: { listing: Listing }) {
  const c = useCommunityT();
  return (
    <Link
      to="/community/exchange/$listingId"
      params={{ listingId: l.id }}
      className="flex h-full flex-col gap-1 rounded-lg border border-line bg-surface p-4 shadow-1 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus"
    >
      <span className="font-medium text-ink">{l.title}</span>
      <span className="text-body-s text-muted">
        {c.kinds[l.kind]}
        {l.quantity && ` · ${l.quantity}`} · {l.ownerName}
      </span>
      <span className="mt-1 flex flex-wrap gap-2">
        <Badge tone={stateTone(l.state)}>{c.states[l.state]}</Badge>
        {l.visibility === 'hidden' && <Badge tone="warning">{c.hidden}</Badge>}
      </span>
    </Link>
  );
}

function ListingForm({ onDone }: { onDone: () => void }) {
  const c = useCommunityT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [kind, setKind] = useState<ListingKind>('seeds');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [pickup, setPickup] = useState('');
  const [busy, setBusy] = useState<'publish' | 'draft' | null>(null);
  const sci = scientificName.trim();
  const ok = title.trim().length > 0 && (sci.length === 0 || sci.length >= 3);

  const save = async (publish: boolean) => {
    if (!ok) return;
    setBusy(publish ? 'publish' : 'draft');
    try {
      const r = await community.createListing({
        kind,
        title: title.trim(),
        body: body.trim(),
        scientificName: sci || null,
        quantity: quantity.trim(),
        pickup: pickup.trim(),
        publish,
      });
      toast.success(c.exchange.created);
      await qc.invalidateQueries({ queryKey: LISTINGS_KEY });
      onDone();
      await navigate({ to: '/community/exchange/$listingId', params: { listingId: r.id } });
    } catch (e) {
      toast.error(problemText(e, c.failed));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <h3 className="text-body font-semibold text-ink">{c.exchange.create}</h3>
      <SelectField<ListingKind>
        label={c.exchange.kind}
        value={kind}
        onValueChange={setKind}
        options={KINDS.map((k) => ({ value: k, label: c.kinds[k] }))}
      />
      <TextField label={c.exchange.what} value={title} onValueChange={setTitle} maxLength={120} required />
      <TextField
        label={c.exchange.body}
        value={body}
        onValueChange={setBody}
        maxLength={2000}
        multiline
        rows={3}
      />
      <TextField
        label={c.exchange.scientificName}
        value={scientificName}
        onValueChange={setScientificName}
        maxLength={120}
      />
      <TextField label={c.exchange.quantity} value={quantity} onValueChange={setQuantity} maxLength={60} />
      <TextField label={c.exchange.pickup} value={pickup} onValueChange={setPickup} maxLength={200} />
      <p className="text-caption text-muted">{c.exchange.biosecurity}</p>
      <div className="flex flex-wrap gap-2">
        <Button loading={busy === 'publish'} disabled={!ok || busy !== null} onClick={() => void save(true)}>
          {c.exchange.publish}
        </Button>
        <Button
          variant="secondary"
          loading={busy === 'draft'}
          disabled={!ok || busy !== null}
          onClick={() => void save(false)}
        >
          {c.exchange.draft}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {c.setup.close}
        </Button>
      </div>
    </Card>
  );
}
