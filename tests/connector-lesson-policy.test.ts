import { describe, expect, it } from 'vitest';

import {
  APPROVED_CAPABILITY_TOOL_PATTERN,
  GUIDED_LESSON_POLICIES,
  guidedPolicyForToolName,
  isApprovedCapabilityToolName,
  validateConnectorCapabilityReceipt,
} from '../products/connector/lesson-capability-policy';
import {
  validGuidedCapabilityReceipt,
  type GuidedProfileId,
} from './fixtures/guided-capability-receipt';

const profiles = Object.keys(GUIDED_LESSON_POLICIES) as GuidedProfileId[];

describe('connector guided-lesson capability policy', () => {
  it('allows only the five built-in generated name families', () => {
    const suffix = '0123456789abcdef';
    const approved = [
      `get_training_1042_eligibility_once_${suffix}`,
      `update_profile_notice_once_${suffix}`,
      `get_synthetic_delivery_status_safe_once_${suffix}`,
      `set_training_notification_subscription_once_${suffix}`,
      `record_webmcp_capability_observation_once_${suffix}`,
    ];

    for (const toolName of approved) {
      expect(isApprovedCapabilityToolName(toolName)).toBe(true);
      expect(APPROVED_CAPABILITY_TOOL_PATTERN.test(toolName)).toBe(true);
    }
    for (const toolName of [
      'update_profile_notice',
      `update_short_notice_once_${suffix}`,
      `record_webmcp_capability_observation_once_${suffix}0`,
      `record_webmcp_capability_observation_once_${suffix.toUpperCase()}`,
      `page_defined_profile_once_${suffix}`,
    ]) {
      expect(isApprovedCapabilityToolName(toolName)).toBe(false);
    }
    expect(
      guidedPolicyForToolName(`update_profile_notice_once_${suffix}`)
        ?.profileId,
    ).toBe('lesson-2-profile-notice/1');
    expect(
      guidedPolicyForToolName(`get_training_1042_eligibility_once_${suffix}`),
    ).toBeUndefined();
  });

  it.each(profiles)(
    'accepts a cryptographically bound, policy-matching %s receipt',
    async (profileId) => {
      const receipt = await validGuidedCapabilityReceipt(profileId);
      await expect(
        validateConnectorCapabilityReceipt(receipt),
      ).resolves.toEqual(receipt);
    },
  );

  it('rejects a page-defined profile before treating it as a lesson', async () => {
    const receipt = await validGuidedCapabilityReceipt(
      'lesson-2-profile-notice/1',
    );
    (
      receipt.capability.proposal.input as unknown as {
        profile_id: string;
      }
    ).profile_id = 'page-defined-profile/1';

    await expect(validateConnectorCapabilityReceipt(receipt)).rejects.toThrow();
  });

  it('rejects cross-scenario relabeling and effect widening', async () => {
    const receipt = await validGuidedCapabilityReceipt(
      'lesson-3-delivery-status/1',
    );
    const relabeled = structuredClone(receipt);
    relabeled.scenario.id = 'over-broad-schema';
    await expect(
      validateConnectorCapabilityReceipt(relabeled),
    ).rejects.toThrow();

    const widened = structuredClone(receipt);
    (
      widened.capability.contract.intent.allowedEffects as unknown as string[]
    ).push('follow-on-tool-invocation');
    await expect(validateConnectorCapabilityReceipt(widened)).rejects.toThrow();
  });

  it('rejects hidden external arguments and a non-consumed callback', async () => {
    const receipt = await validGuidedCapabilityReceipt('lesson-4-digest-off/1');
    const hiddenArguments = structuredClone(receipt);
    hiddenArguments.invocation.arguments = { subscribed: false };
    await expect(
      validateConnectorCapabilityReceipt(hiddenArguments),
    ).rejects.toThrow();

    const reusable = structuredClone(receipt);
    reusable.capability.invalidation.reason = 'expired';
    await expect(
      validateConnectorCapabilityReceipt(reusable),
    ).rejects.toThrow();
  });

  it('rejects forged verification flags and identity suffixes', async () => {
    const receipt = await validGuidedCapabilityReceipt(
      'lesson-5-client-observation/1',
    );
    const forged = structuredClone(receipt);
    forged.effective.after.invocation = 'not-observed';
    await expect(validateConnectorCapabilityReceipt(forged)).rejects.toThrow();

    const renamed = structuredClone(receipt);
    renamed.capability.contract.compiled.toolName =
      'record_webmcp_capability_observation_once_0000000000000000';
    await expect(validateConnectorCapabilityReceipt(renamed)).rejects.toThrow();
  });
});
