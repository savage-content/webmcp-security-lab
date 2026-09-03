import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { canonicalJson, sha256Hex } from '../../lib/capability-core';
import type { EvidenceReceipt } from '../../lib/lab/types';

import type { PairedPageSummary } from './bridge-coordinator';
import { validateConnectorCapabilityReceipt } from './lesson-capability-policy';

export const REPORT_LIMITATION =
  'This report reflects self-reported evidence readiness. Left Out Security has not inspected, tested, or independently validated the described system.';

export class ReceiptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiptValidationError';
  }
}

export interface ConnectorReceiptEntry {
  schemaVersion: 'leftout.connector-receipt/1';
  entryId: string;
  recordedAt: string;
  connection: {
    sessionId: string;
    origin: string;
    pageUrl: string;
    clientLabel: string;
  };
  receiptId: string;
  receiptHash: string;
  adapter?: {
    capabilityPermitSha256: string;
    enforcement: 'extension-consumed-before-invocation';
    consumedAt: string;
  };
  previousEntryHash: string | null;
  entryHash: string;
  receipt: EvidenceReceipt;
  limitation: typeof REPORT_LIMITATION;
}

interface ReceiptStoreOptions {
  ledgerPath: string;
  now?: () => number;
  entryId?: () => string;
}

interface ReceiptAppendOptions {
  acceptExactDuplicate?: boolean;
  adapter?: ConnectorReceiptEntry['adapter'];
}

function entryHashMaterial(entry: Omit<ConnectorReceiptEntry, 'entryHash'>) {
  return entry;
}

export class ReceiptStore {
  readonly #ledgerPath: string;
  readonly #now: () => number;
  readonly #entryId: () => string;
  #writeChain: Promise<unknown> = Promise.resolve();

  constructor(options: ReceiptStoreOptions) {
    this.#ledgerPath = options.ledgerPath;
    this.#now = options.now ?? Date.now;
    this.#entryId = options.entryId ?? randomUUID;
  }

  async initialize() {
    await mkdir(dirname(this.#ledgerPath), { recursive: true });
    await this.listVerified();
  }

  append(
    receiptValue: unknown,
    page: PairedPageSummary,
    expectedToolName?: string,
    options: ReceiptAppendOptions = {},
  ) {
    const operation = this.#writeChain.then(async () => {
      let receipt: EvidenceReceipt;
      try {
        receipt = await validateConnectorCapabilityReceipt(receiptValue);
      } catch {
        throw new ReceiptValidationError(
          'The returned capability receipt failed schema validation.',
        );
      }
      if (receipt.origin !== page.origin) {
        throw new ReceiptValidationError(
          'Receipt origin does not match the paired page.',
        );
      }
      if (
        expectedToolName !== undefined &&
        receipt.declaration.name !== expectedToolName
      ) {
        throw new ReceiptValidationError(
          'The returned receipt names a different capability.',
        );
      }
      const entries = await this.listVerified();
      const receiptHash = await sha256Hex(receipt);
      const duplicate = entries.find((entry) => entry.receiptId === receipt.id);
      if (duplicate) {
        if (
          options.acceptExactDuplicate === true &&
          duplicate.receiptHash === receiptHash &&
          duplicate.connection.sessionId === page.sessionId &&
          duplicate.connection.origin === page.origin &&
          duplicate.connection.pageUrl === page.pageUrl &&
          duplicate.connection.clientLabel === page.clientLabel &&
          canonicalJson(duplicate.adapter ?? null) ===
            canonicalJson(options.adapter ?? null)
        ) {
          return duplicate;
        }
        throw new ReceiptValidationError(
          'That capability receipt is already recorded.',
        );
      }
      const previousEntryHash = entries.at(-1)?.entryHash ?? null;
      const withoutHash: Omit<ConnectorReceiptEntry, 'entryHash'> = {
        schemaVersion: 'leftout.connector-receipt/1',
        entryId: this.#entryId(),
        recordedAt: new Date(this.#now()).toISOString(),
        connection: {
          sessionId: page.sessionId,
          origin: page.origin,
          pageUrl: page.pageUrl,
          clientLabel: page.clientLabel,
        },
        receiptId: receipt.id,
        receiptHash,
        ...(options.adapter
          ? { adapter: structuredClone(options.adapter) }
          : {}),
        previousEntryHash,
        receipt,
        limitation: REPORT_LIMITATION,
      };
      const entry: ConnectorReceiptEntry = {
        ...withoutHash,
        entryHash: await sha256Hex(entryHashMaterial(withoutHash)),
      };
      await appendFile(this.#ledgerPath, `${canonicalJson(entry)}\n`, {
        encoding: 'utf8',
        flag: 'a',
      });
      return entry;
    });
    this.#writeChain = operation.catch(() => undefined);
    return operation;
  }

  async listVerified(): Promise<ConnectorReceiptEntry[]> {
    let body: string;
    try {
      body = await readFile(this.#ledgerPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    const entries = body
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line) as ConnectorReceiptEntry;
        } catch {
          throw new ReceiptValidationError(
            `Receipt ledger line ${index + 1} is not JSON.`,
          );
        }
      });
    let previousEntryHash: string | null = null;
    const seenEntryIds = new Set<string>();
    const seenReceiptIds = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      if (
        entry.schemaVersion !== 'leftout.connector-receipt/1' ||
        entry.previousEntryHash !== previousEntryHash ||
        entry.limitation !== REPORT_LIMITATION ||
        seenEntryIds.has(entry.entryId) ||
        seenReceiptIds.has(entry.receiptId)
      ) {
        throw new ReceiptValidationError(
          `Receipt ledger chain failed at line ${index + 1}.`,
        );
      }
      if (
        entry.adapter !== undefined &&
        (!entry.adapter ||
          !/^[0-9a-f]{64}$/u.test(entry.adapter.capabilityPermitSha256) ||
          entry.adapter.enforcement !==
            'extension-consumed-before-invocation' ||
          typeof entry.adapter.consumedAt !== 'string' ||
          !Number.isFinite(Date.parse(entry.adapter.consumedAt)) ||
          Object.keys(entry.adapter).length !== 3)
      ) {
        throw new ReceiptValidationError(
          `Receipt ledger adapter evidence failed at line ${index + 1}.`,
        );
      }
      const { entryHash, ...withoutHash } = entry;
      const expectedEntryHash = await sha256Hex(entryHashMaterial(withoutHash));
      const expectedReceiptHash = await sha256Hex(entry.receipt);
      if (
        entryHash !== expectedEntryHash ||
        entry.receiptHash !== expectedReceiptHash ||
        entry.receipt.id !== entry.receiptId ||
        entry.receipt.origin !== entry.connection.origin
      ) {
        throw new ReceiptValidationError(
          `Receipt ledger integrity failed at line ${index + 1}.`,
        );
      }
      try {
        await validateConnectorCapabilityReceipt(entry.receipt);
      } catch {
        throw new ReceiptValidationError(
          `Receipt ledger schema failed at line ${index + 1}.`,
        );
      }
      seenEntryIds.add(entry.entryId);
      seenReceiptIds.add(entry.receiptId);
      previousEntryHash = entry.entryHash;
    }
    return entries;
  }

  async getVerified(entryId: string) {
    const entry = (await this.listVerified()).find(
      (candidate) => candidate.entryId === entryId,
    );
    if (!entry) throw new Error('The receipt report was not found.');
    return entry;
  }
}
