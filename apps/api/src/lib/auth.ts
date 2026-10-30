import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import type { Authenticator } from '../routes/accounts';

export interface AuthConfig {
  /** D1 in the Worker; any database Better Auth accepts in tests. */
  database: D1Database;
  /** At least 32 random characters, from a Worker secret. Never committed. */
  secret: string;
  /** Where the app is served, e.g. `https://plantpal.example`. Its host is the passkey relying party. */
  publicOrigin: string;
  allowedOrigins: readonly string[];
}

export const NAME_MAX = 60;
export const SESSION_DAYS = 30;

/**
 * Passkey-only accounts (§14.1): no passwords, no email, no third-party sign-in. Sign-up is a
 * passkey ceremony; the account is created only after the authenticator's response verifies.
 */
export function createAuth(cfg: AuthConfig) {
  const origins = [...new Set([cfg.publicOrigin, ...cfg.allowedOrigins])];
  return betterAuth({
    appName: 'PlantPal',
    baseURL: cfg.publicOrigin,
    basePath: '/api/auth',
    secret: cfg.secret,
    database: cfg.database,
    trustedOrigins: origins,
    emailAndPassword: { enabled: false },
    session: { expiresIn: SESSION_DAYS * 86_400, updateAge: 86_400 },
    advanced: {
      useSecureCookies: cfg.publicOrigin.startsWith('https://'),
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
      // Sessions are not stored with IP addresses (§15 data minimisation).
      ipAddress: { disableIpTracking: true },
    },
    // The Worker's per-client limiter (Durable Object) already covers /api/auth/*.
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    plugins: [
      passkey({
        rpID: new URL(cfg.publicOrigin).hostname,
        rpName: 'PlantPal',
        origin: origins,
        registration: {
          requireSession: false,
          // A new person: the name they chose, and a fresh random id that only exists once verified.
          resolveUser: async ({ context }) => {
            const name = (context ?? '').trim();
            if (!name || name.length > NAME_MAX)
              throw new APIError('BAD_REQUEST', { message: `Choose a name of 1 to ${NAME_MAX} characters` });
            return { id: crypto.randomUUID(), name, displayName: name };
          },
          afterVerification: async ({ ctx, user }) => {
            // Signed in already: this is another passkey for the same account.
            if (await ctx.context.internalAdapter.findUserById(user.id)) return;
            await ctx.context.internalAdapter.createUser(
              {
                id: user.id,
                name: user.displayName ?? user.name,
                // Better Auth requires an email; PlantPal never asks for one or sends mail.
                email: `${user.id}@passkey.invalid`,
                emailVerified: false,
              },
              { method: 'passkey' },
            );
            return { userId: user.id };
          },
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Reads the Better Auth session cookie on each request. */
export function sessionAuthenticator(auth: Auth): Authenticator {
  return {
    async userOf(req) {
      const s = await auth.api.getSession({ headers: req.headers });
      return s ? { id: s.user.id, name: s.user.name } : null;
    },
  };
}
