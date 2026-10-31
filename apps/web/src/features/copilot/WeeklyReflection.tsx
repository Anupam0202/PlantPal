import type { WeeklyReflectionInput } from '@plantpal/ai';
import { careQueue, lastWeek, startOfLocalDay, summarizeWeek, summaryText, todayIn } from '@plantpal/domain';
import type { Garden, WeeklyReflection as Reflection } from '@plantpal/schemas';
import { Button, Card } from '@plantpal/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { AiButton, AiFlow } from '../../ai/AiButton';
import { useAiAction } from '../../ai/useAiAction';
import { db, getMeta, setMeta } from '../../data/db';
import { clockNow } from '../../lib/clock';
import { usePrefs } from '../../state/prefs';
import { useCopilotT } from './messages';

const live =
  <T extends { deletedAt: number | null; gardenId: string }>(gardenId: string) =>
  (r: T) =>
    r.deletedAt === null && r.gardenId === gardenId;

/**
 * F8: on the first visit to Today in a new week, a short look back at last week, counted from the
 * records. Never shaming; a quiet week is fine. The person can ask Gemini to put it in words.
 */
export function WeeklyReflection({ garden }: { garden: Garden }) {
  const c = useCopilotT();
  const locale = usePrefs((s) => s.locale);
  const units = usePrefs((s) => s.units);
  const [now] = useState(clockNow);
  const today = todayIn(garden.timezone, now);
  const week = lastWeek(today);
  const key = `reflection:${garden.id}`;

  const data = useLiveQuery(async () => {
    const dismissed = await getMeta<string>(key);
    if (dismissed === week.thisWeek) return null;
    // Only gardens that existed for the whole of last week get a reflection.
    if (garden.createdAt > startOfLocalDay(week.from, garden.timezone)) return null;
    const keep = live(garden.id);
    const [care, notes, visits, harvests, schedules, logs] = await Promise.all([
      db.careEvents.where('gardenId').equals(garden.id).toArray(),
      db.observations.where('gardenId').equals(garden.id).toArray(),
      db.natureVisits.where('gardenId').equals(garden.id).toArray(),
      db.harvests.where('gardenId').equals(garden.id).toArray(),
      db.careSchedules.where('gardenId').equals(garden.id).toArray(),
      db.taskLogs.where('gardenId').equals(garden.id).toArray(),
    ]);
    const summary = summarizeWeek(
      {
        care: care.filter(keep).map((e) => ({ kind: e.kind, on: e.occurredOn })),
        notes: notes.filter(keep).map((o) => ({ title: o.title, on: o.occurredOn })),
        visits: visits.filter(keep).map((v) => ({ protocol: v.protocol, on: v.occurredOn })),
        harvests: harvests.filter(keep).map((h) => ({ massG: h.massG, count: h.count, on: h.harvestedOn })),
      },
      week.from,
      week.to,
    );
    const queue = careQueue({
      schedules: schedules.filter((s) => s.deletedAt === null),
      logs: logs.map((l) => ({ ...l, voidedAt: l.deletedAt })),
      today,
      timeZone: garden.timezone,
      now,
    });
    const upcoming = [...queue.dueToday, ...queue.thisWeek].slice(0, 5).map((o) => o.title);
    return { summary, upcoming };
  }, [garden.id, garden.createdAt, garden.timezone, week.thisWeek, week.from, week.to, today, now, key]);

  const ai = useAiAction<WeeklyReflectionInput, Reflection>('weekly-reflection', () =>
    data
      ? {
          policy: { locale, units, seasonModel: `${garden.hemisphere ?? 'unknown'} hemisphere` },
          summary: summaryText(data.summary),
          upcoming: data.upcoming,
        }
      : null,
  );

  if (!data) return null;
  const s = data.summary;
  const lines = s.quiet
    ? [c.reflection.quiet]
    : [
        s.care ? c.reflection.care(s.care) : null,
        s.notes.length ? c.reflection.notes(s.notes.length) : null,
        s.visits ? c.reflection.visits(s.visits) : null,
        s.harvests ? c.reflection.harvest(s.harvests) : null,
      ].filter((x): x is string => Boolean(x));
  const r = ai.result;

  return (
    <Card className="flex flex-col gap-3" data-testid="weekly-reflection">
      <h2 className="text-h3 text-ink">{c.reflection.title}</h2>
      <ul className="flex flex-col gap-1 text-body-s text-ink">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
        {data.upcoming.length > 0 && (
          <li className="text-muted">{c.reflection.tasks(data.upcoming.length)}</li>
        )}
      </ul>
      {r && (
        <div className="flex flex-col gap-1 rounded-lg bg-sunken p-3 text-body-s">
          <p className="font-medium text-ink">{r.headline}</p>
          {r.highlights.map((h) => (
            <p key={h} className="text-ink">
              {h}
            </p>
          ))}
          {r.nextSteps.map((n) => (
            <p key={n} className="text-muted">
              {n}
            </p>
          ))}
        </div>
      )}
      <AiFlow ai={ai} />
      <div className="flex flex-wrap gap-2">
        {!r && <AiButton ai={ai} label={c.reflection.words} />}
        <Button variant="ghost" size="sm" onClick={() => void setMeta(key, week.thisWeek)}>
          {c.reflection.dismiss}
        </Button>
      </div>
    </Card>
  );
}
