import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  Badge,
  Button,
  buttonClasses,
  Card,
  EmptyState,
  Notice,
  PageHeader,
  Section,
  TaxonName,
} from '@plantpal/ui';
import { ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { deleteSpeciesDraft, reviewDraftTrait } from '../../data/commands';
import { useSpeciesDraft } from '../../data/queries';
import { reportError } from '../../features/garden/errors';
import { traitText } from '../../features/species/format';
import { useSpeciesT } from '../../features/species/messages';
import { useT } from '../../i18n';

export const Route = createFileRoute('/species/drafts/$draftId')({
  component: DraftPage,
});

/** Curator queue for one AI-drafted species: each fact is cited and reviewed by a person. */
function DraftPage() {
  const t = useT();
  const m = useSpeciesT();
  const navigate = useNavigate();
  const { draftId } = Route.useParams();
  const d = useSpeciesDraft(draftId);
  if (d === undefined) return <Page>…</Page>;
  if (d === null)
    return (
      <Page>
        <EmptyState
          title={m.noResults}
          action={
            <Link to="/species" className={buttonClasses('primary')}>
              {m.title}
            </Link>
          }
        />
      </Page>
    );

  const review = async (i: number, r: 'accepted' | 'rejected') => {
    try {
      await reviewDraftTrait(d.id, d.version, i, r);
    } catch (e) {
      reportError(t, e);
    }
  };

  return (
    <Page width="narrow">
      <PageHeader
        eyebrow={d.family ? m.family(d.family) : undefined}
        title={<TaxonName scientificName={d.scientificName} />}
        description={m.draftsHint}
        actions={<Badge tone="dusk">{m.aiDraft}</Badge>}
      />
      <div className="mt-6 flex flex-col gap-8">
        <Section title={m.review} description={m.reviewHint} headingLevel={2}>
          <ul className="flex flex-col gap-3" data-testid="draft-traits">
            {d.traits.map((tr, i) => {
              const tox = /toxic|edib/i.test(tr.trait);
              return (
                <li key={`${tr.trait}-${i}`}>
                  <Card padding="sm" className="flex flex-col gap-2 text-body-s">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{m.traitNames[tr.trait] ?? tr.trait}</span>
                      <Badge
                        tone={
                          tr.review === 'accepted' ? 'accent' : tr.review === 'rejected' ? 'neutral' : 'dusk'
                        }
                      >
                        {tr.review === 'accepted'
                          ? m.accepted
                          : tr.review === 'rejected'
                            ? m.rejected
                            : m.aiDraft}
                      </Badge>
                    </div>
                    <p className="text-ink">
                      {traitText({ value: tr.value, unit: tr.unit }, m.levels)}
                      {tr.appliesTo ? ` · ${tr.appliesTo}` : ''}
                    </p>
                    <ul className="flex flex-col gap-0.5">
                      {tr.citations.map((c) => (
                        <li key={c.url}>
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-caption text-accent-ink underline"
                          >
                            {c.title}
                            <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        </li>
                      ))}
                    </ul>
                    {tr.review === 'AI_DRAFT' &&
                      (tox ? (
                        <Notice tone="warning">{m.noAcceptTox}</Notice>
                      ) : (
                        <div className="flex gap-2">
                          <Button size="sm" variant="secondary" onClick={() => void review(i, 'accepted')}>
                            {m.accept}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void review(i, 'rejected')}>
                            {m.reject}
                          </Button>
                        </div>
                      ))}
                  </Card>
                </li>
              );
            })}
          </ul>
        </Section>
        {d.cannotDetermine.length > 0 && (
          <Section title={m.cannotDetermine} headingLevel={2}>
            <ul className="list-disc pl-5 text-body-s text-muted">
              {d.cannotDetermine.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </Section>
        )}
        <div>
          <Button
            variant="danger-soft"
            onClick={() =>
              void deleteSpeciesDraft(d.id, d.version)
                .then(() => {
                  toast.success(m.deleted);
                  return navigate({ to: '/species' });
                })
                .catch((e: unknown) => reportError(t, e))
            }
          >
            {m.deleteDraft}
          </Button>
        </div>
      </div>
    </Page>
  );
}
