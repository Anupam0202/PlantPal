import type { Page } from '@playwright/test';

/** Browser tests that need the real API: WebAuthn needs a domain, not an IP, so they run on localhost. */
export const ORIGIN = `http://localhost:${process.env.E2E_PORT ?? 4173}`;

export interface TestServer {
  fetch(req: Request): Promise<Response>;
  liveRecords(workspaceId: string): Promise<Array<{ entity: string; record: Record<string, unknown> }>>;
  setStaff(name: string, role: 'moderator' | 'admin'): Promise<void>;
  profileCells(): Promise<Array<{ cell: string; area: string }>>;
  seedActiveGrowers(cell: string, n: number): Promise<void>;
}

/** The real API in this process (loaded at runtime so the web typecheck stays free of Worker types). */
export async function server(opts: { community?: boolean } = {}): Promise<TestServer> {
  const path = '../../api/test/inprocess.ts';
  const mod = (await import(path)) as {
    createTestServer(origin: string, opts: { community?: boolean }): Promise<TestServer>;
  };
  return mod.createTestServer(ORIGIN, opts);
}

/** Routes the page's /api requests to the in-process API, keeping its cookies like a browser would. */
export async function connect(page: Page, srv: TestServer) {
  const jar = new Map<string, string>();
  await page.route(/\/api\//, async (route) => {
    const req = route.request();
    const headers = new Headers(await req.allHeaders());
    headers.delete('cookie');
    if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    const raw = req.method() === 'GET' ? null : req.postDataBuffer();
    const body = raw ? new Uint8Array(raw) : undefined;
    const res = await srv.fetch(new Request(req.url(), { method: req.method(), headers, body }));
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const i = pair!.indexOf('=');
      const name = pair!.slice(0, i).trim();
      const value = pair!.slice(i + 1).trim();
      if (!value || attrs.some((a) => /max-age=0\b/i.test(a.trim()))) jar.delete(name);
      else jar.set(name, value);
    }
    const out: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      if (k !== 'set-cookie') out[k] = v;
    });
    await route.fulfill({ status: res.status, headers: out, body: Buffer.from(await res.arrayBuffer()) });
  });
}

/** Chromium's virtual authenticator: a platform passkey that always verifies the user. */
export async function passkeyDevice(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials;
}
