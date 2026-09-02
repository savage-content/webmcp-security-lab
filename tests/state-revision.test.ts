import { describe, expect, it } from 'vitest';

import {
  planStateRevisionCommit,
  stateRevisionSnapshotMatches,
} from '../lib/lab/state-revision';

describe('synthetic state revision guard', () => {
  it('accepts the same revision and byte-identical state', () => {
    expect(
      stateRevisionSnapshotMatches({
        expected: { revision: 4, state: { notice: 'A' } },
        currentRevision: 4,
        currentState: { notice: 'A' },
      }),
    ).toBe(true);
  });

  it('rejects changed bytes even when the revision was not advanced', () => {
    expect(
      stateRevisionSnapshotMatches({
        expected: { revision: 4, state: { notice: 'A' } },
        currentRevision: 4,
        currentState: { notice: 'B' },
      }),
    ).toBe(false);
  });

  it('rejects an A-to-B-to-A sequence by its monotonic revision', () => {
    expect(
      stateRevisionSnapshotMatches({
        expected: { revision: 4, state: { notice: 'A' } },
        currentRevision: 6,
        currentState: { notice: 'A' },
      }),
    ).toBe(false);
  });

  it('plans exactly one revision advance for a current snapshot', () => {
    expect(
      planStateRevisionCommit({
        expected: { revision: 4, state: { notice: 'A' } },
        currentRevision: 4,
        currentState: { notice: 'A' },
        nextState: { notice: 'B' },
      }),
    ).toEqual({ revision: 5, state: { notice: 'B' } });
  });

  it('produces no commit plan for stale bytes or an ABA revision', () => {
    expect(
      planStateRevisionCommit({
        expected: { revision: 4, state: { notice: 'A' } },
        currentRevision: 4,
        currentState: { notice: 'B' },
        nextState: { notice: 'C' },
      }),
    ).toBeUndefined();
    expect(
      planStateRevisionCommit({
        expected: { revision: 4, state: { notice: 'A' } },
        currentRevision: 6,
        currentState: { notice: 'A' },
        nextState: { notice: 'C' },
      }),
    ).toBeUndefined();
  });
});
