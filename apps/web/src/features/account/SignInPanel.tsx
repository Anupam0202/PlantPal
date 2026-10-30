import { Button, Card, Notice, TextField } from '@plantpal/ui';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '../../sync/api';
import { cancelled, passkeysSupported, signIn, signUp } from '../../sync/passkey';
import { requestSync } from '../../sync/runner';
import { useAccountT } from './messages';

/** Passkey sign-up and sign-in. Nothing is stored on the server until the passkey verifies. */
export function SignInPanel({ onDone }: { onDone?: () => void }) {
  const t = useAccountT();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'up' | 'in' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!passkeysSupported()) return <Notice tone="warning">{t.account.unsupported}</Notice>;

  const run = async (kind: 'up' | 'in') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'up') await signUp(name);
      else await signIn();
      await qc.invalidateQueries({ queryKey: ['me'] });
      toast.success(kind === 'up' ? t.account.created : t.account.signedIn);
      requestSync();
      onDone?.();
    } catch (e) {
      if (cancelled(e)) setError(t.account.cancelled);
      else if (e instanceof ApiError && e.code === 'OFFLINE') setError(t.account.offline);
      else setError(e instanceof ApiError && e.message ? e.message : t.account.failed);
    } finally {
      setBusy(null);
    }
  };

  const nameOk = name.trim().length > 0 && name.trim().length <= 60;
  return (
    <Card className="flex flex-col gap-4">
      <p className="text-body-s text-muted">{t.account.noPasswords}</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (nameOk) void run('up');
        }}
      >
        <TextField
          label={t.account.nameLabel}
          description={t.account.nameHint}
          value={name}
          onValueChange={setName}
          maxLength={60}
          autoComplete="nickname"
        />
        <Button
          type="submit"
          disabled={!nameOk || busy !== null}
          loading={busy === 'up'}
          icon={<UserPlus className="size-4" aria-hidden="true" />}
        >
          {t.account.create}
        </Button>
      </form>
      <Button
        variant="secondary"
        disabled={busy !== null}
        loading={busy === 'in'}
        onClick={() => void run('in')}
        icon={<KeyRound className="size-4" aria-hidden="true" />}
      >
        {t.account.signIn}
      </Button>
      {error && (
        <Notice tone="warning" role="alert">
          {error}
        </Notice>
      )}
    </Card>
  );
}
