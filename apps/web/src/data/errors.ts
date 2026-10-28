/** A versioned record changed since it was read (another tab, device or import). */
export class VersionConflictError extends Error {
  constructor(
    readonly entity: string,
    readonly id: string,
    readonly current: unknown,
  ) {
    super(`${entity} ${id} was changed elsewhere`);
    this.name = 'VersionConflictError';
  }
}

/** Named so it does not collide with the DOM "NotFoundError", which Dexie would re-map. */
export class RecordNotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`);
    this.name = 'RecordNotFoundError';
  }
}

/** The browser refused to store more data, even after clearing caches. */
export class StorageFullError extends Error {
  constructor(cause?: unknown) {
    super('Device storage is full', { cause });
    this.name = 'StorageFullError';
  }
}

export class MediaError extends Error {
  constructor(
    readonly code: 'too-large' | 'unsupported' | 'decode-failed' | 'too-large-after-processing',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'MediaError';
  }
}

export function isQuotaError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const inner = (e as { inner?: unknown }).inner;
  return (
    e.name === 'QuotaExceededError' ||
    (inner instanceof Error && inner.name === 'QuotaExceededError') ||
    /quota/i.test(e.message)
  );
}
