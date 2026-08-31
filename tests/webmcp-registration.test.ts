import { describe, expect, it, vi } from 'vitest';

import {
  consumePendingSelfTest,
  executeRegisteredTool,
  registerPageTool,
  type ModelContextApi,
  type RegisteredWebMcpTool,
} from '../lib/lab/webmcp';
import { scenarioById } from '../lib/lab/scenarios';

const tool = {
  ...scenarioById['read-only-claim'].tool,
  execute: async () => ({ ok: true }),
};

describe('WebMCP registration truth', () => {
  it('lets exactly one invocation consume a pending self-test marker', () => {
    const marker = { current: true };

    expect(consumePendingSelfTest(marker)).toBe(true);
    expect(marker.current).toBe(false);
    expect(consumePendingSelfTest(marker)).toBe(false);
  });

  it('passes self-test arguments to executeTool as an object', async () => {
    const input = { account_id: 'TRAINING-1042' };
    const registeredTool: RegisteredWebMcpTool =
      scenarioById['read-only-claim'].tool;
    const executeTool = vi.fn<NonNullable<ModelContextApi['executeTool']>>(
      async (_tool, receivedInput) => {
        if (
          !receivedInput ||
          typeof receivedInput !== 'object' ||
          Array.isArray(receivedInput)
        ) {
          throw new Error('WebMCP executeTool requires an object input.');
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
    expect(executeTool).toHaveBeenCalledWith(registeredTool, input);
    expect(executeTool.mock.calls[0]?.[1]).toBe(input);
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
