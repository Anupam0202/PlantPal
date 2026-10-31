import { createFileRoute } from '@tanstack/react-router';
import {
  Badge,
  Button,
  Card,
  CheckboxField,
  Chip,
  Dialog,
  EmptyState,
  ErrorState,
  EvidenceBadge,
  FreshnessPill,
  LikelihoodChip,
  Metric,
  Notice,
  NumberInput,
  PageHeader,
  Section,
  SegmentedControl,
  SelectField,
  Sheet,
  Skeleton,
  Sprout,
  SproutProgress,
  SwitchField,
  Tabs,
  TaxonName,
  TextField,
  Tooltip,
  type EvidenceGrade,
} from '@plantpal/ui';
import {
  BeeIcon,
  CompostIcon,
  PotIcon,
  RainBarrelIcon,
  SeedPacketIcon,
  SunPathIcon,
  WateringCanIcon,
  SeedlingIllustration,
} from '@plantpal/ui';
import { useState } from 'react';
import { Page } from '../../app/Page';

/** Component gallery (ADR-0001 deviation 1). Not linked from production navigation. */
export const Route = createFileRoute('/dev/design-system')({
  component: Gallery,
});

const LOAD_TIME = Date.now();
const grades: EvidenceGrade[] = [
  'MEASURED',
  'OFFICIAL',
  'PEER_REVIEWED',
  'EXTENSION',
  'MODELLED',
  'COMMUNITY',
  'AI_DRAFT',
  'TRADITION',
  'UNKNOWN',
];

function Gallery() {
  const [hours, setHours] = useState<number | null>(0);
  const [chip, setChip] = useState(true);
  const [sw, setSw] = useState(false);
  const [check, setCheck] = useState(true);
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a');
  const [sel, setSel] = useState<'pots' | 'beds' | null>(null);
  const [tab, setTab] = useState<'one' | 'two'>('one');
  const [play, setPlay] = useState(0);
  return (
    <Page width="wide">
      <PageHeader
        eyebrow="Design system"
        title="Living Field Guide"
        description="Every component in light, dark and high-contrast themes via Settings."
      />
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <Section title="Buttons">
          <Card className="flex flex-wrap gap-2">
            <Button>Log water</Button>
            <Button variant="secondary">Snooze</Button>
            <Button variant="soft">Check</Button>
            <Button variant="ghost">Skip</Button>
            <Button variant="danger">Delete</Button>
            <Button loading>Saving</Button>
          </Card>
        </Section>
        <Section title="Evidence and status">
          <Card className="flex flex-wrap gap-2">
            {grades.map((g) => (
              <EvidenceBadge key={g} grade={g} />
            ))}
            <LikelihoodChip value="LIKELY" />
            <LikelihoodChip value="POSSIBLE" />
            <FreshnessPill at={new Date(LOAD_TIME - 3 * 3600_000).toISOString()} now={LOAD_TIME} />
            <FreshnessPill at={new Date(LOAD_TIME - 30 * 3600_000).toISOString()} now={LOAD_TIME} stale />
            <Badge tone="clay">Clay</Badge>
            <Badge tone="dusk">Dusk</Badge>
          </Card>
        </Section>
        <Section title="Forms">
          <Card className="flex flex-col gap-4">
            <TextField
              label="Garden name"
              placeholder="West balcony"
              description="Shown only to you and people you invite."
            />
            <NumberInput
              label="Direct sun in summer"
              value={hours}
              onValueChange={setHours}
              unit="h"
              min={0}
              max={16}
              description="0 is a real answer: no direct sun."
            />
            <SelectField<'pots' | 'beds'>
              label="Growing in"
              value={sel}
              onValueChange={setSel}
              options={[
                { value: 'pots', label: 'Pots and containers' },
                { value: 'beds', label: 'Raised beds' },
              ]}
            />
            <SegmentedControl<'a' | 'b' | 'c'>
              label="View"
              value={seg}
              onValueChange={setSeg}
              options={[
                { value: 'a', label: 'Wheel' },
                { value: 'b', label: 'Table' },
                { value: 'c', label: 'List' },
              ]}
            />
            <SwitchField
              label="Covered from rain"
              description="Balcony ceilings keep rain off pots."
              checked={sw}
              onCheckedChange={setSw}
            />
            <CheckboxField label="Cats live here" checked={check} onCheckedChange={setCheck} />
            <div className="flex flex-wrap gap-2">
              <Chip pressed={chip} onPressedChange={setChip}>
                Help pollinators
              </Chip>
              <Chip pressed={!chip} onPressedChange={(p) => setChip(!p)}>
                Grow food
              </Chip>
            </div>
          </Card>
        </Section>
        <Section title="Typography and data">
          <Card variant="plate" className="flex flex-col gap-3">
            <p className="text-caption font-semibold tracking-wide text-accent-ink uppercase">Specimen</p>
            <h2 className="text-h2">Sweet basil</h2>
            <TaxonName scientificName="Ocimum basilicum" cultivar="Genovese" authorship="L." />
            <div className="grid grid-cols-2 gap-4">
              <Metric label="Rain used" value="214" unit="L" evidence="MEASURED" />
              <Metric
                label="Direct sun"
                value="4.5"
                unit="h/day"
                evidence="MODELLED"
                hint="June, clear-sky estimate"
              />
            </div>
          </Card>
        </Section>
        <Section title="Overlays">
          <Card className="flex flex-wrap gap-2">
            <Dialog
              trigger={<Button variant="secondary">Open dialog</Button>}
              title="Remove basil?"
              description="History stays in your journal."
              footer={<Button variant="danger">Archive</Button>}
            >
              <p className="text-body-s text-muted">
                Archiving keeps every journal entry and lets you restore later.
              </p>
            </Dialog>
            <Sheet
              trigger={<Button variant="secondary">Open sheet</Button>}
              title="Check basil"
              description="Three taps."
            >
              <p className="text-body-s text-muted">Sheet content</p>
            </Sheet>
            <Tooltip content="Reference evapotranspiration">
              <Button variant="ghost">ET₀</Button>
            </Tooltip>
          </Card>
        </Section>
        <Section title="Feedback">
          <div className="flex flex-col gap-3">
            <Notice tone="warning" title="Forecast is 4 h old">
              Heat guidance uses the last good forecast.
            </Notice>
            <ErrorState message="Open-Meteo did not respond in 4 s." onRetry={() => undefined} />
            <Card className="flex items-center gap-4">
              <Sprout playKey={play} size={56} />
              <Button variant="soft" onClick={() => setPlay((p) => p + 1)}>
                Replay sprout
              </Button>
              <SproutProgress step={3} total={6} label="Setup progress" className="flex-1" />
            </Card>
            <Card className="flex flex-col gap-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
            </Card>
          </div>
        </Section>
        <Section title="Icons">
          <Card className="flex flex-wrap gap-4 text-ink">
            <PotIcon title="Pot" />
            <WateringCanIcon title="Watering can" />
            <BeeIcon title="Bee" />
            <SunPathIcon title="Sun path" />
            <RainBarrelIcon title="Rain barrel" />
            <CompostIcon title="Compost" />
            <SeedPacketIcon title="Seed packet" />
          </Card>
        </Section>
        <Section title="Tabs and empty state">
          <Card>
            <Tabs<'one' | 'two'>
              label="Example"
              value={tab}
              onValueChange={setTab}
              items={[
                { value: 'one', label: 'Care', content: <p>Care tab</p> },
                { value: 'two', label: 'Journal', content: <p>Journal tab</p> },
              ]}
            />
            <EmptyState
              illustration={<SeedlingIllustration size={96} />}
              title="No plants yet"
              description="Plants you add appear here."
              action={<Button>Add a plant</Button>}
            />
          </Card>
        </Section>
      </div>
    </Page>
  );
}
