import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  Button,
  buttonClasses,
  Card,
  Dialog,
  Notice,
  PageHeader,
  SegmentedControl,
  Section,
  Spinner,
  TextField,
} from '@plantpal/ui';
import { parseLegacyBackup } from '@plantpal/domain';
import { Download, FileSpreadsheet, HardDrive, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import {
  applyImport,
  buildArchive,
  buildCsvExport,
  ImportError,
  readArchive,
  type ArchiveTable,
  type ImportPreview,
} from '../../data/archive';
import { deleteAllLocalData } from '../../data/commands';
import { getMigrationState } from '../../data/legacy/run';
import { hasLegacyData } from '../../data/legacy/storage';
import { useLegacyAchievements } from '../../data/queries';
import { requestPersistence, storageInfo, type StorageInfo } from '../../data/storage';
import { reportError } from '../../features/garden/errors';
import { useFormat, useT } from '../../i18n';
import { downloadBlob, formatBytes } from '../../lib/download';
import { useLegacySource } from '../../state/legacySource';

export const Route = createFileRoute('/settings/data')({
  component: DataPage,
});

function DataPage() {
  const t = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const setLegacyFile = useLegacySource((s) => s.setFile);
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState<'backup' | 'csv' | 'read' | 'import' | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [onConflict, setOnConflict] = useState<'keep' | 'replace'>('keep');
  const [confirmText, setConfirmText] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const migration = useLiveQuery(() => getMigrationState(), []);
  const achievements = useLegacyAchievements();
  const [legacyHere] = useState(() => hasLegacyData());

  useEffect(() => {
    void storageInfo().then(setInfo);
  }, []);

  const exportBackup = async () => {
    setBusy('backup');
    try {
      const { blob, filename } = await buildArchive();
      downloadBlob(blob, filename);
      toast.success(t.data.exported);
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = async () => {
    setBusy('csv');
    try {
      const { blob, filename } = await buildCsvExport();
      downloadBlob(blob, filename);
      toast.success(t.data.exported);
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy('read');
    try {
      if (file.name.endsWith('.json') || file.type === 'application/json') {
        const raw = parseLegacyBackup(await file.text());
        if (!raw) throw new ImportError('not-a-zip');
        setLegacyFile(raw, file.name);
        await navigate({ to: '/settings/migrate', search: { source: 'file' } });
        return;
      }
      setPreview(await readArchive(file));
    } catch (e) {
      if (e instanceof ImportError) toast.error(t.data.importErrors[e.code]);
      else reportError(t, e);
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const runImport = async () => {
    if (!preview) return;
    setBusy('import');
    try {
      const r = await applyImport(preview, onConflict);
      toast.success(t.data.imported(r.added + r.replaced));
      setPreview(null);
    } catch (e) {
      reportError(t, e);
    } finally {
      setBusy(null);
    }
  };

  const tables = preview
    ? (Object.keys(preview.tables) as ArchiveTable[]).filter(
        (k) => preview.tables[k].incoming + preview.tables[k].invalid > 0,
      )
    : [];
  const anyConflict = preview ? tables.some((k) => preview.tables[k].conflicts > 0) : false;

  return (
    <Page width="narrow">
      <Link to="/settings" className="mb-3 inline-flex text-body-s text-muted hover:text-ink">
        ← {t.settings.title}
      </Link>
      <PageHeader title={t.data.title} description={t.data.description} />

      <div className="mt-8 flex flex-col gap-10">
        <Section title={t.data.storage} headingLevel={2}>
          <Card padding="md" className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <HardDrive className="size-5 text-muted" aria-hidden="true" />
              <p className="text-body-s text-ink">
                {info?.usage != null && info.quota != null
                  ? t.data.used(formatBytes(info.usage), formatBytes(info.quota))
                  : t.data.usedUnknown}
              </p>
            </div>
            <p className="text-body-s text-muted">
              {info?.persisted ? t.storage.persisted : t.storage.notPersisted}
            </p>
            {info && !info.persisted && (
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() =>
                  void requestPersistence().then(async () => {
                    setInfo(await storageInfo());
                  })
                }
              >
                {t.storage.persistAction}
              </Button>
            )}
          </Card>
        </Section>

        <Section title={t.data.export} headingLevel={2}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card padding="md" className="flex flex-col gap-3">
              <h3 className="font-medium text-ink">{t.data.exportBackup}</h3>
              <p className="flex-1 text-body-s text-muted">{t.data.exportBackupHint}</p>
              <Button onClick={() => void exportBackup()} loading={busy === 'backup'}>
                <Download className="size-4" aria-hidden="true" />
                {t.common.download}
              </Button>
            </Card>
            <Card padding="md" className="flex flex-col gap-3">
              <h3 className="font-medium text-ink">{t.data.exportCsv}</h3>
              <p className="flex-1 text-body-s text-muted">{t.data.exportCsvHint}</p>
              <Button variant="secondary" onClick={() => void exportCsv()} loading={busy === 'csv'}>
                <FileSpreadsheet className="size-4" aria-hidden="true" />
                {t.common.download}
              </Button>
            </Card>
          </div>
        </Section>

        <Section title={t.data.import} id="import" headingLevel={2}>
          <Card padding="md" className="flex flex-col gap-3">
            <p className="text-body-s text-muted">{t.data.importHint}</p>
            <input
              ref={fileInput}
              type="file"
              accept=".zip,.json,application/zip,application/json"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="import-input"
              onChange={(e) => void onFile(e.currentTarget.files?.[0])}
            />
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => fileInput.current?.click()}
              disabled={busy === 'read'}
            >
              {busy === 'read' ? <Spinner /> : <Upload className="size-4" aria-hidden="true" />}
              {busy === 'read' ? t.data.reading : t.data.chooseFile}
            </Button>
          </Card>
        </Section>

        <Section title={t.data.legacy} headingLevel={2}>
          <Card padding="md" className="flex flex-col gap-3">
            <p className="text-body-s text-ink">
              {migration?.status === 'done' && migration.finishedAt
                ? t.data.legacyDone(f.date(new Date(migration.finishedAt), { dateStyle: 'medium' }))
                : legacyHere
                  ? t.data.legacyFound
                  : t.data.legacyNone}
            </p>
            {legacyHere && (
              <Link
                to="/settings/migrate"
                search={{ source: 'browser' }}
                className={buttonClasses('secondary', 'sm', 'self-start')}
              >
                {t.data.legacyReview}
              </Link>
            )}
            {achievements && (
              <div className="border-t border-line pt-3">
                <h3 className="text-body-s font-semibold text-ink">{t.migrate.legacyAchievements}</h3>
                <p className="text-body-s text-muted">
                  {t.migrate.legacyAchievementsBody(
                    achievements.xp !== null ? f.number(achievements.xp) : '—',
                    achievements.level !== null ? f.number(achievements.level) : '—',
                    achievements.badges.length,
                  )}
                </p>
              </div>
            )}
          </Card>
        </Section>

        <Section title={t.data.danger} headingLevel={2}>
          <Card padding="md" variant="outline" className="flex flex-col gap-3 border-danger/40">
            <p className="text-body-s text-ink">{t.data.dangerBody}</p>
            <Button variant="danger-soft" className="self-start" onClick={() => setConfirmOpen(true)}>
              {t.data.dangerAction}
            </Button>
          </Card>
        </Section>
      </div>

      <Dialog
        open={preview !== null}
        onOpenChange={(o) => !o && setPreview(null)}
        title={t.data.previewTitle}
        description={
          preview
            ? t.data.previewBody(f.date(new Date(preview.manifest.exportedAt), { dateStyle: 'medium' }))
            : undefined
        }
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              {t.common.cancel}
            </Button>
            <Button onClick={() => void runImport()} loading={busy === 'import'}>
              {t.data.importAction}
            </Button>
          </>
        }
      >
        {preview && (
          <div className="flex flex-col gap-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-s">
                <thead className="text-caption text-muted">
                  <tr>
                    <th scope="col" className="py-1.5 pr-3 font-medium">
                      {t.data.colType}
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-right font-medium">
                      {t.data.colNew}
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-right font-medium">
                      {t.data.colSame}
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-right font-medium">
                      {t.data.colConflict}
                    </th>
                    <th scope="col" className="py-1.5 pl-2 text-right font-medium">
                      {t.data.colInvalid}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map((k) => (
                    <tr key={k} className="border-t border-line">
                      <th scope="row" className="py-1.5 pr-3 font-normal text-ink">
                        {t.data.tables[k]}
                      </th>
                      <td className="px-2 py-1.5 text-right tabular-nums">{preview.tables[k].new}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{preview.tables[k].same}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{preview.tables[k].conflicts}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">{preview.tables[k].invalid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.unknownFiles.length > 0 && (
              <Notice tone="warning">{t.data.unknownFiles(preview.unknownFiles.length)}</Notice>
            )}
            {anyConflict && (
              <div className="flex flex-col gap-2">
                <span className="text-body-s font-medium text-ink" aria-hidden="true">
                  {t.data.conflictChoice}
                </span>
                <SegmentedControl
                  label={t.data.conflictChoice}
                  value={onConflict}
                  onValueChange={setOnConflict}
                  options={[
                    { value: 'keep', label: t.data.keepMine },
                    { value: 'replace', label: t.data.useBackup },
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </Dialog>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o);
          if (!o) setConfirmText('');
        }}
        title={t.data.danger}
        description={t.data.dangerBody}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="danger"
              disabled={confirmText !== 'DELETE'}
              onClick={() =>
                void deleteAllLocalData()
                  .then(() => {
                    setConfirmOpen(false);
                    setConfirmText('');
                    toast.success(t.data.dangerDone);
                  })
                  .catch((e: unknown) => reportError(t, e))
              }
            >
              {t.data.dangerAction}
            </Button>
          </>
        }
      >
        <TextField
          label={t.data.dangerConfirmLabel}
          value={confirmText}
          onValueChange={setConfirmText}
          autoComplete="off"
        />
      </Dialog>
    </Page>
  );
}
