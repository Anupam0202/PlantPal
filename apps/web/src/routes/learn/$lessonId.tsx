import { Button, buttonClasses, Card, EmptyState, Notice, PageHeader } from '@plantpal/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { Page } from '../../app/Page';
import { getMeta, setMeta } from '../../data/db';
import { lessonById } from '../../features/learn/lessons';
import { useLearnT } from '../../features/learn/messages';
import { LESSONS_KEY } from '../../features/learn/useStamps';
import { useT } from '../../i18n';

export const Route = createFileRoute('/learn/$lessonId')({
  component: LessonPage,
});

function LessonPage() {
  const t = useT();
  const l = useLearnT().learn;
  const { lessonId } = Route.useParams();
  const lesson = lessonById(lessonId);
  const [choice, setChoice] = useState<number | null>(null);
  const [checked, setChecked] = useState<number | null>(null);

  if (!lesson)
    return (
      <Page width="narrow">
        <EmptyState title={t.notFound.title} description={t.notFound.body} />
      </Page>
    );
  const right = checked !== null && checked === lesson.check.answer;

  const check = async () => {
    if (choice === null) return;
    setChecked(choice);
    if (choice === lesson.check.answer) {
      const done = new Set((await getMeta<string[]>(LESSONS_KEY)) ?? []);
      done.add(lesson.id);
      await setMeta(LESSONS_KEY, [...done]);
    }
  };

  return (
    <Page width="narrow">
      <Link to="/learn" className={buttonClasses('ghost', 'sm')}>
        <ChevronLeft className="size-4" aria-hidden="true" />
        {l.back}
      </Link>
      <PageHeader title={lesson.title} eyebrow={l.minutes(lesson.minutes)} description={lesson.summary} />
      <article className="mt-6 flex flex-col gap-4 text-body text-ink">
        {lesson.paragraphs.map((p) => (
          <p key={p.slice(0, 40)}>{p}</p>
        ))}
      </article>

      <Card className="mt-6 flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body font-semibold text-ink">{l.check}</legend>
          <p className="text-body-s text-ink">{lesson.check.question}</p>
          {lesson.check.options.map((o, i) => (
            <label
              key={o}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-sunken"
            >
              <input
                type="radio"
                name="answer"
                value={i}
                checked={choice === i}
                onChange={() => {
                  setChoice(i);
                  setChecked(null);
                }}
                className="size-5 accent-[var(--color-accent)]"
              />
              <span className="text-body-s text-ink">{o}</span>
            </label>
          ))}
        </fieldset>
        <div>
          <Button size="sm" disabled={choice === null} onClick={() => void check()}>
            {l.answer}
          </Button>
        </div>
        {checked !== null && (
          <Notice
            tone={right ? 'success' : 'warning'}
            title={right ? `${l.right} ${l.complete}` : l.notQuite}
          >
            {right ? lesson.check.why : l.tryAgain}
          </Notice>
        )}
      </Card>

      <div className="mt-6 flex flex-col gap-2 text-body-s">
        {lesson.tryIt && (
          <p>
            {l.tryIt}:{' '}
            <Link to={lesson.tryIt.to} className="font-medium text-accent-ink underline">
              {lesson.tryIt.label}
            </Link>
          </p>
        )}
        <p>
          {l.sources}:{' '}
          {lesson.sources.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent-ink underline"
            >
              {s.title}
            </a>
          ))}
        </p>
        <p className="text-caption text-muted">{l.review}</p>
      </div>
    </Page>
  );
}
