import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { idbVaultStore, KeyVault, memoryVaultStore } from '../src';
import { FAKE_KEY } from './helpers';

describe('key vault', () => {
  it('device mode stores only ciphertext and a non-extractable key', async () => {
    const store = memoryVaultStore();
    const v = new KeyVault(store);
    await v.save(FAKE_KEY, 'device', new Date('2026-10-29T10:00:00Z'));
    expect(await v.status()).toEqual({
      mode: 'device',
      hint: FAKE_KEY.slice(-4),
      savedAt: '2026-10-29T10:00:00.000Z',
    });
    const wrapping = store.dump().get('wrapping') as CryptoKey;
    expect(wrapping.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', wrapping)).rejects.toThrow();
    const sealed = store.dump().get('sealed') as { ct: ArrayBuffer };
    expect(new TextDecoder().decode(sealed.ct)).not.toContain(FAKE_KEY);
    // A fresh vault instance (new tab) decrypts it.
    expect(await new KeyVault(store).get()).toBe(FAKE_KEY);
  });

  it('session mode keeps the key in memory only', async () => {
    const store = memoryVaultStore();
    const v = new KeyVault(store);
    await v.save(FAKE_KEY, 'session');
    expect(store.dump().size).toBe(0);
    expect(await v.get()).toBe(FAKE_KEY);
    expect(await new KeyVault(store).get()).toBeNull();
  });

  it('remove forgets the key everywhere; invalid keys are refused', async () => {
    const store = memoryVaultStore();
    const v = new KeyVault(store);
    await v.save(FAKE_KEY, 'device');
    await v.remove();
    expect(await v.get()).toBeNull();
    expect(store.dump().size).toBe(0);
    await expect(v.save('not-a-key', 'device')).rejects.toThrow();
  });

  it('tampered ciphertext reads as no key', async () => {
    const store = memoryVaultStore();
    await new KeyVault(store).save(FAKE_KEY, 'device');
    const sealed = store.dump().get('sealed') as { ct: ArrayBuffer };
    new Uint8Array(sealed.ct)[0]! ^= 0xff;
    expect(await new KeyVault(store).get()).toBeNull();
  });

  it('works on IndexedDB in its own database', async () => {
    const store = idbVaultStore();
    const v = new KeyVault(store);
    await v.save(FAKE_KEY, 'device');
    v.lock();
    expect(await v.get()).toBe(FAKE_KEY);
    const dbs = await indexedDB.databases();
    expect(dbs.map((d) => d.name)).toContain('plantpal-vault');
  });
});
