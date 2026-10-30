import {
  Badge,
  Button,
  buttonClasses,
  Card,
  EmptyState,
  Notice,
  PageHeader,
  Spinner,
  TextField,
} from '@plantpal/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Page } from '../../../app/Page';
import { community, type ListingAction, type ListingView, type Question } from '../../../community/api';
import { CommunityGate, type Member } from '../../../features/community/CommunityGate';
import { LISTINGS_KEY, stateTone } from '../../../features/community/Exchange';
import { problemText } from '../../../features/community/hooks';
import { useCommunityT } from '../../../features/community/messages';
import { BlockButton, ReportButton } from '../../../features/community/Safety';
import { useFormat, useT } from '../../../i18n';
import { ApiError } from '../../../sync/api';

export const Route = createFileRoute('/community/exchange/$listingId')({
  component: ListingPage,
});

function ListingPage() {
  const c = useCommunityT();
  return (
    <Page width="narrow">
      <Link to="/community" search={{ tab: 'exchange' }} className={buttonClasses('ghost', 'sm')}>
        <ChevronLeft className="size-4" aria-hidden="true" />
        {c.listing.back}
      </Link>
      <CommunityGate>{(me) => <ListingDetail me={me} />}</CommunityGate>
    </Page>
  );
}

function ListingDetail({ me }: { me: Member }) {
  const t = useT();
  const c = useCommunityT();
  const fmt = useFormat();
  const qc = useQueryClient();
  const { listingId } = Route.useParams();
  const key = [...LISTINGS_KEY, 'one', listingId];
  const q = useQuery({ queryKey: key, queryFn: () => community.listing(listingId), retry: false });
  const [busy, setBusy] = useState<ListingAction | null>(null);

  if (q.isPending) return <Spinner />;
  if (q.isError || !q.data)
    return (
      <EmptyState
        className="mt-6"
        title={q.error instanceof ApiError && q.error.status === 404 ? t.notFound.title : c.failed}
        description={q.error instanceof ApiError && q.error.status === 404 ? t.notFound.body : undefined}
      />
    );
  const view = q.data;
  const { listing: l, role, reservation: r } = view;

  const show = (v: ListingView) => {
    qc.setQueryData(key, v);
    void qc.invalidateQueries({ queryKey: LISTINGS_KEY, exact: false, refetchType: 'none' });
  };
  const act = async (action: ListingAction) => {
    setBusy(action);
    try {
      show(await community.act(l.id, action));
      toast.success(action === 'complete' ? c.listing.completed : c.listing.updated);
    } catch (e) {
      toast.error(problemText(e, c.failed));
      void q.refetch();
    } finally {
      setBusy(null);
    }
  };
  const actButton = (
    action: ListingAction,
    label: string,
    variant: 'primary' | 'secondary' | 'danger-soft' = 'secondary',
  ) => (
    <Button
      key={action}
      variant={variant}
      loading={busy === action}
      disabled={busy !== null}
      onClick={() => void act(action)}
    >
      {label}
    </Button>
  );

  const activeParty = r && r.state === 'active' && role !== null;
  const myConfirmed = r ? (role === 'owner' ? r.ownerConfirmed : r.requesterConfirmed) : false;
  const theirConfirmed = r ? (role === 'owner' ? r.requesterConfirmed : r.ownerConfirmed) : false;
  const actions: ReactNode[] = [];
  if (role === 'owner') {
    if (l.state === 'draft') actions.push(actButton('publish', c.listing.publish, 'primary'));
    if (l.state === 'draft' || l.state === 'listed')
      actions.push(actButton('withdraw', c.listing.withdraw, 'danger-soft'));
    if (l.state === 'reserved') actions.push(actButton('release', c.listing.release, 'danger-soft'));
  }
  if (role === 'requester' && l.state === 'reserved' && activeParty)
    actions.push(actButton('cancel', c.listing.cancel, 'danger-soft'));
  if (activeParty && l.state === 'reserved' && !myConfirmed)
    actions.unshift(actButton('confirm', c.listing.confirm, 'primary'));
  if (activeParty && l.state === 'handoff_confirmed')
    actions.unshift(actButton('complete', c.listing.complete, 'primary'));
  if (role === null && l.state === 'listed') actions.push(actButton('reserve', c.listing.reserve, 'primary'));

  const facts: Array<[string, string]> = [
    ...(l.scientificName ? [[c.listing.species, l.scientificName] as [string, string]] : []),
    ...(l.quantity ? [[c.listing.quantity, l.quantity] as [string, string]] : []),
    ...(l.pickup ? [[c.listing.pickup, l.pickup] as [string, string]] : []),
  ];

  return (
    <>
      <PageHeader title={l.title} eyebrow={c.kinds[l.kind]} description={c.listing.by(l.ownerName)} />
      <div className="mt-6 flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone={stateTone(l.state)} data-testid="listing-state">
              {c.states[l.state]}
            </Badge>
            {l.visibility === 'hidden' && <Badge tone="warning">{c.hidden}</Badge>}
          </div>
          {facts.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-s">
              {facts.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-ink [overflow-wrap:anywhere]">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {l.body && (
            <p className="text-body whitespace-pre-line text-ink [overflow-wrap:anywhere]">{l.body}</p>
          )}
          {l.state === 'listed' && (
            <p className="text-caption text-muted">
              {c.exchange.until(fmt.date(new Date(l.expiresAt), { dateStyle: 'medium' }))}
            </p>
          )}
        </Card>

        {role === null && (l.state === 'reserved' || l.state === 'handoff_confirmed') && (
          <Notice>{c.listing.taken}</Notice>
        )}
        {role === 'requester' && activeParty && l.state === 'reserved' && (
          <Notice tone="success" title={c.listing.yours}>
            {c.listing.heldUntil(
              fmt.date(new Date(r.expiresAt), { dateStyle: 'medium', timeStyle: 'short' }),
            )}
          </Notice>
        )}
        {l.state === 'completed' && role !== null && <Notice tone="success">{c.listing.completed}</Notice>}
        {activeParty && (myConfirmed || theirConfirmed) && l.state === 'reserved' && (
          <p className="text-body-s text-muted">
            {[myConfirmed && c.listing.confirmedMe, theirConfirmed && c.listing.confirmedOther]
              .filter(Boolean)
              .join(' ')}
          </p>
        )}

        {actions.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">{actions}</div>
            {role === null && l.state === 'listed' && (
              <p className="text-caption text-muted">{c.listing.reserveHint}</p>
            )}
          </div>
        )}

        {r && role !== null && (r.state === 'active' || r.state === 'completed') && (
          <ContactCard listingId={l.id} view={view} onChange={show} />
        )}

        <Questions view={view} me={me} onAsked={() => void q.refetch()} />

        {role !== 'owner' && (
          <div className="-ml-2 flex flex-wrap gap-1">
            <ReportButton type="listing" id={l.id} />
            <BlockButton userId={l.ownerId} name={l.ownerName} onDone={() => void q.refetch()} />
          </div>
        )}
        <p className="text-caption text-muted">{c.exchange.biosecurity}</p>
      </div>
    </>
  );
}

/** Contact notes are revealed only once both parties have shared one (mutual consent, §20). */
function ContactCard({
  listingId,
  view,
  onChange,
}: {
  listingId: string;
  view: ListingView;
  onChange: (v: ListingView) => void;
}) {
  const c = useCommunityT();
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const r = view.reservation!;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-body font-semibold text-ink">
        {r.contacts ? c.listing.contacts : c.listing.contactTitle}
      </h2>
      {r.contacts ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-s" data-testid="contacts">
          <dt className="text-muted">{c.listing.ownerContact}</dt>
          <dd className="text-ink [overflow-wrap:anywhere]">{r.contacts.owner}</dd>
          <dt className="text-muted">{c.listing.requesterContact}</dt>
          <dd className="text-ink [overflow-wrap:anywhere]">{r.contacts.requester}</dd>
        </dl>
      ) : r.mySharedContact ? (
        <p className="text-body-s text-muted">{c.listing.contactShared}</p>
      ) : (
        <>
          <p className="text-body-s text-muted">{c.listing.contactHint}</p>
          <TextField
            label={c.listing.contactLabel}
            value={contact}
            onValueChange={setContact}
            maxLength={200}
          />
          <div>
            <Button
              size="sm"
              loading={busy}
              disabled={!contact.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  onChange(await community.contact(listingId, contact.trim()));
                } catch (e) {
                  toast.error(problemText(e, c.failed));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {c.listing.share}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function Questions({ view, me, onAsked }: { view: ListingView; me: Member; onAsked: () => void }) {
  const c = useCommunityT();
  const top = view.questions.filter((q) => q.parentId === null);
  const replies = (id: string) => view.questions.filter((q) => q.parentId === id);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="questions-heading">
      <h2 id="questions-heading" className="text-h3 text-ink">
        {c.listing.questions}
      </h2>
      {top.length === 0 && <p className="text-body-s text-muted">{c.listing.questionsEmpty}</p>}
      <ul className="flex flex-col gap-3">
        {top.map((q) => (
          <li key={q.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <QuestionText q={q} mine={q.authorId === me.profile.userId} />
            {replies(q.id).length > 0 && (
              <ul className="flex flex-col gap-2 border-l-2 border-line pl-3">
                {replies(q.id).map((a) => (
                  <li key={a.id}>
                    <QuestionText q={a} mine={a.authorId === me.profile.userId} />
                  </li>
                ))}
              </ul>
            )}
            <AskForm listingId={view.listing.id} parentId={q.id} onAsked={onAsked} />
          </li>
        ))}
      </ul>
      <AskForm listingId={view.listing.id} parentId={null} onAsked={onAsked} />
    </section>
  );
}

function QuestionText({ q, mine }: { q: Question; mine: boolean }) {
  const c = useCommunityT();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption font-medium text-muted">{q.authorName}</span>
      {q.visibility === 'hidden' && (
        <Badge tone="warning" className="self-start">
          {c.hidden}
        </Badge>
      )}
      <p className="text-body-s whitespace-pre-line text-ink [overflow-wrap:anywhere]">{q.body}</p>
      {!mine && (
        <div className="-ml-2">
          <ReportButton type="question" id={q.id} />
        </div>
      )}
    </div>
  );
}

function AskForm({
  listingId,
  parentId,
  onAsked,
}: {
  listingId: string;
  parentId: string | null;
  onAsked: () => void;
}) {
  const c = useCommunityT();
  const [open, setOpen] = useState(parentId === null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <div>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          {c.listing.reply}
        </Button>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <TextField
        label={parentId ? c.listing.replyLabel : c.listing.askLabel}
        value={body}
        onValueChange={setBody}
        maxLength={1000}
        multiline
        rows={2}
      />
      <div>
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          disabled={!body.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await community.ask(listingId, body.trim(), parentId);
              setBody('');
              if (parentId) setOpen(false);
              toast.success(c.listing.sent);
              onAsked();
            } catch (e) {
              toast.error(problemText(e, c.failed));
            } finally {
              setBusy(false);
            }
          }}
        >
          {c.listing.send}
        </Button>
      </div>
    </div>
  );
}
