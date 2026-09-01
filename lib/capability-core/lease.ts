import type { OneUseClaim, OneUseLease } from './types';

export function createOneUseLease({
  ttlSeconds,
  now = () => globalThis.performance.now(),
}: {
  ttlSeconds: number;
  now?: () => number;
}): OneUseLease {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('A positive capability lifetime is required.');
  }

  const deadline = now() + ttlSeconds * 1_000;
  let current: ReturnType<OneUseLease['state']> = 'active';

  return {
    deadline,
    claim() {
      if (current !== 'active') return { ok: false, reason: current };
      if (now() >= deadline) {
        current = 'expired';
        return { ok: false, reason: 'expired' };
      }

      // This transition is synchronous and therefore atomic within a single
      // JavaScript realm. It must happen before the caller reaches an await.
      current = 'consumed';
      return { ok: true, callNumber: 1 };
    },
    invalidate(reason) {
      if (current === 'active') current = reason;
    },
    state() {
      return current;
    },
  };
}

export function prepareOneUseActivation({
  expiresAt,
  suppressSource,
  wallNow = () => Date.now(),
  monotonicNow,
}: {
  expiresAt: string;
  suppressSource: () => true;
  wallNow?: () => number;
  monotonicNow?: () => number;
}):
  | { ok: false; reason: 'expired' }
  | { ok: true; lease: OneUseLease; sourceWithdrawn: true } {
  const remainingLifetimeMs = Date.parse(expiresAt) - wallNow();
  if (remainingLifetimeMs <= 0) return { ok: false, reason: 'expired' };

  // Construct the replacement lease before suppressing the broader source.
  const lease = createOneUseLease({
    ttlSeconds: remainingLifetimeMs / 1_000,
    ...(monotonicNow ? { now: monotonicNow } : {}),
  });
  return { ok: true, lease, sourceWithdrawn: suppressSource() };
}

/**
 * Claims the lease and performs synchronous teardown before control can reach
 * any awaited handler work. `onConsumed` intentionally cannot return a promise.
 */
export function consumeOneUseBeforeAwait(
  lease: OneUseLease,
  onConsumed: (claim: Extract<OneUseClaim, { ok: true }>) => void,
): OneUseClaim {
  const claim = lease.claim();
  if (claim.ok) onConsumed(claim);
  return claim;
}
