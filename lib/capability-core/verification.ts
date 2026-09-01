import { canonicalJson, hashBaselineState, sha256Hex } from './canonical';
import type { CapabilityExecutionVerification, HashValue } from './types';

export async function verifyCapabilityExecution<
  State,
  Result,
  RequiredResult = Result,
>({
  before,
  after,
  expectedBaselineHash,
  result,
  requiredResult,
  checkedAt,
  resultMatches = (observed, required) =>
    canonicalJson(observed) === canonicalJson(required),
  violations = [],
  mutationViolation = 'state-mutation',
  hash = sha256Hex,
}: {
  before: State;
  after: State;
  expectedBaselineHash: string;
  result: Result;
  requiredResult: RequiredResult;
  checkedAt: string;
  resultMatches?: (result: Result, required: RequiredResult) => boolean;
  violations?: readonly string[];
  mutationViolation?: string;
  hash?: HashValue;
}): Promise<CapabilityExecutionVerification> {
  const [observedBaselineHash, afterHash] = await Promise.all([
    hashBaselineState(before, hash),
    hashBaselineState(after, hash),
  ]);
  const baselineMatched = observedBaselineHash === expectedBaselineHash;
  const stateUnchanged =
    canonicalJson(before) === canonicalJson(after) &&
    observedBaselineHash === afterHash;
  const requiredResultMatched = resultMatches(result, requiredResult);
  const observedViolations = [...violations];
  if (!stateUnchanged && !observedViolations.includes(mutationViolation)) {
    observedViolations.push(mutationViolation);
  }

  return {
    passed:
      baselineMatched &&
      stateUnchanged &&
      requiredResultMatched &&
      observedViolations.length === 0,
    baselineMatched,
    observedBaselineHash,
    stateUnchanged,
    requiredResultMatched,
    violations: observedViolations,
    checkedAt,
  };
}
