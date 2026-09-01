import { describe, expect, it, vi } from 'vitest';

import {
  LEGACY_CHROMIUM_RESULT_DELIVERY_GRACE_MS,
  createScenarioOneCapabilityToolResult,
  createUnattributedWebMcpConfirmation,
  decideRegistrationSettlement,
  executeRegisteredTool,
  registerPageTool,
  withOneUseRegistrationRetirement,
  type ModelContextApi,
  type RegisteredWebMcpTool,
} from '../lib/lab/webmcp';
import { parseCapabilityEvidenceReceipt } from '../lib/lab/schemas';
import { scenarioById } from '../lib/lab/scenarios';
import { sanitizeInvocationPayload } from '../products/extension/validation.js';
import { validCapabilityReceipt } from './fixtures/capability-receipt';

const tool = {
  ...scenarioById['read-only-claim'].tool,
  execute: async () => ({ ok: true }),
};

describe('WebMCP registration truth', () => {
  it('returns the complete validated Scenario 1 receipt as structured callback data', async () => {
    const receipt = await parseCapabilityEvidenceReceipt(
      await validCapabilityReceipt(),
    );
    const result = createScenarioOneCapabilityToolResult(receipt);

    expect(result.structuredContent).toEqual({ receipt });
    expect(result.structuredContent.receipt).not.toBe(receipt);
    await expect(
      parseCapabilityEvidenceReceipt(result.structuredContent.receipt),
    ).resolves.toEqual(receipt);
    expect(result).toMatchObject({
      result: receipt.effective.rawResult,
      verification: receipt.capability?.verification,
      evidence: {
        receipt_id: receipt.id,
        persistence: 'local-export-only',
        contract_hash: receipt.capability?.contract.contractHash,
        invalidation_reason: 'consumed',
      },
    });
    expect(result).not.toHaveProperty('content');

    const pageUrl = new URL('/', receipt.origin).toString();
    const transported = sanitizeInvocationPayload(
      {
        origin: receipt.origin,
        executionUrl: pageUrl,
        toolName: receipt.declaration.name,
        result,
      },
      receipt.origin,
      pageUrl,
      pageUrl,
      receipt.declaration.name,
    );
    const transportedResult = transported.result as typeof result;
    await expect(
      parseCapabilityEvidenceReceipt(
        transportedResult.structuredContent.receipt,
      ),
    ).resolves.toEqual(receipt);
  });

  it('never attributes a shared callback to the approved self-test request', () => {
    expect(createUnattributedWebMcpConfirmation('Approve one call.')).toEqual({
      presentedCopy: 'Approve one call.',
      known: false,
      approved: null,
      source: 'browser-not-observable',
    });
  });

  it('serializes self-test arguments for Chrome executeTool', async () => {
    const input = { account_id: 'TRAINING-1042' };
    const registeredTool: RegisteredWebMcpTool =
      scenarioById['read-only-claim'].tool;
    const executeTool = vi.fn<NonNullable<ModelContextApi['executeTool']>>(
      async (_tool, receivedInput) => {
        if (receivedInput !== JSON.stringify(input)) {
          throw new Error('WebMCP executeTool requires JSON string input.');
        }
        return { ok: true };
      },
    );

    await expect(
      executeRegisteredTool(
        { registerTool: vi.fn(), executeTool },
        registeredTool,
        input,
      ),
    ).resolves.toEqual({ ok: true });
    expect(executeTool).toHaveBeenCalledWith(
      registeredTool,
      JSON.stringify(input),
    );
  });

  it('lets Chrome 152 settle a claimed result before retiring its registration', async () => {
    vi.useFakeTimers();
    try {
      const emulateChrome152 = <T>(
        controller: AbortController,
        execute: () => Promise<T>,
      ) =>
        new Promise<string>((resolve, reject) => {
          let pending = true;
          controller.signal.addEventListener('abort', () => {
            if (!pending) return;
            pending = false;
            reject(
              new DOMException(
                'Registration retirement cancelled the in-flight call.',
                'AbortError',
              ),
            );
          });
          void execute().then(
            (value) => {
              if (!pending) return;
              pending = false;
              resolve(JSON.stringify(value));
            },
            (error: unknown) => {
              if (!pending) return;
              pending = false;
              reject(error instanceof Error ? error : new Error(String(error)));
            },
          );
        });

      const unsafeController = new AbortController();
      await expect(
        emulateChrome152(unsafeController, async () => {
          unsafeController.abort();
          return { receipt_id: 'unsafe' };
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });

      const controller = new AbortController();
      const execute = withOneUseRegistrationRetirement(
        controller,
        async (_input, _client, lifecycle) => {
          lifecycle.markClaimed();
          return { receipt_id: 'safe' };
        },
      );
      await expect(
        emulateChrome152(controller, () => execute({})),
      ).resolves.toBe('{"receipt_id":"safe"}');
      expect(controller.signal.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(
        LEGACY_CHROMIUM_RESULT_DELIVERY_GRACE_MS - 1,
      );
      expect(controller.signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(controller.signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retires immediately when a claimed execution fails', async () => {
    const controller = new AbortController();
    const onClaimedFailure = vi.fn();
    const execute = withOneUseRegistrationRetirement(
      controller,
      async (_input, _client, lifecycle) => {
        lifecycle.markClaimed();
        throw new Error('post-claim failure');
      },
      { onClaimedFailure },
    );

    await expect(execute({})).rejects.toThrow('post-claim failure');
    expect(controller.signal.aborted).toBe(true);
    expect(onClaimedFailure).toHaveBeenCalledOnce();
    expect(onClaimedFailure.mock.calls[0]?.[0]).toMatchObject({
      message: 'post-claim failure',
    });
  });

  it('preserves a call claimed before registerTool settles', () => {
    expect(
      decideRegistrationSettlement({
        mounted: true,
        epochMatches: true,
        generationMatches: false,
        leaseState: 'consumed',
      }),
    ).toBe('preserve-claimed-execution');

    expect(
      decideRegistrationSettlement({
        mounted: false,
        epochMatches: true,
        generationMatches: false,
        leaseState: 'consumed',
      }),
    ).toBe('discard-stale-registration');
    expect(
      decideRegistrationSettlement({
        mounted: true,
        epochMatches: true,
        generationMatches: true,
        leaseState: 'active',
      }),
    ).toBe('continue');
  });

  it('keeps an early exposed invocation alive when registerTool settles later', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      let leaseState: 'active' | 'consumed' = 'active';
      let generationMatches = true;
      let invocation: Promise<string> | undefined;
      const execute = withOneUseRegistrationRetirement(
        controller,
        async (_input, _client, lifecycle) => {
          lifecycle.markClaimed();
          leaseState = 'consumed';
          generationMatches = false;
          return { receipt_id: 'early-call' };
        },
      );
      const registerTool = vi.fn<ModelContextApi['registerTool']>(
        async (registeredTool) => {
          invocation = new Promise<string>((resolve, reject) => {
            let inFlight = true;
            controller.signal.addEventListener('abort', () => {
              if (!inFlight) return;
              inFlight = false;
              reject(new DOMException('Cancelled in flight.', 'AbortError'));
            });
            void Promise.resolve(registeredTool.execute({})).then((value) => {
              if (!inFlight) return;
              inFlight = false;
              resolve(JSON.stringify(value));
            }, reject);
          });
          await Promise.resolve();
        },
      );

      const status = await registerPageTool({
        modelContext: { registerTool },
        tool: { ...tool, execute },
        signal: controller.signal,
        permissionObservation: 'allowed',
      });
      expect(status.registration).toBe('registered');
      const decision = decideRegistrationSettlement({
        mounted: true,
        epochMatches: true,
        generationMatches,
        leaseState,
      });
      if (decision === 'discard-stale-registration') controller.abort();

      expect(decision).toBe('preserve-claimed-execution');
      expect(controller.signal.aborted).toBe(false);
      await expect(invocation).resolves.toBe('{"receipt_id":"early-call"}');

      await vi.advanceTimersByTimeAsync(
        LEGACY_CHROMIUM_RESULT_DELIVERY_GRACE_MS,
      );
      expect(controller.signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('attempts registration even when the advisory policy probe says blocked', async () => {
    const registerTool = vi.fn<ModelContextApi['registerTool']>();
    const result = await registerPageTool({
      modelContext: { registerTool },
      tool,
      signal: new AbortController().signal,
      permissionObservation: 'blocked',
    });

    expect(registerTool).toHaveBeenCalledOnce();
    expect(result.registration).toBe('registered');
    expect(result.permissionsPolicy).toBe('allowed');
    expect(result.invocation).toBe('not-observed');
    expect(result.detail).toContain('advisory');
  });

  it('reports policy denial only after registerTool throws NotAllowedError', async () => {
    const registerTool = vi.fn<ModelContextApi['registerTool']>(() => {
      throw new DOMException('Denied', 'NotAllowedError');
    });
    const result = await registerPageTool({
      modelContext: { registerTool },
      tool,
      signal: new AbortController().signal,
      permissionObservation: 'unknown',
    });

    expect(result.browserSupport).toBe('supported');
    expect(result.registration).toBe('denied');
    expect(result.permissionsPolicy).toBe('blocked');
  });

  it('keeps unsupported API separate from policy and discovery', async () => {
    const result = await registerPageTool({
      modelContext: undefined,
      tool,
      signal: new AbortController().signal,
      permissionObservation: 'unknown',
    });

    expect(result.browserSupport).toBe('unsupported');
    expect(result.registration).toBe('unsupported');
    expect(result.discovery).toBe('unsupported');
    expect(result.invocation).toBe('not-observed');
  });
});
