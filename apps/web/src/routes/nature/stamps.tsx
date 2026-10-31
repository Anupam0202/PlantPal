import type { Stamp } from '@plantpal/domain';
import { Badge, Card, PageHeader, Spinner } from '@plantpal/ui';
import { createFileRoute } from '@tanstack/react-router';
import {
  Bird,
  BookOpen,
  CloudRain,
  Flower2,
  HandHeart,
  Leaf,
  Recycle,
  Shield,
  Sprout,
  Sun,
  Telescope,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { getMeta, setMeta } from '../../data/db';
import { useLegacyAchievements } from '../../data/queries';
import { useLearnT } from '../../features/learn/messages';
import { useStamps } from '../../features/learn/useStamps';

export const Route = createFileRoute('/nature/stamps')({
  component: StampsPage,
});

const ICONS: Record<Stamp['id'], LucideIcon> = {
  'first-roots': Sprout,
  'light-reader': Sun,
  'steady-hands': HandHeart,
  'rain-keeper': CloudRain,
  'soil-builder': Recycle,
  'bloom-bridge': Flower2,
  'native-nook': Leaf,
  'host-haven': Bird,
  'pollinator-watch': Telescope,
  'phenology-keeper': Flower2,
  'first-harvest': Wheat,
  harvest: Wheat,
  'seed-saver': Sprout,
  'good-neighbour': HandHeart,
  'heat-shield': Shield,
  'trusted-sitter': Shield,
  'field-scholar': BookOpen,
  'open-science': Telescope,
};

const SEEN_KEY = 'stampsSeen';

function StampsPage() {
  const s = useLearnT().stamps;
  const stamps = useStamps();
  const legacy = useLegacyAchievements();
  const fresh = useRef<Set<string>>(new Set());

  // A stamp earned since the last visit gets the stamp press, once.
  useEffect(() => {
    if (!stamps) return;
    void (async () => {
      const seen = (await getMeta<Record<string, number>>(SEEN_KEY)) ?? {};
      const next: Record<string, number> = {};
      for (const st of stamps) {
        next[st.id] = st.earned;
        if (st.earned > (seen[st.id] ?? 0)) {
          fresh.current.add(st.id);
          toast.success(s.newStamp(s.names[st.id]));
        }
      }
      await setMeta(SEEN_KEY, next);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compare once per change of earned tiers
  }, [stamps?.map((x) => x.earned).join()]);

  if (!stamps)
    return (
      <Page>
        <Spinner />
      </Page>
    );
  const earned = stamps.filter((x) => x.earned > 0).length;
  return (
    <Page>
      <PageHeader title={s.title} description={s.intro} />
      <p className="mt-4 text-body-s text-muted">{s.earned(earned, stamps.length)}</p>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label={s.title}>
        {stamps.map((st) => (
          <li key={st.id}>
            <StampCard st={st} pressed={fresh.current.has(st.id)} />
          </li>
        ))}
      </ul>
      {legacy && (
        <Card className="mt-8 flex flex-col gap-2" data-testid="legacy-achievements">
          <h2 className="text-h3 text-ink">{s.legacyTitle}</h2>
          <p className="text-body-s text-muted">{s.legacyIntro}</p>
          {legacy.xp !== null && (
            <p className="text-body-s text-ink">{s.legacyXp(legacy.xp, legacy.level)}</p>
          )}
          {legacy.badges.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {legacy.badges.map((b) => (
                <li key={`${b.badgeId}:${b.tier}`}>
                  <Badge>
                    {b.badgeId} · {b.tier}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </Page>
  );
}

function StampCard({ st, pressed }: { st: Stamp; pressed: boolean }) {
  const s = useLearnT().stamps;
  const Icon = ICONS[st.id];
  const got = st.earned > 0;
  const next = st.tiers[st.earned];
  return (
    <div
      className="flex h-full flex-col items-center gap-2 rounded-lg border border-line bg-surface p-3 text-center"
      data-testid={`stamp-${st.id}`}
      data-earned={st.earned}
    >
      <div
        className={`relative flex size-20 items-center justify-center rounded-full border-2 border-dashed ${
          got ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong text-muted'
        } ${pressed && got ? 'stamp-press' : ''}`}
        aria-hidden="true"
      >
        <div className={`absolute inset-1.5 rounded-full border ${got ? 'border-accent' : 'border-line'}`} />
        <Icon className="size-8" strokeWidth={1.5} />
      </div>
      <h3 className="text-body-s font-semibold text-ink">
        {s.names[st.id]}
        {st.tiers.length > 1 && st.earned > 0 && ` ${s.tier(st.earned)}`}
      </h3>
      <p className="text-caption text-muted">{s.rules[st.id]}</p>
      <p className="mt-auto text-caption text-ink">
        {st.value === null
          ? s.notTracked
          : next === undefined
            ? s.done
            : s.progress(
                Math.min(st.value, next),
                next,
                next === 1 ? s.units[st.id].replace(/s$/, '') : s.units[st.id],
              )}
      </p>
    </div>
  );
}
