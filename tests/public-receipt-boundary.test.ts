import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MAX_INVOCATION_ARGUMENT_BYTES,
  normalizeInvocationArguments,
} from '../lib/lab/schemas';

describe('public receipt privacy boundary', () => {
  it('keeps learning receipts in the page session with no upload route', () => {
    expect(existsSync(resolve('app/api/evidence/route.ts'))).toBe(false);
    expect(existsSync(resolve('db/evidence.ts'))).toBe(false);

    const labApp = readFileSync(
      resolve('components/lab/lab-app.tsx'),
      'utf8',
    );
    const ledgerPanel = readFileSync(
      resolve('components/lab/ledger-panel.tsx'),
      'utf8',
    );

    expect(labApp).not.toContain('/api/evidence');
    expect(labApp).toContain('persisted: false');
    expect(labApp.match(/\.slice\(0, 12\)/g)).toHaveLength(2);
    expect(ledgerPanel).toContain(
      'Nothing here is uploaded to Left Out Security.',
    );
  });

  it('bounds attacker-shaped arguments before retaining a session receipt', () => {
    expect(
      normalizeInvocationArguments({ notice: 'ok', extra: { safe: true } }),
    ).toEqual({ notice: 'ok', extra: { safe: true } });
    expect(() =>
      normalizeInvocationArguments({
        notice: 'ok',
        extra: 'x'.repeat(MAX_INVOCATION_ARGUMENT_BYTES),
      }),
    ).toThrow('8 KiB');

    let nested: unknown = 'value';
    for (let index = 0; index < 8; index += 1) nested = [nested];
    expect(() =>
      normalizeInvocationArguments({ notice: 'ok', nested }),
    ).toThrow('nesting');
  });
});
