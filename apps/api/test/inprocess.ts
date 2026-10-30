import { readFileSync } from 'node:fs';
import { EnvClient, MemoryCache } from '@plantpal/providers';
import { createApp } from '../src/app';
import { AccountsStore } from '../src/lib/accounts';
import { createAuth, sessionAuthenticator } from '../src/lib/auth';
import { CommunityStore, type StaffRole } from '../src/lib/community-store';
import { MemoryRateLimiter } from '../src/lib/rate-limit';
import { MemoryStatusStore } from '../src/lib/status-store';
import { D1SyncRepo } from '../src/lib/sync-repo';
import { createD1 } from './d1-shim';

/**
 * The real API (passkey accounts, sync, sharing) in this process on in-memory SQLite, for browser
 * tests: Playwright hands it the page's /api requests, so the browser's own WebAuthn runs against
 * Better Auth's real verification without a Worker.
 */
export async function createTestServer(publicOrigin: string, opts: { community?: boolean } = {}) {
  const d1 = createD1();
  const migrations = ['0001_provider_status.sql', '0002_sync.sql', '0003_auth.sql'];
  if (opts.community) migrations.push('0004_push.sql', '0005_community.sql');
  for (const f of migrations)
    await d1.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url).pathname, 'utf8'));
  const store = new CommunityStore(d1);
  const auth = createAuth({
    database: d1,
    secret: 'e2e-only-secret-that-is-at-least-32-chars',
    publicOrigin,
    allowedOrigins: [],
  });
  const sync = new D1SyncRepo(d1);
  const app = createApp({
    env: new EnvClient({ mode: 'mock', cache: new MemoryCache() }),
    status: new MemoryStatusStore(),
    limiter: new MemoryRateLimiter(10_000, 1_000),
    mode: 'mock',
    allowedOrigins: [publicOrigin],
    accounts: { accounts: new AccountsStore(d1), sync, auth: sessionAuthenticator(auth) },
    authHandler: (req) => auth.handler(req),
    // The community is on only when a test asks for it, with no wait for new accounts.
    ...(opts.community ? { community: { enabled: true, store, minAccountHours: 0 } } : {}),
  });
  const userId = async (name: string) => {
    const row = await d1.prepare('SELECT id FROM "user" WHERE name = ?').bind(name).first<{ id: string }>();
    if (!row) throw new Error(`No user named ${name}`);
    return row.id;
  };
  return {
    fetch: (req: Request) => app.fetch(req),
    liveRecords: async (workspaceId: string) =>
      (await sync.liveRecords(workspaceId)).map((r) => ({ entity: r.entity, record: r.record })),
    /** Makes a signed-up person a moderator or admin (normally an admin action). */
    setStaff: async (name: string, role: StaffRole) => store.setStaff(await userId(name), role, Date.now()),
    /** The community cells stored for profiles: proves only coarse cells reach the server. */
    profileCells: async () =>
      (await d1.prepare('SELECT cell, area FROM community_profiles').all<{ cell: string; area: string }>())
        .results,
  };
}
