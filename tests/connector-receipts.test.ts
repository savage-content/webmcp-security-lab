import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LEGACY_SELF_REPORTED_ASSURANCE_LIMITATION } from '../lib/legacy-contracts';
import type { PairedPageSummary } from '../products/connector/bridge-coordinator';
import { createIssueCandidateFromVerifiedReceipt } from '../products/connector/issue-candidate';
import {
  ReceiptStore,
  REPORT_LIMITATION,
} from '../products/connector/receipt-store';
import { validCapabilityReceipt } from './fixtures/capability-receipt';
import { validGuidedCapabilityReceipt } from './fixtures/guided-capability-receipt';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const page: PairedPageSummary = {
  sessionId: '8d3ca438-7ea0-412d-a692-928c42dbbd8a',
  origin: 'http://localhost:3000',
  pageUrl: 'http://localhost:3000/#scenario-1',
  clientLabel: 'Test client',
  pairedAt: '2026-09-01T12:00:00.000Z',
  lastSeenAt: '2026-09-01T12:00:00.000Z',
  connected: true,
};

async function storeFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'leftout-receipts-'));
  tempDirectories.push(directory);
  const ledgerPath = join(directory, 'receipts.jsonl');
  let id = 0;
  const store = new ReceiptStore({
    ledgerPath,
    now: () => Date.parse('2026-09-01T12:01:01.000Z'),
    entryId: () => `90000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
  });
  await store.initialize();
  return { store, ledgerPath };
}

describe('connector receipt reporting store', () => {
  it('validates and appends a local capability receipt into a verified chain', async () => {
    const { store } = await storeFixture();
    const entry = await store.append(await validCapabilityReceipt(), page);
    expect(entry).toMatchObject({
      schemaVersion: 'leftout.connector-receipt/1',
      receiptId: '6f8f5771-9cde-4f2d-b9f1-66d29ef5a930',
      previousEntryHash: null,
      limitation: REPORT_LIMITATION,
    });
    expect(entry.entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.receiptHash).toMatch(/^[0-9a-f]{64}$/);
    await expect(store.listVerified()).resolves.toEqual([entry]);
    await expect(store.getVerified(entry.entryId)).resolves.toEqual(entry);
  });

  it.each([
    {
      label: 'scenario-1',
      file: './fixtures/legacy/connector-receipts-v1.jsonl',
      fileSha256:
        '8751f81d46def40f5a5e8ef0c1605471653c57362893156e0d65e36f96134f78',
      entryHash:
        '5ecd4fd91b06b80e49c700e96ac764033ff592c41d2217d41abc9f205c829044',
    },
    {
      label: 'guided-v2',
      file: './fixtures/legacy/guided-connector-receipts-v1.jsonl',
      fileSha256:
        'b913bf1453f597f7393b46a29ba9e8a696260f4a251f942401f6d6f8fcfb5538',
      entryHash:
        'd3c2588322fbb4de5c6f07390baa6a86c0dbce77e3dd2653e75c36e4cdf1cae8',
    },
  ])(
    'preserves a frozen pre-brand-correction $label ledger and appends current records',
    async ({ file, fileSha256, entryHash, label }) => {
      const { store, ledgerPath } = await storeFixture();
      const fixture = await readFile(new URL(file, import.meta.url), 'utf8');
      expect(createHash('sha256').update(fixture).digest('hex')).toBe(
        fileSha256,
      );
      await writeFile(ledgerPath, fixture, 'utf8');

      await expect(store.initialize()).resolves.toBeUndefined();
      const restored = await store.listVerified();
      expect(restored).toHaveLength(1);
      expect(restored[0]?.entryHash).toBe(entryHash);
      expect(restored[0]?.limitation).toBe(
        LEGACY_SELF_REPORTED_ASSURANCE_LIMITATION,
      );
      expect(restored[0]?.receipt.limitation).toBe(
        LEGACY_SELF_REPORTED_ASSURANCE_LIMITATION,
      );
      const successorReceipt =
        label === 'scenario-1'
          ? await validGuidedCapabilityReceipt('lesson-5-client-observation/1')
          : await validCapabilityReceipt();
      const successor = await store.append(successorReceipt, page);
      expect(successor.limitation).toBe(REPORT_LIMITATION);
      expect(successor.receipt.limitation).toBe(REPORT_LIMITATION);
      expect((await readFile(ledgerPath, 'utf8')).startsWith(fixture)).toBe(
        true,
      );
    },
  );

  it('rejects duplicate receipts and origin substitution', async () => {
    const { store } = await storeFixture();
    const receipt = await validCapabilityReceipt();
    await store.append(receipt, page);
    await expect(store.append(receipt, page)).rejects.toThrow(
      'already recorded',
    );
    await expect(
      store.append(
        { ...receipt, id: '22973cbc-be35-420e-bbe8-b72ec173d74e' },
        { ...page, origin: 'https://untrusted.example' },
      ),
    ).rejects.toThrow('Receipt origin');
  });

  it('returns the original entry for an exact idempotent commitment retry', async () => {
    const { store } = await storeFixture();
    const receipt = await validCapabilityReceipt();
    const original = await store.append(receipt, page);
    const retried = await store.append(
      structuredClone(receipt),
      { ...page },
      receipt.declaration.name,
      { acceptExactDuplicate: true },
    );

    expect(retried).toEqual(original);
    await expect(store.listVerified()).resolves.toEqual([original]);
    await expect(
      store.append(
        receipt,
        { ...page, sessionId: 'ef583fe0-5a3f-49aa-885d-b224c88cfb2e' },
        receipt.declaration.name,
        { acceptExactDuplicate: true },
      ),
    ).rejects.toThrow('already recorded');
  });

  it('rejects a mismatched capability identity before writing the ledger', async () => {
    const { store } = await storeFixture();
    const receipt = await validCapabilityReceipt();
    await expect(
      store.append(
        receipt,
        page,
        'get_training_1042_eligibility_once_0000000000000000',
      ),
    ).rejects.toThrow('different capability');
    await expect(store.listVerified()).resolves.toEqual([]);
  });

  it('persists a guided receipt and maps only its fixed scenario identity into a local issue candidate', async () => {
    const { store } = await storeFixture();
    const receipt = await validGuidedCapabilityReceipt(
      'lesson-5-client-observation/1',
    );
    const entry = await store.append(receipt, page, receipt.declaration.name);

    await expect(store.listVerified()).resolves.toEqual([entry]);
    const candidate = createIssueCandidateFromVerifiedReceipt(entry);
    expect(candidate).toMatchObject({
      source: { kind: 'verified-receipt', entryId: entry.entryId },
      title: 'One client observation was treated as universal support',
      draft: {
        context: 'synthetic-lab',
        category: 'support-overclaim',
        severity: 'informational',
        stage: 'discovery',
        submission: { submittable: false },
      },
    });
    expect(JSON.stringify(candidate)).not.toContain('This browser session');
    expect(JSON.stringify(candidate)).not.toContain('rawResult');
  });

  it('detects retained-file tampering before reporting entries', async () => {
    const { store, ledgerPath } = await storeFixture();
    await store.append(await validCapabilityReceipt(), page);
    const ledger = await readFile(ledgerPath, 'utf8');
    await writeFile(
      ledgerPath,
      ledger.replace('"verdict":"PASS"', '"verdict":"FAIL"'),
      'utf8',
    );
    await expect(store.listVerified()).rejects.toThrow('integrity failed');
  });
});
