import { Button, Card, Notice, Spinner, TextField } from '@plantpal/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { LocateFixed, MapPin, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { community, type CommunityProfile } from '../../community/api';
import { useActiveGarden } from '../../data/queries';
import { COMMUNITY_KEY, coarseCell, problemText } from './hooks';
import { useCommunityT } from './messages';

/**
 * Creates or edits the community profile. The rough area (an H3 resolution-7 cell) is computed here from
 * the garden's saved location or one device reading; only the cell id is sent, never coordinates.
 */
export function ProfileForm({ profile, onDone }: { profile: CommunityProfile | null; onDone?: () => void }) {
  const c = useCommunityT();
  const qc = useQueryClient();
  const { garden } = useActiveGarden();
  const lat = garden?.place?.lat ?? null;
  const lon = garden?.place?.lon ?? null;
  const [name, setName] = useState(profile?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [deviceCell, setDeviceCell] = useState<string | null>(null);
  const [useGarden, setUseGarden] = useState(!profile);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);

  const gardenCell = useQuery({
    queryKey: ['coarse-cell', lat, lon],
    queryFn: () => coarseCell(lat!, lon!),
    enabled: lat !== null && lon !== null,
    staleTime: Infinity,
  });

  const cell = deviceCell ?? (useGarden ? gardenCell.data : null) ?? profile?.cell ?? null;
  const fromGarden = !deviceCell && useGarden && Boolean(gardenCell.data);
  const nameOk = name.trim().length > 0 && name.trim().length <= 40;

  const locate = () => {
    if (!('geolocation' in navigator)) {
      toast.error(c.setup.locateFailed);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // The reading is turned into a coarse cell at once and then dropped.
        void coarseCell(pos.coords.latitude, pos.coords.longitude)
          .then(setDeviceCell)
          .catch(() => toast.error(c.setup.locateFailed))
          .finally(() => setLocating(false));
      },
      () => {
        setLocating(false);
        toast.error(c.setup.locateFailed);
      },
      { enableHighAccuracy: false, maximumAge: 600_000, timeout: 15_000 },
    );
  };

  const save = async () => {
    if (!cell || !nameOk) return;
    setBusy(true);
    try {
      await community.saveProfile({
        displayName: name.trim(),
        cell,
        country: garden?.region?.countryCode ?? profile?.country ?? null,
        bio: bio.trim(),
      });
      await qc.invalidateQueries({ queryKey: COMMUNITY_KEY });
      toast.success(c.setup.saved);
      onDone?.();
    } catch (e) {
      toast.error(problemText(e, c.failed));
    } finally {
      setBusy(false);
    }
  };

  const areaLine = cell
    ? fromGarden && garden?.place?.label
      ? c.setup.areaFrom(garden.place.label)
      : deviceCell || fromGarden
        ? c.setup.areaReady
        : c.setup.areaKept
    : null;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-h3 text-ink">{profile ? c.setup.editTitle : c.setup.title}</h2>
        <p className="mt-1 text-body-s text-muted">{c.setup.intro}</p>
      </div>
      <TextField label={c.setup.name} value={name} onValueChange={setName} maxLength={40} required />
      <TextField label={c.setup.bio} value={bio} onValueChange={setBio} maxLength={300} multiline rows={2} />

      <div className="flex flex-col gap-2">
        <span className="text-body-s font-medium text-ink">{c.setup.area}</span>
        {gardenCell.isFetching || locating ? (
          <p className="flex items-center gap-2 text-body-s text-muted" role="status">
            <Spinner /> {c.setup.locating}
          </p>
        ) : areaLine ? (
          <p className="flex items-center gap-2 text-body-s text-ink" data-testid="community-area">
            <MapPin className="size-4 text-accent" aria-hidden="true" />
            {areaLine}
          </p>
        ) : (
          <Notice>
            {c.setup.noPlace}{' '}
            <Link to="/garden/edit" className="font-medium text-accent-ink underline">
              {c.setup.addPlace}
            </Link>
          </Notice>
        )}
        <div className="flex flex-wrap gap-2">
          {profile && lat !== null && !useGarden && (
            <Button size="sm" variant="ghost" onClick={() => setUseGarden(true)}>
              {c.setup.useGarden}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<LocateFixed className="size-4" aria-hidden="true" />}
            onClick={locate}
            disabled={locating}
          >
            {c.setup.useDevice}
          </Button>
        </div>
      </div>

      <div className="rounded-lg bg-sunken p-4">
        <h3 className="flex items-center gap-2 text-body-s font-semibold text-ink">
          <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
          {c.setup.privacyTitle}
        </h3>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-body-s text-muted">
          {c.setup.privacy.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button loading={busy} disabled={!cell || !nameOk} onClick={() => void save()}>
          {profile ? c.setup.save : c.setup.create}
        </Button>
        {onDone && profile && (
          <Button variant="ghost" onClick={onDone}>
            {c.setup.close}
          </Button>
        )}
      </div>
    </Card>
  );
}
