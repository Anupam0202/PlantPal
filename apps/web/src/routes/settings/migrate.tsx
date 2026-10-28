import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  Badge,
  Button,
  buttonClasses,
  Card,
  Dialog,
  Notice,
  PageHeader,
  Section,
  SproutProgress,
} from '@plantpal/ui';
import {
  buildLegacyBackup,
  deviceTimeZone,
  LEGACY_CATEGORIES,
  LEGACY_KEYS,
  type LegacyCategory,
  planLegacyMigration,
  type LegacyMigrationPlan,
  type LegacyProblem,
  type LegacyRecords,
} from '@plantpal/domain';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { ensureWorkspace, setActiveGarden } from '../../data/commands';
import {
  getMigrationState,
  markBackupTaken,
  MIGRATION_STEPS,
  runLegacyMigration,
  type MigrationStep,
} from '../../data/legacy/run';
import { deletePlaintextKey, readLegacyStorage, removeLegacyData } from '../../data/legacy/storage';
import { reportError } from '../../features/garden/errors';
import { useT } from '../../i18n';
import { downloadBlob } from '../../lib/download';
import { useLegacySource } from '../../state/legacySource';
import { usePrefs } from '../../state/prefs';

export const Route = createFileRoute('/settings/migrate')({
  validateSearch: (s: Record<string, unknown>): { source?: 'browser' | 'file' } =>
    s.source === 'file' ? { source: 'file' } : s.source === 'browser' ? { source: 'browser' } : {},
  component: MigratePage,
});

const SEVERITY_TONE = { info: 'info', warning: 'warning', error: 'danger' } as const;

/** Which category a v3 storage key belongs to, for labelling problems. */
const CATEGORY_BY_KEY: Record<string, LegacyCategory> = {
  [LEGACY_KEYS.gardens]: 'gardens',
  [LEGACY_KEYS.zones]: 'zones',
  [LEGACY_KEYS.plants]: 'plants',
  [LEGACY_KEYS.journal]: 'journal',
  [LEGACY_KEYS.harvests]: 'harvests',
  [LEGACY_KEYS.soil]: 'soil',
  [LEGACY_KEYS.scans]: 'scans',
  [LEGACY_KEYS.pins]: 'pins',
  [LEGACY_KEYS.listings]: 'listings',
  [LEGACY_KEYS.profile]: 'achievements',
};

function MigratePage() {
  const t = useT();
  const navigate = useNavigate();
  const { source = 'browser' } = Route.useSearch();
  const fileRaw = useLegacySource((s) => s.fileRaw);
  const fileName = useLegacySource((s) => s.fileName);
  const prefs = usePrefs();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [rawVersion, setRawVersion] = useState(0);
  const [progress, setProgress] = useState<{ step: MigrationStep; index: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [cleanup, setCleanup] = useState(false);
  const state = useLiveQuery(() => getMigrationState(), []);

  useEffect(() => {
    void ensureWorkspace().then((ws) => setWorkspaceId(ws.id));
  }, []);

  const raw = useMemo(
    () => (source === 'file' ? fileRaw : readLegacyStorage()),
    // rawVersion re-reads storage after the key is removed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, fileRaw, rawVersion],
  );
  const plan: LegacyMigrationPlan | null = useMemo(
    () =>
      raw && workspaceId
        ? planLegacyMigration(raw, { workspaceId, timeZone: deviceTimeZone(), now: 0 })
        : null,
    [raw, workspaceId],
  );

  const start = async () => {
    if (!plan || !raw || !workspaceId) return;
    setRunning(true);
    // The preview plan uses a fixed clock; the applied plan stamps records with the real time.
    const fresh = planLegacyMigration(raw, { workspaceId, timeZone: deviceTimeZone(), now: Date.now() });
    try {
      if (source === 'browser') {
        const backup = buildLegacyBackup(raw, new Date().toISOString());
        downloadBlob(
          new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
          `plantpal-v3-backup-${backup.exportedAt.slice(0, 10)}.json`,
        );
        await markBackupTaken();
      }
      const result = await runLegacyMigration(fresh, {
        workspaceId,
        onProgress: (step, index) => setProgress({ step, index }),
      });
      if (fresh.theme && prefs.theme === 'system') prefs.set({ theme: fresh.theme });
      const firstGarden = fresh.records.gardens[0];
      if (firstGarden) await setActiveGarden(firstGarden.id);
      if (result.status !== 'done') toast.error(t.migrate.failedTitle);
    } catch (e) {
      reportError(t, e);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  if (!plan) {
    return (
      <Page width="narrow">
        <PageHeader title={t.migrate.title} />
      </Page>
    );
  }

  const done = state?.status === 'done' && !running;
  const failed = state?.status === 'failed' && !running;
  const categories = LEGACY_CATEGORIES.filter((c) => plan.counts[c].found > 0);
  const problems = plan.problems.filter((p) => p.code !== 'plaintext-key');
  const grouped: Record<LegacyProblem['severity'], LegacyProblem[]> = { error: [], warning: [], info: [] };
  for (const p of problems) grouped[p.severity].push(p);

  return (
    <Page width="narrow">
      <Link to="/settings/data" className="mb-3 inline-flex text-body-s text-muted hover:text-ink">
        ← {t.data.title}
      </Link>
      <PageHeader
        title={t.migrate.title}
        description={
          source === 'file' && fileName ? `${t.migrate.description} (${fileName})` : t.migrate.description
        }
      />

      <div className="mt-8 flex flex-col gap-8">
        {plan.hasPlaintextKey && source === 'browser' && (
          <Notice
            tone="warning"
            role="alert"
            title={t.migrate.keyTitle}
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  deletePlaintextKey();
                  setRawVersion((v) => v + 1);
                  toast.success(t.migrate.keyRemoved);
                }}
              >
                <KeyRound className="size-4" aria-hidden="true" />
                {t.migrate.keyRemove}
              </Button>
            }
          >
            {t.migrate.keyBody}
          </Notice>
        )}

        {done && state.verification ? (
          <Card padding="lg" className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-7 text-accent" aria-hidden="true" />
              <div>
                <h2 className="font-display text-h2 text-ink">{t.migrate.doneTitle}</h2>
                <p className="text-body-s text-muted">{t.migrate.doneBody}</p>
              </div>
            </div>
            <VerificationTable tables={state.verification.tables} />
            {state.verification.photos.expected > 0 && (
              <p className="text-body-s text-muted">
                {t.migrate.photos(state.verification.photos.recovered, state.verification.photos.expected)}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void navigate({ to: '/garden' })}>{t.migrate.openGarden}</Button>
              {source === 'browser' && (
                <Button variant="ghost" onClick={() => setCleanup(true)}>
                  {t.migrate.cleanupAction}
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <>
            <Section title={t.migrate.found} headingLevel={2}>
              <Card padding="md">
                <table className="w-full text-left text-body-s">
                  <thead className="text-caption text-muted">
                    <tr>
                      <th scope="col" className="py-1.5 pr-3 font-medium">
                        {t.migrate.colType}
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">
                        {t.migrate.colFound}
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">
                        {t.migrate.colMigrate}
                      </th>
                      <th scope="col" className="py-1.5 pl-2 text-right font-medium">
                        {t.migrate.colSkipped}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c} className="border-t border-line">
                        <th scope="row" className="py-1.5 pr-3 font-normal text-ink">
                          {t.migrate.categories[c]}
                        </th>
                        <td className="px-2 py-1.5 text-right tabular-nums">{plan.counts[c].found}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{plan.counts[c].migrated}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums">{plan.counts[c].skipped}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </Section>

            <Section title={t.migrate.problems} headingLevel={2}>
              {problems.length === 0 ? (
                <p className="text-body-s text-muted">{t.migrate.noProblems}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {(['error', 'warning', 'info'] as const)
                    .filter((s) => grouped[s].length > 0)
                    .map((s) => (
                      <details
                        key={s}
                        className="rounded-md border border-line bg-surface p-3"
                        open={s !== 'info'}
                      >
                        <summary className="flex cursor-pointer items-center gap-2 text-body-s font-medium text-ink">
                          <Badge tone={SEVERITY_TONE[s]}>{t.migrate.severity[s]}</Badge>
                          {grouped[s].length}
                        </summary>
                        <ul className="mt-2 flex flex-col gap-1.5 text-body-s text-ink">
                          {grouped[s].map((p, i) => {
                            const cat = CATEGORY_BY_KEY[p.key];
                            return (
                              <li key={i} className="flex flex-col">
                                <span className="text-caption text-muted">
                                  {[cat ? t.migrate.categories[cat] : p.key, p.legacyId]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </span>
                                <span>{p.detail}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    ))}
                </div>
              )}
            </Section>

            {failed && (
              <Notice tone="danger" role="alert" title={t.migrate.failedTitle}>
                {t.migrate.failedBody}
              </Notice>
            )}

            {running ? (
              <Card padding="lg" className="flex flex-col items-center gap-4 text-center" aria-live="polite">
                <SproutProgress
                  step={progress ? progress.index + 1 : 0}
                  total={MIGRATION_STEPS.length}
                  label={t.migrate.running}
                />
                <p className="text-body text-ink">
                  {progress ? t.migrate.steps[progress.step] : t.migrate.running}
                </p>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {source === 'browser' && <p className="text-body-s text-muted">{t.migrate.backupFirst}</p>}
                <Button
                  size="lg"
                  className="self-start"
                  onClick={() => void start()}
                  disabled={!plan.detected}
                >
                  {failed ? t.migrate.resume : t.migrate.start}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog
        open={cleanup}
        onOpenChange={setCleanup}
        title={t.migrate.cleanupTitle}
        description={t.migrate.cleanupBody}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCleanup(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                removeLegacyData();
                setCleanup(false);
                setRawVersion((v) => v + 1);
                toast.success(t.migrate.cleanedUp);
              }}
            >
              {t.migrate.cleanupAction}
            </Button>
          </>
        }
      />
      {!done && !running && !plan.detected && (
        <p className="mt-6 text-body-s text-muted">
          {t.data.legacyNone}{' '}
          <Link to="/settings/data" className={buttonClasses('ghost', 'sm')}>
            {t.data.title}
          </Link>
        </p>
      )}
    </Page>
  );
}

function VerificationTable({
  tables,
}: {
  tables: Record<keyof LegacyRecords, { expected: number; found: number }>;
}) {
  const t = useT();
  const rows = (Object.keys(tables) as Array<keyof LegacyRecords>).filter((k) => tables[k].expected > 0);
  return (
    <table className="w-full text-left text-body-s">
      <thead className="text-caption text-muted">
        <tr>
          <th scope="col" className="py-1.5 pr-3 font-medium">
            {t.migrate.colType}
          </th>
          <th scope="col" className="px-2 py-1.5 text-right font-medium">
            {t.migrate.colExpected}
          </th>
          <th scope="col" className="py-1.5 pl-2 text-right font-medium">
            {t.migrate.colPresent}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((k) => (
          <tr key={k} className="border-t border-line">
            <th scope="row" className="py-1.5 pr-3 font-normal text-ink">
              {t.data.tables[k]}
            </th>
            <td className="px-2 py-1.5 text-right tabular-nums">{tables[k].expected}</td>
            <td className="py-1.5 pl-2 text-right tabular-nums">{tables[k].found}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
