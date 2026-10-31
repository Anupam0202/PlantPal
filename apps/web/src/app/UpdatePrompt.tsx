import { useEffect } from 'react';
import { toast } from 'sonner';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useT } from '../i18n';
import { useDrafts } from '../state/drafts';

/** Shows "update ready" and never reloads while a draft is dirty (master prompt §14.5). */
export function UpdatePrompt() {
  const t = useT();
  const dirty = useDrafts((s) => s.dirtyCount > 0);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  useEffect(() => {
    if (offlineReady) {
      toast(t.offlineReady);
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady, t.offlineReady]);

  useEffect(() => {
    if (!needRefresh) return;
    const id = toast(t.update.ready, {
      duration: Infinity,
      description: dirty ? t.update.draftWarning : undefined,
      action: dirty ? undefined : { label: t.update.reload, onClick: () => void updateServiceWorker(true) },
      cancel: { label: t.update.later, onClick: () => setNeedRefresh(false) },
    });
    return () => {
      toast.dismiss(id);
    };
  }, [needRefresh, dirty, t, updateServiceWorker, setNeedRefresh]);

  return null;
}
