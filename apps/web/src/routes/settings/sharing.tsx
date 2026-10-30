import type { Role } from '@plantpal/sync';
import {
  Badge,
  Button,
  Card,
  CheckboxField,
  Notice,
  PageHeader,
  Section,
  SelectField,
  Spinner,
  TextField,
} from '@plantpal/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Copy, Link2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '../../app/Page';
import { useActiveGarden, useWorkspaceId, useZones } from '../../data/queries';
import { useLocalWorkspaces, useMe } from '../../features/account/hooks';
import { useAccountT } from '../../features/account/messages';
import { useFormat } from '../../i18n';
import { clockNow } from '../../lib/clock';
import { api, ApiError, type ShareLink } from '../../sync/api';

export const Route = createFileRoute('/settings/sharing')({
  component: SharingPage,
});

const DAY = 86_400_000;
const errorText = (e: unknown, fallback: string) =>
  e instanceof ApiError && e.message ? e.message : fallback;

function SharingPage() {
  const t = useAccountT();
  const { state } = useMe();
  const wsId = useWorkspaceId();
  const { list } = useLocalWorkspaces();
  const ws = list?.find((w) => w.id === wsId);

  let body;
  if (state.kind === 'loading' || !ws) body = <Spinner />;
  else if (state.kind !== 'signed-in' || ws.mode !== 'synced') body = <Notice>{t.sharing.needsSync}</Notice>;
  else {
    const role = state.me.workspaces.find((w) => w.id === ws.id)?.role ?? null;
    body = <Sharing workspaceId={ws.id} me={state.me.user.id} role={role} />;
  }
  return (
    <Page width="narrow">
      <PageHeader title={t.sharing.title} description={ws?.name} />
      <div className="mt-6 flex flex-col gap-6">{body}</div>
    </Page>
  );
}

function Sharing({ workspaceId, me, role }: { workspaceId: string; me: string; role: Role | null }) {
  const t = useAccountT();
  const owner = role === 'owner';
  return (
    <>
      <Members workspaceId={workspaceId} me={me} owner={owner} />
      {owner ? (
        <>
          <Invite workspaceId={workspaceId} />
          <SitterLinks workspaceId={workspaceId} />
        </>
      ) : (
        <Notice>{t.sharing.onlyOwner}</Notice>
      )}
    </>
  );
}

function Members({ workspaceId, me, owner }: { workspaceId: string; me: string; owner: boolean }) {
  const t = useAccountT();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => api.members(workspaceId),
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['members', workspaceId] });
  const roles = Object.keys(t.sharing.roles) as Role[];
  return (
    <Section title={t.sharing.members}>
      {q.isPending && <Spinner />}
      {q.isError && <Notice tone="warning">{errorText(q.error, t.account.failed)}</Notice>}
      <ul className="flex flex-col gap-2">
        {q.data?.members.map((m) => {
          const who = m.name ?? t.sharing.roles[m.role];
          const self = m.userId === me;
          return (
            <li key={m.userId}>
              <Card className="flex flex-col gap-3">
                <p className="font-medium text-ink">
                  {who} {self && <span className="text-muted">({t.sharing.you})</span>}
                </p>
                {owner && !self ? (
                  <SelectField<Role>
                    label={t.sharing.roleFor(who)}
                    value={m.role}
                    onValueChange={async (next) => {
                      try {
                        await api.setRole(workspaceId, m.userId, next);
                        await refresh();
                      } catch (e) {
                        toast.error(errorText(e, t.sharing.lastOwner));
                      }
                    }}
                    options={roles.map((r) => ({ value: r, label: t.sharing.roles[r] }))}
                    description={t.sharing.roleHelp[m.role]}
                  />
                ) : (
                  <p className="text-body-s text-muted">
                    <Badge>{t.sharing.roles[m.role]}</Badge> {t.sharing.roleHelp[m.role]}
                  </p>
                )}
                {(owner || self) && (
                  <div>
                    <Button
                      size="sm"
                      variant="danger-soft"
                      aria-label={self ? t.sharing.leave : t.sharing.removeWho(who)}
                      onClick={async () => {
                        try {
                          await api.removeMember(workspaceId, m.userId);
                          toast(t.sharing.removed);
                          await refresh();
                          if (self) await qc.invalidateQueries({ queryKey: ['me'] });
                        } catch (e) {
                          toast.error(errorText(e, t.sharing.lastOwner));
                        }
                      }}
                    >
                      {self ? t.sharing.leave : t.sharing.remove}
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function CopyLink({ label, url }: { label: string; url: string }) {
  const t = useAccountT();
  return (
    <Notice tone="success" title={label}>
      <p className="break-all font-mono text-caption">{url}</p>
      <Button
        className="mt-2"
        size="sm"
        variant="secondary"
        icon={<Copy className="size-4" aria-hidden="true" />}
        onClick={async () => {
          await navigator.clipboard?.writeText(url).catch(() => undefined);
          toast(t.sharing.copied);
        }}
      >
        {t.sharing.copy}
      </Button>
    </Notice>
  );
}

function Invite({ workspaceId }: { workspaceId: string }) {
  const t = useAccountT();
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('helper');
  const [ttl, setTtl] = useState('72');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  return (
    <Section title={t.sharing.invite}>
      <Card className="flex flex-col gap-3">
        <SelectField<Exclude<Role, 'owner'>>
          label={t.sharing.inviteRole}
          value={role}
          onValueChange={setRole}
          options={(['gardener', 'helper', 'viewer'] as const).map((r) => ({
            value: r,
            label: t.sharing.roles[r],
          }))}
          description={t.sharing.roleHelp[role]}
        />
        <SelectField<string>
          label={t.sharing.inviteTtl}
          value={ttl}
          onValueChange={setTtl}
          options={['24', '72', '168'].map((h) => ({ value: h, label: t.sharing.hours(Number(h)) }))}
        />
        <Button
          loading={busy}
          icon={<UserPlus className="size-4" aria-hidden="true" />}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api.invite(workspaceId, role, Number(ttl));
              // The token travels in the fragment, which browsers never send to a server.
              setLink(`${location.origin}/join#${r.token}`);
            } catch (e) {
              toast.error(errorText(e, t.account.failed));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t.sharing.createInvite}
        </Button>
        {link && <CopyLink label={t.sharing.inviteReady} url={link} />}
      </Card>
    </Section>
  );
}

/** The person's own calendar date (not UTC), as `YYYY-MM-DD` for date inputs. */
const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfDay = (s: string) => new Date(`${s}T00:00:00`).getTime();

function linkState(l: ShareLink, now: number): 'active' | 'scheduled' | 'ended' | 'revoked' {
  if (l.revokedAt !== null) return 'revoked';
  if (now < l.startsAt) return 'scheduled';
  if (now >= l.expiresAt) return 'ended';
  return 'active';
}

function SitterLinks({ workspaceId }: { workspaceId: string }) {
  const t = useAccountT();
  const fmt = useFormat();
  const qc = useQueryClient();
  const { garden } = useActiveGarden();
  const zones = useZones(garden?.id ?? undefined);
  const [now] = useState(clockNow);
  const today = localDay(new Date(now));
  const [label, setLabel] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [from, setFrom] = useState(today);
  const [until, setUntil] = useState(() => localDay(new Date(now + 7 * DAY)));
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['share-links', workspaceId],
    queryFn: () => api.shareLinks(workspaceId),
    retry: false,
  });
  const startsAt = startOfDay(from);
  const expiresAt = startOfDay(until) + DAY;
  const tooLong = expiresAt - startsAt > 30 * DAY || expiresAt <= startsAt;

  return (
    <Section title={t.sitter.title}>
      <p className="mb-3 text-body-s text-muted">{t.sitter.body}</p>
      {garden && (
        <Card className="flex flex-col gap-3">
          <TextField label={t.sitter.label} value={label} onValueChange={setLabel} maxLength={80} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-body-s font-medium text-ink">{t.sitter.spaces}</legend>
            {zones?.map((z) => (
              <CheckboxField
                key={z.id}
                label={z.name}
                checked={picked.includes(z.id)}
                onCheckedChange={(on) => setPicked((p) => (on ? [...p, z.id] : p.filter((x) => x !== z.id)))}
              />
            ))}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <TextField label={t.sitter.from} type="date" value={from} min={today} onValueChange={setFrom} />
            <TextField label={t.sitter.until} type="date" value={until} min={from} onValueChange={setUntil} />
          </div>
          {tooLong && <p className="text-body-s text-danger">{t.sitter.maxDays}</p>}
          <Button
            loading={busy}
            disabled={!label.trim() || picked.length === 0 || tooLong}
            icon={<Link2 className="size-4" aria-hidden="true" />}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api.createShareLink(workspaceId, {
                  gardenId: garden.id,
                  zoneIds: picked,
                  label: label.trim(),
                  startsAt,
                  expiresAt,
                });
                setLink(`${location.origin}/sit#${r.token}`);
                await qc.invalidateQueries({ queryKey: ['share-links', workspaceId] });
              } catch (e) {
                toast.error(errorText(e, t.account.failed));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t.sitter.create}
          </Button>
          {picked.length === 0 && <p className="text-caption text-muted">{t.sitter.pickSpace}</p>}
          {link && <CopyLink label={t.sitter.ready} url={link} />}
        </Card>
      )}
      <ul className="mt-3 flex flex-col gap-2">
        {q.data?.links.map((l) => {
          const st = linkState(l, now);
          return (
            <li key={l.id}>
              <Card className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 font-medium text-ink">{l.label}</span>
                  <Badge tone={st === 'active' ? 'accent' : st === 'scheduled' ? 'info' : 'neutral'}>
                    {t.sitter[st]}
                  </Badge>
                </div>
                <p className="text-body-s text-muted">
                  {fmt.date(new Date(l.startsAt))} – {fmt.date(new Date(l.expiresAt - 1))}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setOpen(open === l.id ? null : l.id)}>
                    {t.sitter.summary}
                  </Button>
                  {st !== 'revoked' && st !== 'ended' && (
                    <Button
                      size="sm"
                      variant="danger-soft"
                      onClick={async () => {
                        await api.revokeShareLink(workspaceId, l.id).catch(() => undefined);
                        await qc.invalidateQueries({ queryKey: ['share-links', workspaceId] });
                      }}
                    >
                      {t.sitter.revoke}
                    </Button>
                  )}
                </div>
                {open === l.id && <Summary workspaceId={workspaceId} linkId={l.id} />}
              </Card>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Summary({ workspaceId, linkId }: { workspaceId: string; linkId: string }) {
  const t = useAccountT();
  const fmt = useFormat();
  const q = useQuery({
    queryKey: ['share-summary', linkId],
    queryFn: () => api.linkSummary(workspaceId, linkId),
    retry: false,
  });
  if (q.isPending) return <Spinner />;
  const care = q.data?.care ?? [];
  if (care.length === 0) return <p className="text-body-s text-muted">{t.sitter.nothingLogged}</p>;
  return (
    <ul className="list-disc pl-5 text-body-s">
      {care.map((c) => (
        <li key={String(c.id)}>
          {fmt.date(new Date(Number(c.occurredAt)), {
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })}
          : {String(c.notes ?? c.kind)}
        </li>
      ))}
    </ul>
  );
}
