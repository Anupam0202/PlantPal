import { todayIn } from '@plantpal/domain';
import {
  Badge,
  Button,
  buttonClasses,
  Card,
  EmptyState,
  NumberInput,
  PageHeader,
  Section,
  TextField,
} from '@plantpal/ui';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, Plus, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../../app/Page';
import { community } from '../../../community/api';
import { addGerminationTest, deleteSeedLot } from '../../../data/commands';
import { useGarden, useSeedLot, useSpecimens } from '../../../data/queries';
import { useCommunity } from '../../../features/community/hooks';
import { reportError } from '../../../features/garden/errors';
import { GardenLoading } from '../../../features/garden/NoGarden';
import { rateLabel, useSeedT } from '../../../features/garden/seedMessages';
import { useFormat, useT } from '../../../i18n';
import { ApiError } from '../../../sync/api';

export const Route = createFileRoute('/garden/seeds/$lotId')({
  component: SeedLotPage,
});

function SeedLotPage() {
  const t = useT();
  const s = useSeedT();
  const fmt = useFormat();
  const navigate = useNavigate();
  const { lotId } = Route.useParams();
  const lot = useSeedLot(lotId);
  const garden = useGarden(lot?.gardenId);
  const specimens = useSpecimens(lot?.gardenId);
  const [testedOn, setTestedOn] = useState('');
  const [sown, setSown] = useState<number | null>(null);
  const [sprouted, setSprouted] = useState<number | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [offering, setOffering] = useState(false);
  // The exchange is offered only where the community is on and this person has a profile.
  const communityState = useCommunity();
  const canOffer = communityState.kind === 'ready' && communityState.profile !== null;

  if (lot === undefined || (lot && (garden === undefined || !specimens)))
    return (
      <Page width="narrow">
        <GardenLoading />
      </Page>
    );
  if (lot === null || lot.deletedAt !== null || !garden)
    return (
      <Page width="narrow">
        <EmptyState title={t.notFound.title} description={t.notFound.body} />
      </Page>
    );

  const today = todayIn(garden.timezone);
  const fromPlant = specimens?.find((p) => p.id === lot.specimenId);
  const grown = specimens?.filter((p) => p.seedLotId === lot.id && p.deletedAt === null) ?? [];
  const validTest =
    /^\d{4}-\d{2}-\d{2}$/.test(testedOn) && (sown ?? 0) > 0 && sprouted !== null && sprouted <= (sown ?? 0);

  const addTest = async () => {
    if (!validTest) return;
    setBusy(true);
    try {
      await addGerminationTest(lot.id, lot.version, { testedOn, sown: sown!, sprouted: sprouted!, days });
      toast.success(s.testSaved);
      setSown(null);
      setSprouted(null);
      setDays(null);
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(false);
    }
  };

  const offer = async () => {
    setOffering(true);
    try {
      const r = await community.createListing({
        kind: 'seeds',
        title: lot.name,
        body: [
          lot.cultivar,
          lot.collectedOn ? `${s.collectedOn}: ${lot.collectedOn}` : null,
          rateLabel(s, lot),
        ]
          .filter(Boolean)
          .join(' · '),
        scientificName: lot.scientificName,
        quantity: lot.quantity !== null ? `${lot.quantity} ${s.units[lot.unit]}` : '',
        pickup: '',
        publish: true,
      });
      toast.success(s.offered);
      await navigate({ to: '/community/exchange/$listingId', params: { listingId: r.id } });
    } catch (e) {
      toast.error(e instanceof ApiError && e.message ? e.message : s.offerFailed);
    } finally {
      setOffering(false);
    }
  };

  const facts: Array<[string, string]> = [
    [s.origin, fromPlant ? `${s.origins.saved}: ${fromPlant.displayName}` : s.origins[lot.origin]],
    ...(lot.collectedOn
      ? [[s.collectedOn, fmt.date(new Date(`${lot.collectedOn}T12:00:00Z`))] as [string, string]]
      : []),
    ...(lot.quantity !== null
      ? [[s.quantity, `${fmt.number(lot.quantity)} ${s.units[lot.unit]}`] as [string, string]]
      : []),
    ...(lot.storage ? [[s.storage, lot.storage] as [string, string]] : []),
  ];

  return (
    <Page width="narrow">
      <Link to="/garden/seeds" className={buttonClasses('ghost', 'sm')}>
        <ChevronLeft className="size-4" aria-hidden="true" />
        {s.title}
      </Link>
      <PageHeader title={lot.name} eyebrow={s.lot} description={lot.scientificName ?? undefined} />
      <div className="mt-6 flex flex-col gap-6">
        <Card>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-s">
            {facts.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          {lot.notes && <p className="mt-3 whitespace-pre-line text-body-s text-ink">{lot.notes}</p>}
        </Card>

        <Section title={s.germination} headingLevel={2}>
          <Badge tone={lot.germinationTests.length ? 'accent' : 'neutral'}>{rateLabel(s, lot)}</Badge>
          {lot.germinationTests.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-body-s">
              {lot.germinationTests.map((g, i) => (
                <li key={i}>
                  {fmt.date(new Date(`${g.testedOn}T12:00:00Z`))}: {s.testRow(g.sprouted, g.sown, g.days)}
                </li>
              ))}
            </ul>
          )}
          <Card className="mt-3 flex flex-col gap-3">
            <h3 className="text-body-s font-semibold text-ink">{s.addTest}</h3>
            <TextField
              label={s.testedOn}
              type="date"
              max={today}
              value={testedOn}
              onValueChange={setTestedOn}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label={s.sown} value={sown} onValueChange={setSown} min={1} step={1} />
              <NumberInput label={s.sprouted} value={sprouted} onValueChange={setSprouted} min={0} step={1} />
            </div>
            <NumberInput label={s.days} value={days} onValueChange={setDays} min={1} step={1} />
            <div>
              <Button size="sm" loading={busy} disabled={!validTest} onClick={() => void addTest()}>
                {s.addTest}
              </Button>
            </div>
          </Card>
        </Section>

        <Section
          title={s.grown}
          headingLevel={2}
          action={
            <Link
              to="/garden/plants/new"
              search={{ seedLotId: lot.id }}
              className={buttonClasses('soft', 'sm')}
            >
              <Plus className="size-4" aria-hidden="true" />
              {s.grow}
            </Link>
          }
        >
          {grown.length === 0 ? (
            <p className="text-body-s text-muted">{s.noneGrown}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {grown.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/garden/plants/$specimenId"
                    params={{ specimenId: p.id }}
                    className="text-accent-ink underline"
                  >
                    {p.displayName}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {canOffer && (
          <Card className="flex flex-col gap-2">
            <Button
              variant="secondary"
              loading={offering}
              onClick={() => void offer()}
              icon={<Share2 className="size-4" aria-hidden="true" />}
            >
              {s.offer}
            </Button>
            <p className="text-caption text-muted">{s.biosecurity}</p>
          </Card>
        )}

        <div>
          <Button
            variant="danger-soft"
            size="sm"
            icon={<Trash2 className="size-4" aria-hidden="true" />}
            onClick={async () => {
              try {
                await deleteSeedLot(lot.id, lot.version);
                toast(s.deleted);
                await navigate({ to: '/garden/seeds' });
              } catch (e) {
                reportError(t, e);
              }
            }}
          >
            {s.delete}
          </Button>
        </div>
      </div>
    </Page>
  );
}
