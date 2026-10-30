import { Badge, PageHeader } from '@plantpal/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2 } from 'lucide-react';
import { Page } from '../../app/Page';
import { getMeta } from '../../data/db';
import { LESSONS } from '../../features/learn/lessons';
import { useLearnT } from '../../features/learn/messages';
import { LESSONS_KEY } from '../../features/learn/useStamps';

export const Route = createFileRoute('/learn/')({
  component: LearnIndex,
});

function LearnIndex() {
  const l = useLearnT().learn;
  const done = useLiveQuery(async () => new Set((await getMeta<string[]>(LESSONS_KEY)) ?? []), []);
  return (
    <Page>
      <PageHeader title={l.title} description={l.intro} />
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {LESSONS.map((lesson) => (
          <li key={lesson.id}>
            <Link
              to="/learn/$lessonId"
              params={{ lessonId: lesson.id }}
              className="flex h-full flex-col gap-1 rounded-lg border border-line bg-surface p-4 shadow-1 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-focus"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-medium text-ink">{lesson.title}</span>
                {done?.has(lesson.id) && (
                  <CheckCircle2 className="size-5 shrink-0 text-accent" aria-label={l.done} />
                )}
              </span>
              <span className="text-body-s text-muted">{lesson.summary}</span>
              <Badge className="mt-1 self-start">{l.minutes(lesson.minutes)}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
