import type { SpeciesResearchInput } from '@plantpal/ai';
import type { SpeciesDraft } from '@plantpal/schemas';
import { Button, buttonClasses, Notice, Spinner, TextField } from '@plantpal/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { AiButton, AiFlow } from '../../ai/AiButton';
import { useAiAction } from '../../ai/useAiAction';
import { saveSpeciesDraft } from '../../data/commands';
import { useSpeciesMatch } from '../../env/hooks';
import { useT } from '../../i18n';
import { usePrefs } from '../../state/prefs';
import { reportError } from '../garden/errors';
import { CATALOG_TAXA } from '../plan/engine';
import { useSpeciesT } from './messages';

type DraftResult = SpeciesDraft & { sources: Array<{ url: string; title: string }> };

/** F3 species intake: check the name in GBIF, then draft cited facts for review (never auto-accepted). */
export function SpeciesIntake() {
  const t = useT();
  const m = useSpeciesT();
  const navigate = useNavigate();
  const locale = usePrefs((s) => s.locale);
  const units = usePrefs((s) => s.units);
  const [name, setName] = useState('');
  const [checked, setChecked] = useState<string | null>(null);
  const match = useSpeciesMatch(checked);
  const resolved = match.data?.resolved ? match.data : null;
  const canonical = resolved?.canonicalName ?? null;
  const inCatalogue = canonical
    ? CATALOG_TAXA.find((x) => x.scientificName.toLowerCase() === canonical.toLowerCase())
    : undefined;

  const ai = useAiAction<SpeciesResearchInput, DraftResult>(
    'species-draft',
    () =>
      canonical && !inCatalogue
        ? {
            policy: { locale, units, seasonModel: 'not relevant' },
            scientificName: canonical,
            family: resolved?.family ?? null,
          }
        : null,
    {
      onResult: (r) => {
        if (!resolved || !canonical) return;
        void saveSpeciesDraft({
          scientificName: canonical,
          gbifKey: resolved.acceptedKey ?? resolved.usageKey,
          family: resolved.family,
          commonName: null,
          traits: r.traits,
          cannotDetermine: r.cannotDetermine,
          model: null,
          promptVersion: 1,
        })
          .then((d) => {
            toast.success(m.draftSaved);
            return navigate({ to: '/species/drafts/$draftId', params: { draftId: d.id } });
          })
          .catch((e: unknown) => reportError(t, e));
      },
    },
  );

  return (
    <div className="flex flex-col gap-3" data-testid="species-intake">
      <p className="font-medium text-ink">{m.newDraft}</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setChecked(name.trim() || null);
        }}
      >
        <TextField
          label={m.sciName}
          value={name}
          onValueChange={setName}
          className="min-w-0 flex-1"
          maxLength={120}
        />
        <Button type="submit" variant="secondary" disabled={name.trim().length < 3}>
          {match.isFetching ? <Spinner /> : null}
          {m.checkName}
        </Button>
      </form>
      {checked && match.data && !resolved && <Notice tone="warning">{m.notMatched}</Notice>}
      {resolved && (
        <p className="text-body-s text-ink" data-testid="gbif-match">
          {m.matched(resolved.canonicalName ?? '', resolved.family ?? '—')}
        </p>
      )}
      {inCatalogue && (
        <Notice
          tone="info"
          action={
            <Link
              to="/species/$taxonKey"
              params={{ taxonKey: inCatalogue.id }}
              className={buttonClasses('secondary', 'sm')}
            >
              {inCatalogue.names.en}
            </Link>
          }
        >
          {m.inCatalogue}
        </Notice>
      )}
      {resolved && !inCatalogue && (
        <>
          <div>
            <AiButton ai={ai} label={m.draftAi} />
          </div>
          <AiFlow ai={ai} fallback={m.draftFallback} />
        </>
      )}
    </div>
  );
}
