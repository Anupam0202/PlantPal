import { todayIn } from '@plantpal/domain';
import { BEHAVIOURS, SIGHTING_GROUPS } from '@plantpal/schemas';
import { Button, Card, CheckboxField, NumberInput, PageHeader, SelectField, TextField } from '@plantpal/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { clockNow } from '../../lib/clock';
import { logVisit } from '../../data/commands';
import { useActiveGarden, useSpecimens } from '../../data/queries';
import { reportError } from '../../features/garden/errors';
import { GardenLoading, NoGarden } from '../../features/garden/NoGarden';
import { useNatureT } from '../../features/nature/messages';
import { useT } from '../../i18n';

export const Route = createFileRoute('/nature/sighting')({
  component: Sighting,
});

const NONE = '__none';
type Group = (typeof SIGHTING_GROUPS)[number];
type Behaviour = (typeof BEHAVIOURS)[number];

function Sighting() {
  const t = useT();
  const m = useNatureT();
  const navigate = useNavigate();
  const { garden } = useActiveGarden();
  const specimens = useSpecimens(garden?.id);
  const [group, setGroup] = useState<Group>('bee');
  const [name, setName] = useState('');
  const [count, setCount] = useState<number | null>(1);
  const [behaviour, setBehaviour] = useState<string>(NONE);
  const [onPlant, setOnPlant] = useState<string>(NONE);
  const [unsure, setUnsure] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  if (garden === undefined)
    return (
      <Page>
        <GardenLoading />
      </Page>
    );
  if (garden === null)
    return (
      <Page>
        <NoGarden />
      </Page>
    );

  const save = async () => {
    setBusy(true);
    try {
      await logVisit({
        gardenId: garden.id,
        protocol: 'sighting',
        startedAt: clockNow(),
        plannedS: 0,
        durationS: 0,
        specimenId: onPlant === NONE ? null : onPlant,
        targetName: '',
        records: [
          {
            group,
            taxonName: name.trim() || null,
            count,
            state: unsure ? 'UNCERTAIN' : 'YES',
            identityConfidence: unsure ? 'unsure' : 'confident',
            behaviour: behaviour === NONE ? null : (behaviour as Behaviour),
          },
        ],
        notes,
      });
      toast.success(m.sighting.saved);
      await navigate({ to: '/nature/log' });
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader title={m.sighting.title} description={todayIn(garden.timezone)} />
      <Card className="mt-6 flex flex-col gap-4">
        <SelectField<Group>
          label={m.sighting.group}
          value={group}
          onValueChange={setGroup}
          options={SIGHTING_GROUPS.map((g) => ({ value: g, label: m.sightingGroups[g] }))}
        />
        <TextField label={m.sighting.name} value={name} onValueChange={setName} maxLength={120} />
        <CheckboxField label={m.sighting.unsure} checked={unsure} onCheckedChange={setUnsure} />
        <NumberInput label={m.sighting.count} value={count} onValueChange={setCount} min={1} max={9999} />
        <SelectField<string>
          label={m.sighting.behaviour}
          value={behaviour}
          onValueChange={setBehaviour}
          options={[
            { value: NONE, label: '—' },
            ...BEHAVIOURS.map((b) => ({ value: b, label: m.behaviours[b] })),
          ]}
        />
        {specimens && specimens.length > 0 && (
          <SelectField<string>
            label={m.fit.target}
            value={onPlant}
            onValueChange={setOnPlant}
            options={[
              { value: NONE, label: '—' },
              ...specimens
                .filter((s) => s.deletedAt === null)
                .map((s) => ({ value: s.id, label: s.displayName })),
            ]}
          />
        )}
        <TextField
          label={m.sighting.notes}
          value={notes}
          onValueChange={setNotes}
          multiline
          rows={3}
          maxLength={2000}
        />
        <Button onClick={() => void save()} disabled={busy}>
          {m.sighting.save}
        </Button>
      </Card>
    </Page>
  );
}
