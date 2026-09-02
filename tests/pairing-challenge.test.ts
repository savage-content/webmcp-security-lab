import { describe, expect, it } from 'vitest';

import { PairingChallengeManager } from '../products/connector/pairing-challenge';

const binding = {
  extensionOrigin: `chrome-extension://${'a'.repeat(32)}`,
  origin: 'http://localhost:3001',
  pageUrl: 'http://localhost:3001/lesson?secret=removed#step',
  clientLabel: 'LeftOut Chrome capability bridge',
};

describe('pairing challenge manager', () => {
  it('binds one short-lived challenge to one extension and page identity', () => {
    let now = 1_000;
    const manager = new PairingChallengeManager({
      now: () => now,
      token: () => 'a'.repeat(43),
      ttlMs: 60_000,
    });
    const challenge = manager.issue(binding);
    expect(challenge.expiresAt).toBe(new Date(61_000).toISOString());
    expect(manager.consume(challenge.token, binding)).toMatchObject({
      pageUrl: 'http://localhost:3001/lesson',
    });
    expect(() => manager.consume(challenge.token, binding)).toThrow(
      'invalid or expired',
    );
    now += 1;
  });

  it('consumes the challenge when a mismatched tab attempts to use it', () => {
    const manager = new PairingChallengeManager({
      token: () => 'b'.repeat(43),
    });
    const challenge = manager.issue(binding);
    expect(() =>
      manager.consume(challenge.token, {
        ...binding,
        pageUrl: 'http://localhost:3001/other',
      }),
    ).toThrow('does not match this tab');
    expect(() => manager.consume(challenge.token, binding)).toThrow(
      'invalid or expired',
    );
  });

  it.each([
    {
      label: 'extension',
      change: { extensionOrigin: `chrome-extension://${'b'.repeat(32)}` },
    },
    {
      label: 'origin',
      change: {
        origin: 'https://localhost:3001',
        pageUrl: 'https://localhost:3001/lesson',
      },
    },
    { label: 'route', change: { pageUrl: 'http://localhost:3001/other' } },
    { label: 'client', change: { clientLabel: 'Another extension' } },
  ])(
    'rejects and consumes a challenge with a mismatched $label',
    ({ change }) => {
      const manager = new PairingChallengeManager({
        token: () => 'd'.repeat(43),
      });
      const challenge = manager.issue(binding);
      expect(() =>
        manager.consume(challenge.token, { ...binding, ...change }),
      ).toThrow('does not match this tab');
      expect(() => manager.consume(challenge.token, binding)).toThrow(
        'invalid or expired',
      );
    },
  );

  it('rejects non-extension callers and expired challenges', () => {
    let now = 1_000;
    const manager = new PairingChallengeManager({
      now: () => now,
      token: () => 'c'.repeat(43),
      ttlMs: 1_000,
    });
    expect(() =>
      manager.issue({ ...binding, extensionOrigin: 'http://localhost:3001' }),
    ).toThrow('Chrome extension origin');
    const challenge = manager.issue(binding);
    now = 2_000;
    expect(() => manager.consume(challenge.token, binding)).toThrow(
      'invalid or expired',
    );
  });

  it.each([
    'ftp://localhost:3001',
    'http://user:pass@localhost:3001',
    'http://localhost:3001/path',
    'http://localhost:3001/',
  ])('rejects a non-origin origin value %s', (origin) => {
    const manager = new PairingChallengeManager({
      token: () => 'e'.repeat(43),
    });
    expect(() => manager.issue({ ...binding, origin })).toThrow(
      'origin is invalid',
    );
  });

  it('rejects unsafe TTLs and invalid generated challenge tokens', () => {
    expect(() => new PairingChallengeManager({ ttlMs: 999 })).toThrow(
      '1 to 60 seconds',
    );
    expect(() => new PairingChallengeManager({ ttlMs: 60_001 })).toThrow(
      '1 to 60 seconds',
    );
    const manager = new PairingChallengeManager({ token: () => 'too-short' });
    expect(() => manager.issue(binding)).toThrow('invalid token');
  });
});
