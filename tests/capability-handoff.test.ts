import { describe, expect, it, vi } from 'vitest';

import { deliverCurrentHandoff } from '../lib/lab/capability-handoff';

describe('capability permit handoff', () => {
  it('delivers a permit only while its capability is still current', async () => {
    const deliver = vi.fn();
    await expect(
      deliverCurrentHandoff({
        create: async () => ({ permit: 'current' }),
        isCurrent: () => true,
        deliver,
      }),
    ).resolves.toBe(true);
    expect(deliver).toHaveBeenCalledOnce();
    expect(deliver).toHaveBeenCalledWith({ permit: 'current' });
  });

  it('drops a delayed permit when the capability is claimed first', async () => {
    let resolveArtifact: ((value: { permit: string }) => void) | undefined;
    let current = true;
    const deliver = vi.fn();
    const pending = deliverCurrentHandoff({
      create: () =>
        new Promise<{ permit: string }>((resolve) => {
          resolveArtifact = resolve;
        }),
      isCurrent: () => current,
      deliver,
    });

    current = false;
    resolveArtifact?.({ permit: 'stale' });

    await expect(pending).resolves.toBe(false);
    expect(deliver).not.toHaveBeenCalled();
  });
});
