import { canonicalJson } from '@/lib/capability-core';
import type { JsonValue } from '@/lib/lab/types';

export interface StateRevisionSnapshot {
  revision: number;
  state: Record<string, JsonValue>;
}

export function stateRevisionSnapshotMatches({
  expected,
  currentRevision,
  currentState,
}: {
  expected: StateRevisionSnapshot;
  currentRevision: number;
  currentState: Record<string, JsonValue>;
}) {
  return (
    currentRevision === expected.revision &&
    canonicalJson(currentState) === canonicalJson(expected.state)
  );
}

export function planStateRevisionCommit({
  expected,
  currentRevision,
  currentState,
  nextState,
}: {
  expected: StateRevisionSnapshot;
  currentRevision: number;
  currentState: Record<string, JsonValue>;
  nextState: Record<string, JsonValue>;
}): StateRevisionSnapshot | undefined {
  if (
    !stateRevisionSnapshotMatches({
      expected,
      currentRevision,
      currentState,
    })
  ) {
    return undefined;
  }
  return {
    revision: currentRevision + 1,
    state: structuredClone(nextState),
  };
}
