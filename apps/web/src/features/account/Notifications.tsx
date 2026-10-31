import { Button, Card, Notice, Section } from '@plantpal/ui';
import { useQuery } from '@tanstack/react-query';
import { Bell, BellOff, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '../../sync/api';
import { useAccountT } from './messages';

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** iPhone and iPad deliver web push only to Home Screen apps (iOS 16.4+). */
const iosBrowser = () =>
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.matchMedia?.('(display-mode: standalone)').matches;

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function registration() {
  return supported() ? ((await navigator.serviceWorker.getRegistration()) ?? null) : null;
}

/** Opt-in Web Push for this device (§21). Asking for permission happens only on a tap. */
export function Notifications() {
  const t = useAccountT();
  const key = useQuery({ queryKey: ['push-key'], queryFn: api.pushKey, retry: false, staleTime: Infinity });
  const [sub, setSub] = useState<PushSubscription | null | undefined>(undefined);
  const [reg, setReg] = useState<ServiceWorkerRegistration | null | undefined>(undefined);
  const [busy, setBusy] = useState<'on' | 'off' | 'test' | null>(null);
  const [denied, setDenied] = useState(() => supported() && Notification.permission === 'denied');

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await registration();
      const s = r ? await r.pushManager.getSubscription() : null;
      if (live) {
        setReg(r);
        setSub(s);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const fail = (e: unknown) => toast.error(e instanceof ApiError && e.message ? e.message : t.account.failed);

  const turnOn = async () => {
    if (!reg || !key.data) return;
    setBusy('on');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setDenied(permission === 'denied');
        return;
      }
      const s = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(key.data.publicKey),
      });
      const json = s.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await api.subscribe({ endpoint: json.endpoint, keys: json.keys });
      setSub(s);
      toast.success(t.push.on);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const turnOff = async () => {
    if (!sub) return;
    setBusy('off');
    try {
      await api.unsubscribe(sub.endpoint).catch(() => undefined);
      await sub.unsubscribe();
      setSub(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      const r = await api.pushTest();
      if (r.sent > 0) toast.success(t.push.testSent);
      else toast(t.push.testNone);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  let body;
  if (key.isError) body = <Notice>{t.push.unavailable}</Notice>;
  else if (!supported() || reg === null)
    body = <Notice>{iosBrowser() ? t.push.ios : t.push.unsupported}</Notice>;
  else if (denied) body = <Notice tone="warning">{t.push.denied}</Notice>;
  else if (sub)
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-body-s text-ink">{t.push.on}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="soft"
            loading={busy === 'test'}
            onClick={() => void test()}
            icon={<Send className="size-4" aria-hidden="true" />}
          >
            {t.push.test}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'off'}
            onClick={() => void turnOff()}
            icon={<BellOff className="size-4" aria-hidden="true" />}
          >
            {t.push.turnOff}
          </Button>
        </div>
      </div>
    );
  else
    body = (
      <div>
        <Button
          loading={busy === 'on'}
          disabled={!key.data || reg === undefined}
          onClick={() => void turnOn()}
          icon={<Bell className="size-4" aria-hidden="true" />}
        >
          {t.push.turnOn}
        </Button>
      </div>
    );

  return (
    <Section title={t.push.title}>
      <Card className="flex flex-col gap-3">
        <p className="text-body-s text-muted">{t.push.body}</p>
        {body}
      </Card>
    </Section>
  );
}
