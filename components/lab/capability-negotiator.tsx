'use client';

import {
  AlertTriangle,
  Check,
  Clock3,
  FileCheck2,
  Fingerprint,
  LockKeyhole,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  canonicalJson,
  compileCapabilityContract,
  createLockedIntent,
  createProposalInput,
  createProposalRecord,
  createProposalToolDeclaration,
  executeScenarioOneCapability,
  fingerprintSource,
  prepareDocumentCapabilityActivation,
  sha256Hex,
  verifyCapabilityBinding,
  type DocumentCapabilityLease,
} from '@/lib/lab/capability-negotiation';
import type {
  CapabilityProposalRecord,
  CapabilityVerification,
  CapabilityInvalidationReason,
  CompiledCapabilityContract,
  EvidenceReceipt,
  JsonValue,
  LockedCapabilityIntent,
  RunOutcome,
  ToolDeclaration,
  WebMcpStatus,
} from '@/lib/lab/types';
import {
  LEGACY_CHROMIUM_RESULT_DELIVERY_GRACE_MS,
  createScenarioOneCapabilityToolResult,
  decideRegistrationSettlement,
  executeRegisteredTool,
  getModelContext,
  observeToolsPermission,
  registerPageTool,
  withOneUseRegistrationRetirement,
} from '@/lib/lab/webmcp';

export interface CapabilityRunPayload {
  proposal: CapabilityProposalRecord;
  contract: CompiledCapabilityContract;
  approvedAt: string;
  claimedAt: string;
  outcome: RunOutcome;
  verification: CapabilityVerification;
  invalidationReason: CapabilityInvalidationReason;
}

type CapabilityStatus =
  | 'idle'
  | 'registering'
  | 'registered'
  | 'invoked'
  | 'invalidated'
  | 'error';

type WorkflowPhase =
  | 'idle'
  | 'locking'
  | 'proposal'
  | 'preparing'
  | 'review'
  | 'registering'
  | 'active'
  | 'closed';

const initialRegistration: WebMcpStatus = {
  api: 'document.modelContext',
  browserSupport: 'checking',
  registration: 'checking',
  permissionsPolicy: 'unknown',
  discovery: 'not-checked',
  invocation: 'not-observed',
  detail: 'Lock the intent to expose the non-effecting proposal tool.',
  discoveredToolNames: [],
};

function normalizeInput(input: unknown) {
  if (typeof input === 'string') return JSON.parse(input) as unknown;
  return input;
}

function shortHash(value?: string) {
  return value ? `${value.slice(0, 12)}…${value.slice(-8)}` : 'Not created';
}

export function CapabilityNegotiator({
  sourceTool,
  sourceState,
  sourceToolSuppressed,
  getCurrentSourceTool,
  getCurrentSourceState,
  onSuppressSourceTool,
  onRestoreSourceTool,
  onSourceDrift,
  onCreateLocalReceipt,
  onExport,
}: {
  sourceTool: ToolDeclaration;
  sourceState: Record<string, JsonValue>;
  getCurrentSourceTool: () => ToolDeclaration;
  getCurrentSourceState: () => Record<string, JsonValue>;
  sourceToolSuppressed: boolean;
  onSuppressSourceTool: () => true;
  onRestoreSourceTool: () => void;
  onSourceDrift: () => void;
  onCreateLocalReceipt: (
    payload: CapabilityRunPayload,
  ) => Promise<EvidenceReceipt>;
  onExport: (receipt: EvidenceReceipt) => void;
}) {
  const [intent, setIntent] = useState<LockedCapabilityIntent>();
  const [proposal, setProposal] = useState<CapabilityProposalRecord>();
  const [contract, setContract] = useState<CompiledCapabilityContract>();
  const [proposalRegistration, setProposalRegistration] =
    useState<WebMcpStatus>(initialRegistration);
  const [capabilityStatus, setCapabilityStatus] =
    useState<CapabilityStatus>('idle');
  const [workflowPhase, setWorkflowPhase] = useState<WorkflowPhase>('idle');
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [message, setMessage] = useState(
    'Start by locking the human intent. Nothing has been invoked.',
  );
  const [receipt, setReceipt] = useState<EvidenceReceipt>();
  const [receiptState, setReceiptState] = useState<
    'idle' | 'local-export-only'
  >('idle');
  const [invalidationReason, setInvalidationReason] = useState<string>();
  const sourceObservationGenerationRef = useRef(0);
  const stateObservationGenerationRef = useRef(0);
  const proposalControllerRef = useRef<AbortController | undefined>(undefined);
  const capabilityControllerRef = useRef<AbortController | undefined>(
    undefined,
  );
  const expiryTimerRef = useRef<number | undefined>(undefined);
  const proposalActiveRef = useRef(false);
  const proposalGenerationRef = useRef('not-registered');
  const capabilityActiveRef = useRef(false);
  const capabilityGenerationRef = useRef('not-registered');
  const sourceWithdrawnRef = useRef(false);
  const leaseRef = useRef<DocumentCapabilityLease | undefined>(undefined);
  const mountedRef = useRef(true);
  const operationEpochRef = useRef(0);
  const proposalOperationRef = useRef(0);
  const workflowPhaseRef = useRef<WorkflowPhase>('idle');
  const [approvalEventAt, setApprovalEventAt] = useState<string>();

  const transitionPhase = useCallback((phase: WorkflowPhase) => {
    workflowPhaseRef.current = phase;
    setWorkflowPhase(phase);
  }, []);

  useEffect(() => {
    sourceObservationGenerationRef.current += 1;
  }, [sourceTool]);

  useEffect(() => {
    stateObservationGenerationRef.current += 1;
  }, [sourceState]);

  const invalidate = useCallback((reason: string, detail: string) => {
    operationEpochRef.current += 1;
    workflowPhaseRef.current = 'closed';
    capabilityActiveRef.current = false;
    capabilityGenerationRef.current = crypto.randomUUID();
    leaseRef.current?.invalidate(reason === 'expired' ? 'expired' : 'revoked');
    capabilityControllerRef.current?.abort();
    capabilityControllerRef.current = undefined;
    if (expiryTimerRef.current !== undefined) {
      window.clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = undefined;
    }
    setInvalidationReason(reason);
    setCapabilityStatus('invalidated');
    setWorkflowPhase('closed');
    setApprovalOpen(false);
    setMessage(detail);
  }, []);

  const stageProposal = useCallback(
    async (input: unknown, channel: CapabilityProposalRecord['channel']) => {
      if (!intent || workflowPhaseRef.current !== 'proposal') {
        throw new Error('Lock an intent before proposing a capability.');
      }
      const epoch = operationEpochRef.current;
      const proposalOperation = proposalOperationRef.current + 1;
      proposalOperationRef.current = proposalOperation;
      const sourceSnapshot = structuredClone(getCurrentSourceTool());
      const record = await createProposalRecord({
        input: normalizeInput(input),
        intent,
        sourceTool: sourceSnapshot,
        proposedAt: new Date().toISOString(),
        channel,
      });
      if (
        !mountedRef.current ||
        operationEpochRef.current !== epoch ||
        proposalOperationRef.current !== proposalOperation ||
        workflowPhaseRef.current !== 'proposal' ||
        canonicalJson(getCurrentSourceTool()) !== canonicalJson(sourceSnapshot)
      ) {
        throw new Error('The proposal operation was superseded.');
      }
      setProposal(record);
      setContract(undefined);
      setApprovalEventAt(undefined);
      setReceipt(undefined);
      setReceiptState('idle');
      setInvalidationReason(undefined);
      setCapabilityStatus('idle');
      setMessage(
        `Exact proposal ${record.proposalHash.slice(0, 12)} staged. Human approval is still required; no source tool was invoked.`,
      );
      return {
        staged: true,
        proposal_hash: record.proposalHash,
        source_declaration_hash: record.source.sourceDeclarationHash,
        human_approval_required: true,
        account_mutated: false,
        source_tool_invoked: false,
      };
    },
    [getCurrentSourceTool, intent],
  );

  useEffect(() => {
    if (!intent || workflowPhase !== 'proposal') return;
    const controller = new AbortController();
    proposalControllerRef.current = controller;
    proposalActiveRef.current = true;
    const proposalGeneration = crypto.randomUUID();
    proposalGenerationRef.current = proposalGeneration;
    const declaration = createProposalToolDeclaration(intent);
    const permissionObservation = observeToolsPermission();
    const modelContext = getModelContext();

    void registerPageTool({
      modelContext,
      tool: {
        ...declaration,
        execute: async (input) => {
          if (
            !proposalActiveRef.current ||
            proposalGenerationRef.current !== proposalGeneration
          ) {
            throw new Error('This proposal-tool registration was withdrawn.');
          }
          const result = await stageProposal(input, 'webmcp');
          setProposalRegistration((current) => ({
            ...current,
            discovery: 'discovered',
            invocation: 'observed',
            detail:
              'The proposal tool was invoked. It staged review data only and did not call the source handler.',
            discoveredToolNames: [declaration.name],
          }));
          return result;
        },
      },
      signal: controller.signal,
      permissionObservation,
    }).then((status) => {
      if (!controller.signal.aborted) setProposalRegistration(status);
    });

    return () => {
      if (proposalGenerationRef.current === proposalGeneration) {
        proposalActiveRef.current = false;
        proposalGenerationRef.current = crypto.randomUUID();
      }
      controller.abort();
      if (proposalControllerRef.current === controller) {
        proposalControllerRef.current = undefined;
      }
    };
  }, [intent, stageProposal, workflowPhase]);

  useEffect(() => {
    if (
      !contract ||
      !['review', 'registering', 'active'].includes(workflowPhaseRef.current)
    ) {
      return;
    }
    let cancelled = false;
    const sourceSnapshot = structuredClone(getCurrentSourceTool());
    const stateSnapshot = structuredClone(getCurrentSourceState());
    void Promise.all([
      fingerprintSource({
        tool: sourceSnapshot,
        handlerVersion: contract.source.handlerVersion,
        origin: window.location.origin,
      }),
      sha256Hex(stateSnapshot),
    ]).then(([observedHash, observedStateHash]) => {
      if (
        !cancelled &&
        ['review', 'registering', 'active'].includes(
          workflowPhaseRef.current,
        ) &&
        (observedHash !== contract.source.sourceDeclarationHash ||
          observedStateHash !== contract.intent.baseline.stateHash)
      ) {
        invalidate(
          observedHash !== contract.source.sourceDeclarationHash
            ? 'source-drift'
            : 'state-drift',
          `Authority drift detected (source ${shortHash(observedHash)}, state ${shortHash(observedStateHash)}). The generated tool was unregistered without invoking it.`,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    contract,
    getCurrentSourceState,
    getCurrentSourceTool,
    invalidate,
    sourceState,
    sourceTool,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationEpochRef.current += 1;
      workflowPhaseRef.current = 'closed';
      proposalActiveRef.current = false;
      proposalGenerationRef.current = crypto.randomUUID();
      capabilityActiveRef.current = false;
      capabilityGenerationRef.current = crypto.randomUUID();
      sourceWithdrawnRef.current = false;
      leaseRef.current?.invalidate('revoked');
      proposalControllerRef.current?.abort();
      proposalActiveRef.current = false;
      capabilityControllerRef.current?.abort();
      if (expiryTimerRef.current !== undefined) {
        window.clearTimeout(expiryTimerRef.current);
      }
      onRestoreSourceTool();
    };
  }, [onRestoreSourceTool]);

  async function lockIntent() {
    if (workflowPhaseRef.current !== 'idle') return;
    const currentState = structuredClone(getCurrentSourceState());
    if (
      currentState.accountId !== 'TRAINING-1042' ||
      currentState.reviewed !== false ||
      currentState.reviewCount !== 0 ||
      currentState.lastReviewedAt !== null
    ) {
      setMessage(
        'Reset the Scenario 1 fixture before locking intent; the approved baseline must start with reviewed=false, reviewCount=0, and lastReviewedAt=null.',
      );
      return;
    }
    transitionPhase('locking');
    const epoch = operationEpochRef.current + 1;
    operationEpochRef.current = epoch;
    const stateGeneration = stateObservationGenerationRef.current;
    const baselineStateHash = await sha256Hex(structuredClone(currentState));
    if (!mountedRef.current || operationEpochRef.current !== epoch) return;
    if (
      stateObservationGenerationRef.current !== stateGeneration ||
      canonicalJson(getCurrentSourceState()) !== canonicalJson(currentState)
    ) {
      transitionPhase('idle');
      setMessage(
        'The fixture changed while intent was being locked. Reset it and try again.',
      );
      return;
    }
    const next = createLockedIntent({
      origin: window.location.origin,
      lockedAt: new Date().toISOString(),
      baselineStateHash,
      ttlSeconds: 120,
    });
    setIntent(next);
    setProposal(undefined);
    setContract(undefined);
    setReceipt(undefined);
    setReceiptState('idle');
    setApprovalEventAt(undefined);
    transitionPhase('proposal');
    const modelContext = getModelContext();
    setProposalRegistration({
      api: 'document.modelContext',
      browserSupport: modelContext?.registerTool ? 'supported' : 'unsupported',
      registration: 'registering',
      permissionsPolicy: observeToolsPermission(),
      discovery: 'not-checked',
      invocation: 'not-observed',
      detail: `Registering ${createProposalToolDeclaration(next).name}.`,
      discoveredToolNames: [],
    });
    setInvalidationReason(undefined);
    setCapabilityStatus('idle');
    setMessage(
      'Human intent locked: one eligibility read for TRAINING-1042, 120-second TTL, no account mutation, capability-handler fetch, or cross-account access.',
    );
  }

  async function prepareContractForReview() {
    if (!intent || !proposal || workflowPhaseRef.current !== 'proposal') {
      return;
    }
    transitionPhase('preparing');
    const epoch = operationEpochRef.current + 1;
    operationEpochRef.current = epoch;
    proposalOperationRef.current += 1;
    proposalActiveRef.current = false;
    proposalGenerationRef.current = crypto.randomUUID();
    proposalControllerRef.current?.abort();
    proposalControllerRef.current = undefined;
    setProposalRegistration((current) => ({
      ...current,
      registration: 'unregistered',
      discovery: 'not-discovered',
      detail: 'The proposal-only tool is frozen and unregistered for review.',
      discoveredToolNames: [],
    }));
    setMessage('Freezing the exact contract for human review.');

    const sourceGeneration = sourceObservationGenerationRef.current;
    const stateGeneration = stateObservationGenerationRef.current;
    const sourceSnapshot = structuredClone(getCurrentSourceTool());
    const stateSnapshot = structuredClone(getCurrentSourceState());
    const [currentHash, currentStateHash] = await Promise.all([
      fingerprintSource({
        tool: sourceSnapshot,
        handlerVersion: proposal.source.handlerVersion,
        origin: window.location.origin,
      }),
      sha256Hex(stateSnapshot),
    ]);
    if (!mountedRef.current || operationEpochRef.current !== epoch) return;
    if (
      sourceObservationGenerationRef.current !== sourceGeneration ||
      canonicalJson(getCurrentSourceTool()) !== canonicalJson(sourceSnapshot) ||
      currentHash !== proposal.source.sourceDeclarationHash
    ) {
      invalidate(
        'source-drift',
        'The source changed before contract review. Nothing was withdrawn or invoked.',
      );
      return;
    }
    if (
      stateObservationGenerationRef.current !== stateGeneration ||
      canonicalJson(getCurrentSourceState()) !== canonicalJson(stateSnapshot) ||
      currentStateHash !== intent.baseline.stateHash
    ) {
      invalidate(
        'state-drift',
        'The synthetic account changed before contract review. Nothing was withdrawn or invoked.',
      );
      return;
    }

    const compiled = await compileCapabilityContract({
      intent,
      proposal,
      preparedAt: new Date().toISOString(),
    });
    if (!mountedRef.current || operationEpochRef.current !== epoch) return;
    if (
      sourceObservationGenerationRef.current !== sourceGeneration ||
      canonicalJson(getCurrentSourceTool()) !== canonicalJson(sourceSnapshot)
    ) {
      invalidate(
        'source-drift',
        'The source changed while the review contract was compiling. Nothing was withdrawn or invoked.',
      );
      return;
    }
    if (
      stateObservationGenerationRef.current !== stateGeneration ||
      canonicalJson(getCurrentSourceState()) !== canonicalJson(stateSnapshot)
    ) {
      invalidate(
        'state-drift',
        'The synthetic account changed while the review contract was compiling. Nothing was withdrawn or invoked.',
      );
      return;
    }
    setContract(compiled);
    transitionPhase('review');
    setCapabilityStatus('idle');
    setApprovalOpen(true);
    setMessage(
      `Contract ${compiled.contractHash.slice(0, 12)} is frozen for review. It has not been approved or registered.`,
    );
  }

  async function approveAndRegister() {
    if (
      !intent ||
      !proposal ||
      !contract ||
      workflowPhaseRef.current !== 'review'
    ) {
      return;
    }
    transitionPhase('registering');
    const epoch = operationEpochRef.current + 1;
    operationEpochRef.current = epoch;
    const approvedAt = new Date().toISOString();
    setApprovalEventAt(approvedAt);
    setApprovalOpen(false);
    setCapabilityStatus('registering');
    setMessage('Revalidating the source before withdrawing it.');

    const sourceGeneration = sourceObservationGenerationRef.current;
    const stateGeneration = stateObservationGenerationRef.current;
    const sourceSnapshot = structuredClone(getCurrentSourceTool());
    const stateSnapshot = structuredClone(getCurrentSourceState());
    const [currentHash, currentStateHash] = await Promise.all([
      fingerprintSource({
        tool: sourceSnapshot,
        handlerVersion: proposal.source.handlerVersion,
        origin: window.location.origin,
      }),
      sha256Hex(stateSnapshot),
    ]);
    if (!mountedRef.current || operationEpochRef.current !== epoch) return;
    if (
      sourceObservationGenerationRef.current !== sourceGeneration ||
      canonicalJson(getCurrentSourceTool()) !== canonicalJson(sourceSnapshot) ||
      currentHash !== proposal.source.sourceDeclarationHash
    ) {
      invalidate(
        'source-drift',
        'The source changed after review. The approval event was recorded, but nothing was withdrawn, registered, or invoked.',
      );
      return;
    }
    if (
      stateObservationGenerationRef.current !== stateGeneration ||
      canonicalJson(getCurrentSourceState()) !== canonicalJson(stateSnapshot) ||
      currentStateHash !== intent.baseline.stateHash
    ) {
      invalidate(
        'state-drift',
        'The synthetic account changed after review. The approval event was recorded, but nothing was withdrawn, registered, or invoked.',
      );
      return;
    }

    const activation = prepareDocumentCapabilityActivation({
      expiresAt: contract.compiled.expiresAt,
      suppressSource: onSuppressSourceTool,
    });
    if (!activation.ok) {
      invalidate(
        'expired',
        'The frozen contract expired during approval revalidation. Nothing was withdrawn, registered, or invoked.',
      );
      return;
    }
    const { lease } = activation;
    leaseRef.current = lease;

    proposalActiveRef.current = false;
    proposalGenerationRef.current = crypto.randomUUID();
    proposalControllerRef.current?.abort();
    proposalControllerRef.current = undefined;
    setProposalRegistration((current) => ({
      ...current,
      registration: 'unregistered',
      discovery: 'not-discovered',
      detail:
        'The proposal-only tool was withdrawn before capability registration.',
      discoveredToolNames: [],
    }));
    sourceWithdrawnRef.current = activation.sourceWithdrawn;

    const controller = new AbortController();
    capabilityControllerRef.current = controller;
    controller.signal.addEventListener(
      'abort',
      () => {
        if (capabilityControllerRef.current === controller) {
          capabilityControllerRef.current = undefined;
        }
      },
      { once: true },
    );
    const capabilityGeneration = crypto.randomUUID();
    capabilityGenerationRef.current = capabilityGeneration;
    capabilityActiveRef.current = true;
    const remaining = Math.max(0, lease.deadline - performance.now());
    expiryTimerRef.current = window.setTimeout(() => {
      if (
        capabilityActiveRef.current &&
        operationEpochRef.current === epoch &&
        capabilityGenerationRef.current === capabilityGeneration &&
        lease.state() === 'active'
      ) {
        invalidate(
          'expired',
          'The approval window expired. The generated tool was unregistered without invocation.',
        );
      }
    }, remaining);
    const modelContext = getModelContext();
    const permissionObservation = observeToolsPermission();
    const status = await registerPageTool({
      modelContext,
      tool: {
        ...contract.compiled.declaration,
        execute: withOneUseRegistrationRetirement(
          controller,
          async (input, _client, lifecycle) => {
            if (
              !capabilityActiveRef.current ||
              capabilityGenerationRef.current !== capabilityGeneration
            ) {
              throw new Error(
                'This capability registration was consumed, expired, or revoked.',
              );
            }
            const value = normalizeInput(input);
            if (
              !value ||
              typeof value !== 'object' ||
              Array.isArray(value) ||
              Object.keys(value as Record<string, unknown>).length > 0
            ) {
              throw new Error('This bound capability accepts no inputs.');
            }

            if (!sourceWithdrawnRef.current) {
              throw new Error(
                'The broad source tool is not synchronously withdrawn.',
              );
            }
            const claim = lease.claim();
            if (!claim?.ok) {
              const reason = claim?.reason ?? 'revoked';
              invalidate(
                reason,
                `Invocation rejected: the document-session lease is ${reason}.`,
              );
              throw new Error(`Capability invalidated: ${reason}.`);
            }

            // Close the logical authority synchronously before any awaited work
            // so two concurrent calls cannot both pass the one-use check.
            // Chrome 152 cancels an in-flight execution if its registration
            // signal is aborted, so physical retirement happens only after the
            // successful callback result has had a short settlement grace.
            lifecycle.markClaimed();
            capabilityActiveRef.current = false;
            capabilityGenerationRef.current = crypto.randomUUID();
            if (expiryTimerRef.current !== undefined) {
              window.clearTimeout(expiryTimerRef.current);
              expiryTimerRef.current = undefined;
            }

            const claimedAt = new Date().toISOString();
            const sourceGeneration = sourceObservationGenerationRef.current;
            const stateGeneration = stateObservationGenerationRef.current;
            const invocationSourceSnapshot = structuredClone(
              getCurrentSourceTool(),
            );
            const invocationStateSnapshot = structuredClone(
              getCurrentSourceState(),
            );
            const binding = await verifyCapabilityBinding({
              contract,
              sourceTool: invocationSourceSnapshot,
              origin: window.location.origin,
              now: claimedAt,
              callsClaimed: 0,
            });
            if (!mountedRef.current || operationEpochRef.current !== epoch) {
              throw new Error(
                'Capability invocation was revoked during binding.',
              );
            }
            if (
              (sourceObservationGenerationRef.current !== sourceGeneration ||
                canonicalJson(getCurrentSourceTool()) !==
                  canonicalJson(invocationSourceSnapshot)) &&
              binding.ok
            ) {
              invalidate(
                'source-drift',
                'Invocation rejected: the source changed during binding verification.',
              );
              throw new Error('Capability invalidated: source-drift.');
            }
            if (!binding.ok) {
              invalidate(
                binding.reason,
                `Invocation rejected: ${binding.reason}. The generated tool is no longer registered.`,
              );
              throw new Error(`Capability invalidated: ${binding.reason}.`);
            }
            if (
              stateObservationGenerationRef.current !== stateGeneration ||
              canonicalJson(getCurrentSourceState()) !==
                canonicalJson(invocationStateSnapshot)
            ) {
              invalidate(
                'state-drift',
                'Invocation rejected: the synthetic account changed during binding verification.',
              );
              throw new Error('Capability invalidated: state-drift.');
            }

            const { outcome, verification } =
              await executeScenarioOneCapability({
                contract,
                currentState: invocationStateSnapshot,
                checkedAt: claimedAt,
              });
            if (!mountedRef.current || operationEpochRef.current !== epoch) {
              throw new Error(
                'Capability invocation was revoked during verification.',
              );
            }
            if (
              stateObservationGenerationRef.current !== stateGeneration ||
              canonicalJson(getCurrentSourceState()) !==
                canonicalJson(invocationStateSnapshot)
            ) {
              invalidate(
                'state-drift',
                'Invocation rejected: the synthetic account changed during result verification.',
              );
              throw new Error('Capability invalidated: state-drift.');
            }
            const resultInvalidationReason: CapabilityInvalidationReason =
              verification.passed ? 'consumed' : 'state-drift';
            let recorded: EvidenceReceipt;
            try {
              recorded = await onCreateLocalReceipt({
                proposal,
                contract,
                approvedAt,
                claimedAt,
                outcome,
                verification,
                invalidationReason: resultInvalidationReason,
              });
            } catch (error) {
              invalidate(
                'handler-drift',
                `Local evidence integrity validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              );
              throw error;
            }
            if (!mountedRef.current || operationEpochRef.current !== epoch) {
              throw new Error(
                'Capability invocation was revoked during receipt validation.',
              );
            }
            setCapabilityStatus('invoked');
            setReceipt(recorded);
            setReceiptState('local-export-only');
            setInvalidationReason(resultInvalidationReason);
            workflowPhaseRef.current = 'closed';
            setWorkflowPhase('closed');
            setMessage(
              `${outcome.verdict}: ${verification.passed ? 'required result and locked baseline matched' : 'the fixture no longer matched the approved baseline'}. The one-use authority was synchronously consumed; physical registration retirement is scheduled ${LEGACY_CHROMIUM_RESULT_DELIVERY_GRACE_MS} ms after successful callback fulfillment for Chrome 152 result-delivery compatibility. Local receipt ${recorded.id.slice(0, 8)}.`,
            );
            return createScenarioOneCapabilityToolResult(recorded);
          },
          {
            onClaimedFailure: () => {
              if (
                mountedRef.current &&
                operationEpochRef.current === epoch &&
                workflowPhaseRef.current !== 'closed'
              ) {
                invalidate(
                  'handler-drift',
                  'Invocation failed after the one-use authority was consumed. The registration was retired and no connector receipt was established. Reset the negotiation before any retest.',
                );
              }
            },
          },
        ),
      },
      signal: controller.signal,
      permissionObservation,
    });

    const registrationSettlement = decideRegistrationSettlement({
      mounted: mountedRef.current,
      epochMatches: operationEpochRef.current === epoch,
      generationMatches:
        capabilityGenerationRef.current === capabilityGeneration,
      leaseState: lease.state(),
    });
    if (registrationSettlement === 'preserve-claimed-execution') {
      // registerTool() may settle after the newly visible tool has already been
      // invoked. Its callback now owns result delivery and physical retirement.
      return;
    }
    if (registrationSettlement === 'discard-stale-registration') {
      controller.abort();
      lease.invalidate('revoked');
      if (capabilityControllerRef.current === controller) {
        capabilityControllerRef.current = undefined;
      }
      if (leaseRef.current === lease) leaseRef.current = undefined;
      if (capabilityGenerationRef.current === capabilityGeneration) {
        capabilityGenerationRef.current = crypto.randomUUID();
      }
      capabilityActiveRef.current = false;
      return;
    }

    if (status.registration !== 'registered') {
      controller.abort();
      if (expiryTimerRef.current !== undefined) {
        window.clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = undefined;
      }
      if (capabilityControllerRef.current === controller) {
        capabilityControllerRef.current = undefined;
      }
      lease.invalidate('revoked');
      if (leaseRef.current === lease) leaseRef.current = undefined;
      capabilityGenerationRef.current = crypto.randomUUID();
      capabilityActiveRef.current = false;
      sourceWithdrawnRef.current = false;
      onRestoreSourceTool();
      transitionPhase('closed');
      setCapabilityStatus('error');
      setInvalidationReason('registration-failed');
      setMessage(
        `Dynamic registration failed and the broad source fixture was restored: ${status.detail}`,
      );
      return;
    }

    transitionPhase('active');
    setCapabilityStatus('registered');
    setMessage(
      `Registered ${contract.compiled.toolName}. The broad source and proposal tools are unregistered.`,
    );
  }

  async function runCapabilitySelfTest() {
    if (!contract || capabilityStatus !== 'registered') return;
    const epoch = operationEpochRef.current;
    const capabilityGeneration = capabilityGenerationRef.current;
    const modelContext = getModelContext();
    if (!modelContext?.getTools || !modelContext.executeTool) {
      setMessage(
        'This client does not expose the optional same-origin discovery/invocation APIs. An external WebMCP client may still discover the registered tool.',
      );
      return;
    }

    try {
      const tools = await modelContext.getTools();
      if (
        !mountedRef.current ||
        operationEpochRef.current !== epoch ||
        capabilityGenerationRef.current !== capabilityGeneration
      ) {
        return;
      }
      const tool = tools.find(
        (item) => item.name === contract.compiled.toolName,
      );
      if (!tool) {
        setMessage('The generated tool was not discoverable in this client.');
        return;
      }
      await executeRegisteredTool(modelContext, tool, {});
    } catch (error) {
      if (
        mountedRef.current &&
        operationEpochRef.current === epoch &&
        capabilityGenerationRef.current === capabilityGeneration
      ) {
        setMessage(
          `Capability invocation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  function resetNegotiation() {
    proposalControllerRef.current?.abort();
    proposalActiveRef.current = false;
    proposalGenerationRef.current = crypto.randomUUID();
    capabilityControllerRef.current?.abort();
    capabilityControllerRef.current = undefined;
    if (expiryTimerRef.current !== undefined) {
      window.clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = undefined;
    }
    leaseRef.current?.invalidate('revoked');
    leaseRef.current = undefined;
    capabilityActiveRef.current = false;
    capabilityGenerationRef.current = crypto.randomUUID();
    sourceWithdrawnRef.current = false;
    setIntent(undefined);
    setProposal(undefined);
    setContract(undefined);
    setReceipt(undefined);
    setReceiptState('idle');
    setApprovalEventAt(undefined);
    setProposalRegistration(initialRegistration);
    setCapabilityStatus('idle');
    operationEpochRef.current += 1;
    transitionPhase('idle');
    setInvalidationReason(undefined);
    setMessage(
      'Negotiation reset. The broad source fixture is registered again.',
    );
    onRestoreSourceTool();
  }

  const approvalCopy = contract?.approval.copy ?? '';
  const steps = [
    ['Intent', Boolean(intent)],
    ['Inspect', Boolean(proposal?.source.sourceDeclarationHash)],
    ['Negotiate', Boolean(proposal)],
    ['Approve', Boolean(approvalEventAt)],
    [
      'Register',
      capabilityStatus === 'registered' || capabilityStatus === 'invoked',
    ],
    ['Invoke + verify', Boolean(receipt)],
    ['Close authority', Boolean(invalidationReason)],
  ] as const;

  return (
    <section className="border-t border-foreground bg-slate-950 px-5 py-8 text-slate-100 lg:px-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-lime-300">
            <LockKeyhole className="size-4" />
            Scenario 1 vertical slice · local branch only
          </div>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight">
            Compile one human-approved task into less authority.
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            The proposal cannot execute the source handler. Approval withdraws
            the broad tool before registering a uniquely named, no-input,
            one-use capability bound to this origin, source fingerprint, and
            versioned pure handler.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-white/20 text-slate-200">
            {sourceToolSuppressed ? 'Source withdrawn' : 'Source registered'}
          </Badge>
          <Badge variant="outline" className="border-white/20 text-slate-200">
            Capability: {capabilityStatus}
          </Badge>
        </div>
      </div>

      <div className="mt-6 grid gap-1.5 sm:grid-cols-4 xl:grid-cols-7">
        {steps.map(([label, done], index) => (
          <div
            key={label}
            className={`rounded-md border px-3 py-3 ${done ? 'border-lime-400/45 bg-lime-300/10' : 'border-white/12 bg-white/5'}`}
          >
            <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-slate-400">
              {index + 1}
              {done ? <Check className="size-3.5 text-lime-300" /> : null}
            </div>
            <p className="mt-2 text-xs font-semibold">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <NegotiationCard
          icon={<LockKeyhole />}
          eyebrow="Human intent"
          title="Fixed authority ceiling"
        >
          <ul className="space-y-1.5 text-xs leading-5 text-slate-300">
            <li>Target: TRAINING-1042 only</li>
            <li>Effect: read eligibility once</li>
            <li>TTL: 120 seconds</li>
            <li>
              Prohibited: account mutation, handler fetch, cross-account access
            </li>
          </ul>
          <Button
            className="mt-4 w-full"
            variant="secondary"
            onClick={() => void lockIntent()}
            disabled={workflowPhase !== 'idle'}
          >
            <LockKeyhole data-icon="inline-start" />
            {intent ? 'Intent locked' : 'Lock human intent'}
          </Button>
        </NegotiationCard>

        <NegotiationCard
          icon={<Fingerprint />}
          eyebrow="Agent proposal"
          title="No execution authority"
        >
          <dl className="space-y-2 text-xs">
            <HashRow
              label="Source"
              value={proposal?.source.sourceDeclarationHash}
            />
            <HashRow label="Proposal" value={proposal?.proposalHash} />
            <HashRow
              label="Registration"
              value={proposalRegistration.registration}
              hash={false}
            />
          </dl>
          <Button
            className="mt-4 w-full"
            variant="secondary"
            disabled={!intent || workflowPhase !== 'proposal'}
            onClick={() =>
              intent &&
              void stageProposal(
                createProposalInput(intent),
                'fallback-harness',
              )
            }
          >
            <FileCheck2 data-icon="inline-start" />
            Stage exact proposal (harness)
          </Button>
        </NegotiationCard>

        <NegotiationCard
          icon={<ShieldCheck />}
          eyebrow="Compiled capability"
          title="No-input and single use"
        >
          <dl className="space-y-2 text-xs">
            <HashRow label="Contract" value={contract?.contractHash} />
            <HashRow
              label="Tool"
              value={contract?.compiled.toolName}
              hash={false}
            />
            <HashRow
              label="Expires"
              value={contract?.compiled.expiresAt}
              hash={false}
            />
          </dl>
          <Button
            className="mt-4 w-full"
            disabled={
              !proposal || !['proposal', 'review'].includes(workflowPhase)
            }
            onClick={() =>
              workflowPhase === 'review'
                ? setApprovalOpen(true)
                : void prepareContractForReview()
            }
          >
            <ShieldCheck data-icon="inline-start" />
            {workflowPhase === 'review'
              ? 'Review frozen contract'
              : 'Prepare exact approval'}
          </Button>
        </NegotiationCard>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-white/12 bg-white/5 p-4 lg:flex-row lg:items-center lg:justify-between">
        <output aria-live="polite" className="text-xs leading-5 text-slate-300">
          {message}
        </output>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => void runCapabilitySelfTest()}
            disabled={capabilityStatus !== 'registered'}
          >
            <Radio data-icon="inline-start" />
            Invoke through WebMCP
          </Button>
          <Button
            variant="outline"
            className="border-white/20 bg-transparent text-slate-100 hover:bg-white/10 hover:text-white"
            onClick={onSourceDrift}
            disabled={capabilityStatus !== 'registered'}
          >
            <Unplug data-icon="inline-start" />
            Change source declaration
          </Button>
          <Button
            variant="outline"
            className="border-white/20 bg-transparent text-slate-100 hover:bg-white/10 hover:text-white"
            onClick={resetNegotiation}
          >
            <RefreshCw data-icon="inline-start" />
            Reset negotiation
          </Button>
        </div>
      </div>

      {receipt ? (
        <div
          className={`mt-4 flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between ${
            receipt.verdict === 'PASS'
              ? 'border-lime-400/35 bg-lime-300/10'
              : 'border-red-400/35 bg-red-300/10'
          }`}
        >
          <div className="flex items-start gap-3">
            {receipt.verdict === 'PASS' ? (
              <Check className="mt-0.5 size-5 text-lime-300" />
            ) : (
              <AlertTriangle className="mt-0.5 size-5 text-red-300" />
            )}
            <div>
              <p className="text-sm font-semibold">
                {receipt.verdict} · local receipt {receipt.id}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-300">
                {receipt.capability?.verification.baselineStateMatched
                  ? 'Locked baseline and required result matched.'
                  : 'The locked baseline did not match at invocation.'}{' '}
                Controlled handler checks found{' '}
                {receipt.capability?.verification.controlledHandlerViolations
                  .length ?? 0}{' '}
                violations. Logical authority:{' '}
                {receipt.capability?.invalidation.reason}.
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => onExport(receipt)}>
            <FileCheck2 data-icon="inline-start" />
            Export linked receipt
          </Button>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 text-xs text-slate-300 md:grid-cols-3">
        <EvidenceFact
          icon={<Play />}
          label="Invocation"
          value={receipt ? 'Observed once' : 'Not observed'}
        />
        <EvidenceFact
          icon={<Clock3 />}
          label="Persistence"
          value={receiptState}
        />
        <EvidenceFact
          icon={<Unplug />}
          label="Logical authority"
          value={invalidationReason ?? 'Not observed'}
        />
      </div>

      <AlertDialog open={approvalOpen} onOpenChange={setApprovalOpen}>
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-amber-100 text-amber-900">
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Withdraw the broad tool and register one exact capability?
            </AlertDialogTitle>
            <AlertDialogDescription>{approvalCopy}</AlertDialogDescription>
          </AlertDialogHeader>
          {proposal ? (
            <div className="space-y-2 break-all rounded-md border border-border bg-muted/50 p-3 font-mono text-[10px] leading-5 text-muted-foreground">
              <p>contract_sha256: {contract?.contractHash}</p>
              <p>proposal_sha256: {contract?.proposalHash}</p>
              <p>capability_id: {contract?.capabilityId}</p>
              <p>approval_nonce: {contract?.approval.nonce}</p>
              <p>origin: {contract?.source.origin}</p>
              <p>
                source_declaration_sha256:{' '}
                {contract?.source.sourceDeclarationHash}
              </p>
              <p>source_handler_version: {contract?.source.handlerVersion}</p>
              <p>
                capability_handler_version: {contract?.compiled.handlerVersion}
              </p>
              <p>generated_tool: {contract?.compiled.toolName}</p>
              <p>expires_at: {contract?.compiled.expiresAt}</p>
              <p>
                required_result:{' '}
                {JSON.stringify(contract?.intent.requiredResult)}
              </p>
              <p>
                approved_baseline: {JSON.stringify(contract?.intent.baseline)}
              </p>
              <p>
                required_postcondition: {contract?.intent.expectedPostcondition}
              </p>
              <p>
                prohibited_effects:{' '}
                {JSON.stringify(contract?.intent.prohibitedEffects)}
              </p>
              <p>
                input_schema:{' '}
                {JSON.stringify(contract?.compiled.declaration.inputSchema)}
              </p>
              <details>
                <summary className="cursor-pointer font-sans text-xs font-semibold text-foreground">
                  Complete canonical contract hash preimage
                </summary>
                <p className="mt-2 whitespace-pre-wrap">
                  {contract
                    ? canonicalJson({
                        protocol: contract.protocol,
                        capabilityId: contract.capabilityId,
                        intent: contract.intent,
                        proposalHash: contract.proposalHash,
                        source: contract.source,
                        approval: contract.approval,
                        compiled: contract.compiled,
                      })
                    : ''}
                </p>
              </details>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void approveAndRegister()}>
              Approve withdrawal + one-use registration
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function NegotiationCard({
  icon,
  eyebrow,
  title,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/12 bg-white/5 p-4">
      <div className="flex items-center gap-2 text-lime-300 [&_svg]:size-4">
        {icon}
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em]">
          {eyebrow}
        </p>
      </div>
      <h4 className="mt-2 text-base font-semibold">{title}</h4>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function HashRow({
  label,
  value,
  hash = true,
}: {
  label: string;
  value?: string;
  hash?: boolean;
}) {
  return (
    <div className="grid grid-cols-[76px_1fr] gap-2">
      <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
        {label}
      </dt>
      <dd className="break-all font-mono text-[10px] text-slate-300">
        {hash ? shortHash(value) : (value ?? 'Not created')}
      </dd>
    </div>
  );
}

function EvidenceFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-white/12 bg-white/5 px-3 py-2.5">
      <span className="text-lime-300 [&_svg]:size-4">{icon}</span>
      <span>
        <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
          {label}
        </span>
        <span className="mt-0.5 block font-semibold">{value}</span>
      </span>
    </div>
  );
}
