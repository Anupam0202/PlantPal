import { describe, expect, it } from 'vitest';
import { installTrustedTypes, sameOriginScriptUrl } from '../../src/lib/trusted-types';

const BASE = 'https://plantpal.example/garden';

describe('Trusted Types default policy', () => {
  it('allows only same-origin http(s) script URLs', () => {
    expect(sameOriginScriptUrl('/sw.js', BASE)).toBe('https://plantpal.example/sw.js');
    expect(sameOriginScriptUrl('https://plantpal.example/assets/w.js', BASE)).toBe(
      'https://plantpal.example/assets/w.js',
    );
    for (const bad of [
      'https://evil.example/x.js',
      '//evil.example/x.js',
      'data:text/javascript,alert(1)',
      'javascript:alert(1)',
      'blob:https://evil.example/123',
    ])
      expect(() => sameOriginScriptUrl(bad, BASE)).toThrow(TypeError);
  });

  it('creates one default policy with script URLs only (no HTML or script text)', () => {
    const made: Array<{ name: string; rules: Record<string, unknown> }> = [];
    const tt = {
      defaultPolicy: null as unknown,
      createPolicy(name: string, rules: Record<string, unknown>) {
        made.push({ name, rules });
        this.defaultPolicy = rules;
        return rules;
      },
    };
    const win = { trustedTypes: tt, location: new URL(BASE) as unknown as Location };
    installTrustedTypes(win);
    installTrustedTypes(win);
    expect(made).toHaveLength(1);
    expect(made[0]!.name).toBe('default');
    expect(Object.keys(made[0]!.rules)).toEqual(['createScriptURL']);
    // Browsers without Trusted Types: nothing to do.
    expect(() => installTrustedTypes({ location: win.location })).not.toThrow();
  });
});
