import { toast } from 'sonner';
import type { Messages } from '../../i18n/en';
import { MediaError, StorageFullError, VersionConflictError, RecordNotFoundError } from '../../data/errors';

/** Shows a plain-language toast for a failed write. Returns the message. */
export function reportError(t: Messages, e: unknown): string {
  let msg = t.common.somethingWrong;
  if (e instanceof StorageFullError) msg = t.storage.full;
  else if (e instanceof VersionConflictError) msg = t.plant.conflict;
  else if (e instanceof RecordNotFoundError) msg = t.plant.notFound;
  else if (e instanceof MediaError) msg = t.photo.errors[e.code];
  toast.error(msg);
  if (!(e instanceof StorageFullError || e instanceof VersionConflictError || e instanceof MediaError))
    console.error(e);
  return msg;
}
