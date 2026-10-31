import type { PhotoIdInput } from '@plantpal/ai';
import type { IdCandidates } from '@plantpal/schemas';
import { Badge, Button, Card, TaxonName } from '@plantpal/ui';
import { useState } from 'react';
import { AiButton, AiFlow } from '../../ai/AiButton';
import { useAiAction } from '../../ai/useAiAction';
import { getSpeciesClient } from '../../env/source';
import { usePrefs } from '../../state/prefs';
import { useAiPhotos } from '../health/useAiPhotos';
import { CATALOG_TAXA, regionName } from '../plan/engine';
import { useSpeciesT } from './messages';

export interface PickedIdentity {
  scientificName: string;
  commonName: string | null;
  catalogTaxonId: string | null;
}

interface Resolved {
  scientificName: string;
  commonName: string | null;
  likelihood: IdCandidates['candidates'][number]['likelihood'];
  features: string[];
  lookAlikes: string[];
  catalogTaxonId: string | null;
}

/**
 * F5 photo identification. Candidates are shown only after GBIF confirms the name; nothing here ever
 * says whether a plant is edible or safe.
 */
export function PhotoId({
  mediaId,
  countryCode,
  onPick,
}: {
  mediaId: string;
  countryCode: string | null;
  onPick: (p: PickedIdentity) => void;
}) {
  const m = useSpeciesT();
  const locale = usePrefs((s) => s.locale);
  const units = usePrefs((s) => s.units);
  const photos = useAiPhotos([{ id: mediaId, label: 'photo' }]);
  const [resolved, setResolved] = useState<Resolved[] | null>(null);
  const [dropped, setDropped] = useState(0);

  const ai = useAiAction<PhotoIdInput, IdCandidates>(
    'photo-id',
    () =>
      photos[0]
        ? {
            policy: { locale, units, seasonModel: 'not relevant' },
            image: photos[0].image,
            region: countryCode ? regionName(countryCode, 'en') : null,
            hint: null,
          }
        : null,
    {
      onResult: (r) => {
        setResolved(null);
        void Promise.all(
          r.candidates.map(async (c) => {
            try {
              const match = await getSpeciesClient().speciesMatch(c.scientificName);
              if (!match.resolved || !match.canonicalName) return null;
              const name = match.canonicalName;
              const cat = CATALOG_TAXA.find((x) => x.scientificName.toLowerCase() === name.toLowerCase());
              return { ...c, scientificName: name, catalogTaxonId: cat?.id ?? null } satisfies Resolved;
            } catch {
              return null;
            }
          }),
        ).then((list) => {
          const ok = list.filter((x): x is Resolved => x !== null);
          setResolved(ok);
          setDropped(list.length - ok.length);
        });
      },
    },
  );

  return (
    <div className="flex flex-col gap-3" data-testid="photo-id">
      {/* Shown once the small copy of the photo is ready, so a tap always opens the preview. */}
      {photos[0] && (
        <div>
          <AiButton ai={ai} label={m.identify} />
        </div>
      )}
      <AiFlow ai={ai} fallback={m.idFallback} />
      {ai.result && !ai.result.imageUsable && (
        <p className="text-body-s text-muted">{ai.result.abstainReason}</p>
      )}
      {resolved && (
        <Card className="flex flex-col gap-3">
          <p className="font-medium text-ink">{m.candidates}</p>
          <p className="text-caption text-muted">{m.identifyHint}</p>
          <ul className="flex flex-col gap-2">
            {resolved.map((c) => (
              <li
                key={c.scientificName}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-line p-2 text-body-s"
              >
                <div className="min-w-0">
                  <TaxonName scientificName={c.scientificName} className="font-medium text-ink" />
                  {c.commonName && <span className="text-muted"> · {c.commonName}</span>}
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone={c.likelihood === 'LIKELY' ? 'warning' : 'neutral'}>{c.likelihood}</Badge>
                    {c.catalogTaxonId && <Badge tone="accent">{m.linked}</Badge>}
                  </div>
                  {c.features.length > 0 && (
                    <p className="mt-1 text-caption text-muted">{c.features.join(' · ')}</p>
                  )}
                  {c.lookAlikes.length > 0 && (
                    <p className="text-caption text-muted">
                      {m.lookAlikes}: {c.lookAlikes.join(', ')}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    onPick({
                      scientificName: c.scientificName,
                      commonName: c.commonName,
                      catalogTaxonId: c.catalogTaxonId,
                    })
                  }
                >
                  {m.use}
                </Button>
              </li>
            ))}
          </ul>
          {dropped > 0 && <p className="text-caption text-muted">{m.dropped(dropped)}</p>}
        </Card>
      )}
    </div>
  );
}
