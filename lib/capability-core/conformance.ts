/**
 * Stable test inputs for the TypeScript capability core used by the browser and
 * connector paths. The Android prototype checks the same security properties
 * with Android-specific bindings; this vector does not claim byte-for-byte
 * protocol or hash interoperability with Kotlin.
 */
export const CAPABILITY_CORE_CONFORMANCE_VECTOR_V1 = {
  protocol: 'capability-core/conformance/1',
  preparedAt: '2026-08-31T12:00:02.000Z',
  expiresAt: '2026-08-31T12:02:02.000Z',
  nonce: 'c152cf41-e3d7-4528-9e29-12110dd79278',
  origin: 'https://lab.example',
  handlerVersion: 'conformance-handler/1.0.0',
  baseline: {
    accountId: 'TRAINING-1042',
    eligibility: 'eligible',
    reviewed: false,
  },
  tool: {
    name: 'read_training_eligibility',
    title: 'Read training eligibility',
    description: 'Read one synthetic training record.',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', const: 'TRAINING-1042' },
      },
      required: ['account_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
  },
  expected: {
    sourceHash:
      '56d73040b4e4d7b380c03582dc5b27ec4b294187a28545e4fd93516936736527',
    schemaHash:
      '55e8103db0c022b396cfbe3b0aa54dcfe2abeb490788a9affc46fe974d84f824',
    baselineHash:
      '55a72751ad8b12634156879e7833b9044a2a31742b0a77f701c9078feeed2bc7',
    grantContractHash:
      '0476a9acfd3404eb7c87cb348bfd3e02724ced9e44d0832aa58e0591abdb746f',
  },
} as const;

export const CAPABILITY_CORE_CONFORMANCE_VECTORS = [
  CAPABILITY_CORE_CONFORMANCE_VECTOR_V1,
] as const;
