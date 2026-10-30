import { Badge, Button, Card, Dialog, SelectField, TextField } from '@plantpal/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Flag } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { community, type ContentType, type Notice, type ReportReason } from '../../community/api';
import { useFormat } from '../../i18n';
import { COMMUNITY_KEY, problemText } from './hooks';
import { useCommunityT } from './messages';

const REASONS: ReportReason[] = [
  'spam',
  'harassment',
  'invasive_or_unsafe',
  'illegal',
  'misinformation',
  'other',
];

/** Report a post, event, listing or question to moderators. */
export function ReportButton({ type, id }: { type: ContentType; id: string }) {
  const c = useCommunityT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await community.report(type, id, reason, note.trim());
      toast.success(c.report.sent);
      setOpen(false);
      setNote('');
    } catch (e) {
      toast.error(problemText(e, c.failed));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="sm"
      trigger={
        <Button variant="ghost" size="sm" icon={<Flag className="size-4" aria-hidden="true" />}>
          {c.report.action}
        </Button>
      }
      title={c.report.title}
      description={c.report.intro}
      footer={
        <Button loading={busy} onClick={() => void send()}>
          {c.report.send}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <SelectField<ReportReason>
          label={c.report.reason}
          value={reason}
          onValueChange={setReason}
          options={REASONS.map((r) => ({ value: r, label: c.report.reasons[r] }))}
        />
        <TextField
          label={c.report.note}
          value={note}
          onValueChange={setNote}
          maxLength={500}
          multiline
          rows={2}
        />
      </div>
    </Dialog>
  );
}

/** Block someone: both stop seeing each other's posts and listings. */
export function BlockButton({ userId, name, onDone }: { userId: string; name: string; onDone?: () => void }) {
  const c = useCommunityT();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={busy}
      icon={<Ban className="size-4" aria-hidden="true" />}
      onClick={async () => {
        setBusy(true);
        try {
          await community.block(userId);
          toast(c.block.done);
          await qc.invalidateQueries({ queryKey: ['community-content'] });
          onDone?.();
        } catch (e) {
          toast.error(problemText(e, c.failed));
        } finally {
          setBusy(false);
        }
      }}
    >
      {c.block.action(name)}
    </Button>
  );
}

export function BlockedPeople() {
  const c = useCommunityT();
  const qc = useQueryClient();
  const blocks = useQuery({ queryKey: ['community-content', 'blocks'], queryFn: community.blocks });
  const list = blocks.data?.blocks ?? [];
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-body-s font-semibold text-ink">{c.block.title}</h3>
      {list.length === 0 ? (
        <p className="text-body-s text-muted">{c.block.empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {list.map((b) => (
            <li key={b.userId} className="flex items-center justify-between gap-2 text-body-s">
              <span>{b.displayName ?? '—'}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await community.unblock(b.userId).catch(() => undefined);
                  toast(c.block.unblocked);
                  await qc.invalidateQueries({ queryKey: ['community-content'] });
                }}
              >
                {c.block.unblock}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const RECENT = 90 * 86_400_000;

/** Moderation decisions about my content or account, each with a way to appeal. */
export function ModerationNotices({ notices, now }: { notices: Notice[]; now: number }) {
  const c = useCommunityT();
  const recent = notices.filter((n) => now - n.createdAt < RECENT).slice(0, 5);
  if (recent.length === 0) return null;
  return (
    <Card className="flex flex-col gap-3" data-testid="moderation-notices">
      <h2 className="text-body font-semibold text-ink">{c.notices.title}</h2>
      <ul className="flex flex-col gap-3">
        {recent.map((n) => (
          <NoticeRow key={n.id} notice={n} />
        ))}
      </ul>
    </Card>
  );
}

function NoticeRow({ notice: n }: { notice: Notice }) {
  const c = useCommunityT();
  const fmt = useFormat();
  const qc = useQueryClient();
  const [appealing, setAppealing] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const what =
    n.targetType === 'user'
      ? c.notices.about('user')
      : c.notices.about(c.contentTypes[n.targetType as ContentType] ?? n.targetType);
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={n.action === 'warn' ? 'warning' : 'danger'}>
          {c.notices.actions[n.action] ?? n.action}
        </Badge>
        <span className="text-body-s text-ink">
          {what}
          {n.until ? ` · ${c.notices.until(fmt.date(new Date(n.until), { dateStyle: 'medium' }))}` : ''}
        </span>
      </div>
      <p className="text-body-s text-muted">{n.reason}</p>
      {n.appeal ? (
        <p className="text-caption text-muted">{c.notices.appealState[n.appeal] ?? n.appeal}</p>
      ) : appealing ? (
        <div className="flex flex-col gap-2">
          <TextField
            label={c.notices.appealLabel}
            value={body}
            onValueChange={setBody}
            maxLength={1000}
            multiline
            rows={2}
          />
          <div>
            <Button
              size="sm"
              loading={busy}
              disabled={!body.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await community.appeal(n.id, body.trim());
                  toast.success(c.notices.appealSent);
                  await qc.invalidateQueries({ queryKey: COMMUNITY_KEY });
                } catch (e) {
                  toast.error(problemText(e, c.failed));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {c.notices.appeal}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button size="sm" variant="secondary" onClick={() => setAppealing(true)}>
            {c.notices.appeal}
          </Button>
        </div>
      )}
    </li>
  );
}
