/**
 * The production CSP sets `require-trusted-types-for 'script'`. Without a policy the browser refuses
 * every script URL given as a string, which blocks the service worker (offline, Web Push) and web
 * workers (sun heatmap, map rendering). This `default` policy turns script URLs into trusted ones only
 * when they point at this origin over http(s). It defines nothing for HTML or script text, so those
 * sinks stay blocked.
 */

interface ScriptUrlPolicyFactory {
  defaultPolicy: unknown;
  createPolicy(name: string, rules: { createScriptURL(input: string): string }): unknown;
}

/** Returns the absolute URL when it is a same-origin http(s) script, else throws. */
export function sameOriginScriptUrl(input: string, base: string): string {
  const url = new URL(input, base);
  const origin = new URL(base).origin;
  if (url.origin !== origin || (url.protocol !== 'https:' && url.protocol !== 'http:'))
    throw new TypeError(`Blocked script URL from another origin: ${url.origin}`);
  return url.href;
}

export function installTrustedTypes(win: { trustedTypes?: ScriptUrlPolicyFactory; location: Location }) {
  const tt = win.trustedTypes;
  if (!tt || tt.defaultPolicy) return;
  tt.createPolicy('default', {
    createScriptURL: (input) => sameOriginScriptUrl(input, win.location.href),
  });
}

installTrustedTypes(globalThis as unknown as Parameters<typeof installTrustedTypes>[0]);
