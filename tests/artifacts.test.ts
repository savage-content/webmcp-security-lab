import { describe, expect, it, vi } from 'vitest';

import {
  copyJsonArtifact,
  createCapabilityPermitHandoff,
  createPolicyJsonArtifact,
  requestJsonDownload,
  type DownloadEnvironment,
  type JsonArtifact,
} from '../lib/lab/artifacts';
import { SELF_REPORTED_LIMITATION } from '../lib/lab/constants';
import { assessScenarioRisk } from '../lib/lab/risk';
import { scenarioById } from '../lib/lab/scenarios';

const artifact: JsonArtifact = {
  filename: 'artifact.json',
  text: '{\n  "ok": true\n}',
};

describe('JSON artifact export', () => {
  it('creates a deterministic policy artifact with the required limitation', () => {
    const scenario = scenarioById['over-broad-schema'];
    const generatedAt = '2026-08-31T12:00:00.000Z';
    const result = createPolicyJsonArtifact(
      scenario,
      assessScenarioRisk(scenario),
      generatedAt,
    );
    const parsed = JSON.parse(result.text) as {
      generatedAt: string;
      limitation: string;
      enforceable: boolean;
    };

    expect(result.filename).toBe('webmcp-awareness-over-broad-schema.json');
    expect(parsed.generatedAt).toBe(generatedAt);
    expect(parsed.limitation).toBe(SELF_REPORTED_LIMITATION);
    expect(parsed.enforceable).toBe(false);
  });

  it('requests a browser download and always cleans up its temporary link', () => {
    const click = vi.fn();
    const remove = vi.fn();
    const link = {
      href: '',
      download: '',
      hidden: false,
      click,
      remove,
    } as unknown as HTMLAnchorElement;
    const revokeObjectUrl = vi.fn();
    let scheduled: (() => void) | undefined;
    const environment: DownloadEnvironment = {
      createObjectUrl: vi.fn(() => 'blob:test'),
      revokeObjectUrl,
      createAnchor: vi.fn(() => link),
      appendAnchor: vi.fn(),
      schedule: (callback, delay) => {
        expect(delay).toBe(1_000);
        scheduled = callback;
      },
    };

    expect(requestJsonDownload(artifact, environment)).toBe('requested');
    expect(link.download).toBe(artifact.filename);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    scheduled?.();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:test');
  });

  it('copies exact JSON and reports clipboard rejection', async () => {
    const writeText = vi.fn(async () => undefined);
    await expect(copyJsonArtifact(artifact, { writeText })).resolves.toBe(
      'copied',
    );
    expect(writeText).toHaveBeenCalledWith(artifact.text);

    await expect(
      copyJsonArtifact(artifact, {
        writeText: vi.fn(async () => {
          throw new Error('blocked');
        }),
      }),
    ).resolves.toBe('copy-failed');
  });

  it('creates one strict, bounded, non-invoking permit handoff envelope', () => {
    const handoff = createCapabilityPermitHandoff(artifact);

    expect(handoff).toEqual({
      type: 'leftout:webmcp-capability-permit',
      schemaVersion: 'leftout.page-capability-handoff/1',
      permitText: artifact.text,
    });
    expect(Object.isFrozen(handoff)).toBe(true);
    expect(() =>
      createCapabilityPermitHandoff({ filename: 'empty.json', text: '' }),
    ).toThrow('empty or larger than 64 KiB');
  });
});
