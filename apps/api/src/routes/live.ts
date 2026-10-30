import type { AccountsStore } from '../lib/accounts';
import type { Rooms } from '../lib/rooms';
import type { Authenticator } from './accounts';

export const LIVE_PATH = /^\/api\/v1\/workspaces\/([0-9A-HJKMNP-TV-Z]{26})\/live$/;

const problem = (status: number, code: string, title: string) =>
  new Response(
    JSON.stringify({
      type: `https://plantpal.app/problems/${code.toLowerCase().replaceAll('_', '-')}`,
      title,
      status,
      code,
      traceId: crypto.randomUUID(),
    }),
    { status, headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' } },
  );

/**
 * WebSocket for live change pings. Handled before the app router so the upgrade response reaches
 * the browser untouched. Session and membership are checked first, as on every route.
 */
export async function connectLive(
  deps: { auth: Authenticator; accounts: AccountsStore; rooms: Rooms; origins: readonly string[] },
  workspaceId: string,
  req: Request,
): Promise<Response> {
  if (req.method !== 'GET') return problem(405, 'VALIDATION_FAILED', 'Use GET');
  // WebSockets skip CORS: refuse handshakes started by other sites (cross-site socket hijacking).
  const origin = req.headers.get('origin');
  if (origin && !deps.origins.includes(origin)) return problem(403, 'FORBIDDEN', 'Not allowed');
  const user = await deps.auth.userOf(req);
  if (!user) return problem(401, 'UNAUTHENTICATED', 'Sign-in required');
  if (!(await deps.accounts.roleOf(workspaceId, user.id))) return problem(403, 'FORBIDDEN', 'Not allowed');
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket')
    return problem(400, 'VALIDATION_FAILED', 'Expected a WebSocket upgrade');
  return deps.rooms.connect(workspaceId, user.id, req);
}
