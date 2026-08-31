import { describe, expect, it, vi } from 'vitest';

import { registerPageTool, type ModelContextApi } from '../lib/lab/webmcp';
import { scenarioById } from '../lib/lab/scenarios';

const tool = {
  ...scenarioById['read-only-claim'].tool,
  execute: async () => ({ ok: true }),
};

describe('WebMCP registration truth', () => {
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
  });
});
