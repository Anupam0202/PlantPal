import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from '@simplewebauthn/browser';
import { ApiError } from './api';

/** Passkey sign-up and sign-in against Better Auth on the Worker (§14.1). No passwords, no email. */
const BASE = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

async function auth<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/auth${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, 'OFFLINE', 'No connection');
  }
  const data = (await res.json().catch(() => null)) as {
    code?: string;
    message?: string;
    detail?: string;
  } | null;
  if (!res.ok)
    throw new ApiError(
      res.status,
      String(data?.code ?? 'UNKNOWN'),
      String(data?.detail ?? data?.message ?? ''),
    );
  return data as T;
}

export const passkeysSupported = () => browserSupportsWebAuthn();

/** The person closed the passkey prompt or it timed out: not an error worth shouting about. */
export const cancelled = (e: unknown) =>
  e instanceof WebAuthnError
    ? e.code === 'ERROR_CEREMONY_ABORTED' || e.name === 'NotAllowedError'
    : e instanceof Error && e.name === 'NotAllowedError';

export async function signUp(name: string): Promise<void> {
  const optionsJSON = await auth<Parameters<typeof startRegistration>[0]['optionsJSON']>(
    'GET',
    `/passkey/generate-register-options?context=${encodeURIComponent(name.trim())}`,
  );
  const response = await startRegistration({ optionsJSON });
  await auth('POST', '/passkey/verify-registration', { response, createSession: true, name: 'PlantPal' });
}

export async function signIn(): Promise<void> {
  const optionsJSON = await auth<Parameters<typeof startAuthentication>[0]['optionsJSON']>(
    'GET',
    '/passkey/generate-authenticate-options',
  );
  const response = await startAuthentication({ optionsJSON });
  await auth('POST', '/passkey/verify-authentication', { response });
}

export async function signOut(): Promise<void> {
  await auth('POST', '/sign-out', {});
}
