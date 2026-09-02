'use client';

import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  Check,
  Clock3,
  Copy,
  Eye,
  FileCheck2,
  Fingerprint,
  Info,
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
  SCENARIO_ONE_CAPABILITY_TTL_SECONDS,
  sha256Hex,
  verifyCapabilityBinding,
  type DocumentCapabilityLease,
} from '@/lib/lab/capability-negotiation';
import {
  stateRevisionSnapshotMatches,
  type StateRevisionSnapshot,
} from '@/lib/lab/state-revision';
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
import type { ExperienceMode } from '@/lib/lab/novice-journey';

export interface CapabilityRunPayload {
  proposal: CapabilityProposalRecord;
  contract: CompiledCapabilityContract;
  approvedAt: string;
  claimedAt: string;
  outcome: RunOutcome;
  verification: CapabilityVerification;
  invalidationReason: CapabilityInvalidationReason;
  stateRevision: number;
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
  experienceMode,
  sourceTool,
  sourceState,
  sourceToolSuppressed,
  getCurrentSourceTool,
  getCurrentSourceState,
  getCurrentStateRevision,
  onSuppressSourceTool,
  onRestoreSourceTool,
  onSourceDrift,
  onCreateLocalReceipt,
  onCommitLocalReceipt,
  onExport,
  onOfferPermit,
  onExportPermit,
  onNext,
}: {
  experienceMode: ExperienceMode;
  sourceTool: ToolDeclaration;
  sourceState: Record<string, JsonValue>;
  getCurrentSourceTool: () => ToolDeclaration;
  getCurrentSourceState: () => Record<string, JsonValue>;
  getCurrentStateRevision: () => number;
  sourceToolSuppressed: boolean;
  onSuppressSourceTool: () => true;
  onRestoreSourceTool: () => void;
  onSourceDrift: () => void;
  onCreateLocalReceipt: (
    payload: CapabilityRunPayload,
  ) => Promise<EvidenceReceipt>;
  onCommitLocalReceipt: (
    payload: CapabilityRunPayload,
    receipt: EvidenceReceipt,
  ) => void;
  onExport: (receipt: EvidenceReceipt) => void;
  onOfferPermit: (
    contract: CompiledCapabilityContract,
    approvedAt: string,
    pageUrl: string,
    signal: AbortSignal,
    isCurrent: () => boolean,
  ) => Promise<void>;
  onExportPermit: (
    contract: CompiledCapabilityContract,
    approvedAt: string,
    pageUrl: string,
  ) => Promise<void>;
  onNext?: () => void;
}) {
  const [intent, setIntent] = useState<LockedCapabilityIntent>();
  const [proposal, setProposal] = useState<CapabilityProposalRecord>();
  const proposalRef = useRef<CapabilityProposalRecord | undefined>(undefined);
  const [contract, setContract] = useState<CompiledCapabilityContract>();
  const [proposalRegistration, setProposalRegistration] =
    useState<WebMcpStatus>(initialRegistration);
  const [capabilityStatus, setCapabilityStatus] =
    useState<CapabilityStatus>('idle');
  const [workflowPhase, setWorkflowPhase] = useState<WorkflowPhase>('idle');
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [agentRequestCopyResult, setAgentRequestCopyResult] = useState<{
    request: string;
    status: 'copied' | 'error';
  }>();
  const approvalTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelApprovalRef = useRef<HTMLButtonElement>(null);
  const resetNegotiationRef = useRef<HTMLButtonElement>(null);
  const lessonStageHeadingRef = useRef<HTMLHeadingElement>(null);
  const [lessonAnnouncement, setLessonAnnouncement] = useState('');
  const [message, setMessage] = useState(
    'Start by locking the human intent. Nothing has been invoked.',
  );
  const [receipt, setReceipt] = useState<EvidenceReceipt>();
  const [receiptState, setReceiptState] = useState<
    'idle' | 'local-export-only'
  >('idle');
  const [invalidationReason, setInvalidationReason] = useState<string>();
  const sourceObservationGenerationRef = useRef(0);
  const intentStateRef = useRef<StateRevisionSnapshot | undefined>(undefined);
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
  const [guidedAdvance, setGuidedAdvance] = useState(false);
  const agentRequest =
    experienceMode === 'site-tools'
      ? 'Run the one approved eligibility check for TRAINING-1042 once. Do not invoke another Site Tool and do not retry.'
      : 'Using the LeftOut local relay, run the one protected eligibility check for TRAINING-1042 once. Do not retry.';
  const agentRequestCopyState =
    agentRequestCopyResult?.request === agentRequest
      ? agentRequestCopyResult.status
      : 'idle';

  const transitionPhase = useCallback((phase: WorkflowPhase) => {
    workflowPhaseRef.current = phase;
    setWorkflowPhase(phase);
  }, []);

  useEffect(() => {
    sourceObservationGenerationRef.current += 1;
  }, [sourceTool]);

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
    async (
      input: unknown,
      channel: CapabilityProposalRecord['channel'],
      lockedIntent: LockedCapabilityIntent | undefined = intent,
    ) => {
      if (!lockedIntent || workflowPhaseRef.current !== 'proposal') {
        throw new Error('Lock an intent before proposing a capability.');
      }
      const epoch = operationEpochRef.current;
      const proposalOperation = proposalOperationRef.current + 1;
      proposalOperationRef.current = proposalOperation;
      const sourceSnapshot = structuredClone(getCurrentSourceTool());
      const record = await createProposalRecord({
        input: normalizeInput(input),
        intent: lockedIntent,
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
      proposalRef.current = record;
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
    if (workflowPhaseRef.current !== 'idle') return undefined;
    const currentState = structuredClone(getCurrentSourceState());
    const currentStateRevision = getCurrentStateRevision();
    if (
      currentState.accountId !== 'TRAINING-1042' ||
      currentState.reviewed !== false ||
      currentState.reviewCount !== 0 ||
      currentState.lastReviewedAt !== null
    ) {
      setMessage(
        'Reset the Scenario 1 fixture before locking intent; the approved baseline must start with reviewed=false, reviewCount=0, and lastReviewedAt=null.',
      );
      return undefined;
    }
    transitionPhase('locking');
    const epoch = operationEpochRef.current + 1;
    operationEpochRef.current = epoch;
    const baselineStateHash = await sha256Hex(structuredClone(currentState));
    if (!mountedRef.current || operationEpochRef.current !== epoch) {
      return undefined;
    }
    if (
      !stateRevisionSnapshotMatches({
        expected: { revision: currentStateRevision, state: currentState },
        currentRevision: getCurrentStateRevision(),
        currentState: getCurrentSourceState(),
      })
    ) {
      transitionPhase('idle');
      setMessage(
        'The fixture changed while intent was being locked. Reset it and try again.',
      );
      return undefined;
    }
    const next = createLockedIntent({
      origin: window.location.origin,
      lockedAt: new Date().toISOString(),
      baselineStateHash,
      ttlSeconds: SCENARIO_ONE_CAPABILITY_TTL_SECONDS,
    });
    intentStateRef.current = {
      revision: currentStateRevision,
      state: currentState,
    };
    setIntent(next);
    setProposal(undefined);
    proposalRef.current = undefined;
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
      'Human intent locked: one eligibility read for TRAINING-1042, five-minute TTL, no account mutation, capability-handler fetch, or cross-account access.',
    );
    return next;
  }

  async function prepareContractForReview(
    preparedIntent: LockedCapabilityIntent | undefined = intent,
    preparedProposal: CapabilityProposalRecord | undefined = proposal,
  ) {
    if (
      !preparedIntent ||
      !preparedProposal ||
      workflowPhaseRef.current !== 'proposal'
    ) {
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
    const sourceSnapshot = structuredClone(getCurrentSourceTool());
    const stateSnapshot = structuredClone(getCurrentSourceState());
    const intentStateSnapshot = intentStateRef.current;
    if (
      !intentStateSnapshot ||
      !stateRevisionSnapshotMatches({
        expected: intentStateSnapshot,
        currentRevision: getCurrentStateRevision(),
        currentState: stateSnapshot,
      })
    ) {
      invalidate(
        'state-drift',
        'The synthetic account changed before contract review. Nothing was withdrawn or invoked.',
      );
      return;
    }
    const [currentHash, currentStateHash] = await Promise.all([
      fingerprintSource({
        tool: sourceSnapshot,
        handlerVersion: preparedProposal.source.handlerVersion,
        origin: window.location.origin,
      }),
      sha256Hex(stateSnapshot),
    ]);
    if (!mountedRef.current || operationEpochRef.current !== epoch) return;
    if (
      sourceObservationGenerationRef.current !== sourceGeneration ||
      canonicalJson(getCurrentSourceTool()) !== canonicalJson(sourceSnapshot) ||
      currentHash !== preparedProposal.source.sourceDeclarationHash
    ) {
      invalidate(
        'source-drift',
        'The source changed before contract review. Nothing was withdrawn or invoked.',
      );
      return;
    }
    if (
      !stateRevisionSnapshotMatches({
        expected: intentStateSnapshot,
        currentRevision: getCurrentStateRevision(),
        currentState: getCurrentSourceState(),
      }) ||
      currentStateHash !== preparedIntent.baseline.stateHash
    ) {
      invalidate(
        'state-drift',
        'The synthetic account changed before contract review. Nothing was withdrawn or invoked.',
      );
      return;
    }

    const compiled = await compileCapabilityContract({
      intent: preparedIntent,
      proposal: preparedProposal,
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
      !stateRevisionSnapshotMatches({
        expected: intentStateSnapshot,
        currentRevision: getCurrentStateRevision(),
        currentState: getCurrentSourceState(),
      })
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

  async function prepareGuidedApproval() {
    if (workflowPhaseRef.current !== 'idle') return;
    setGuidedAdvance(true);
    try {
      const lockedIntent = await lockIntent();
      if (!lockedIntent) return;
      await stageProposal(
        createProposalInput(lockedIntent),
        'fallback-harness',
        lockedIntent,
      );
      const preparedProposal = proposalRef.current;
      if (!preparedProposal) {
        throw new Error('The exact proposal could not be prepared.');
      }
      await prepareContractForReview(lockedIntent, preparedProposal);
    } catch (error) {
      setMessage(
        `The lesson stopped safely before approval: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setGuidedAdvance(false);
    }
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
    const sourceSnapshot = structuredClone(getCurrentSourceTool());
    const stateSnapshot = structuredClone(getCurrentSourceState());
    const intentStateSnapshot = intentStateRef.current;
    if (
      !intentStateSnapshot ||
      !stateRevisionSnapshotMatches({
        expected: intentStateSnapshot,
        currentRevision: getCurrentStateRevision(),
        currentState: stateSnapshot,
      })
    ) {
      invalidate(
        'state-drift',
        'The synthetic account changed after review. The approval event was recorded, but nothing was withdrawn, registered, or invoked.',
      );
      return;
    }
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
      !stateRevisionSnapshotMatches({
        expected: intentStateSnapshot,
        currentRevision: getCurrentStateRevision(),
        currentState: getCurrentSourceState(),
      }) ||
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
            const invocationSourceSnapshot = structuredClone(
              getCurrentSourceTool(),
            );
            const invocationStateSnapshot = structuredClone(
              getCurrentSourceState(),
            );
            const invocationStateRevision = getCurrentStateRevision();
            const approvedStateSnapshot = intentStateRef.current;
            if (
              !approvedStateSnapshot ||
              !stateRevisionSnapshotMatches({
                expected: approvedStateSnapshot,
                currentRevision: invocationStateRevision,
                currentState: invocationStateSnapshot,
              })
            ) {
              invalidate(
                'state-drift',
                'Invocation rejected: the synthetic account changed after approval.',
              );
              throw new Error('Capability invalidated: state-drift.');
            }
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
              !stateRevisionSnapshotMatches({
                expected: approvedStateSnapshot,
                currentRevision: getCurrentStateRevision(),
                currentState: getCurrentSourceState(),
              })
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
              !stateRevisionSnapshotMatches({
                expected: approvedStateSnapshot,
                currentRevision: getCurrentStateRevision(),
                currentState: getCurrentSourceState(),
              })
            ) {
              invalidate(
                'state-drift',
                'Invocation rejected: the synthetic account changed during result verification.',
              );
              throw new Error('Capability invalidated: state-drift.');
            }
            const resultInvalidationReason: CapabilityInvalidationReason =
              verification.passed ? 'consumed' : 'state-drift';
            const payload: CapabilityRunPayload = {
              proposal,
              contract,
              approvedAt,
              claimedAt,
              outcome,
              verification,
              invalidationReason: resultInvalidationReason,
              stateRevision: invocationStateRevision,
            };
            let recorded: EvidenceReceipt;
            try {
              recorded = await onCreateLocalReceipt(payload);
            } catch (error) {
              invalidate(
                'handler-drift',
                `Local evidence integrity validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              );
              throw error;
            }
            if (
              !mountedRef.current ||
              operationEpochRef.current !== epoch ||
              !stateRevisionSnapshotMatches({
                expected: approvedStateSnapshot,
                currentRevision: getCurrentStateRevision(),
                currentState: getCurrentSourceState(),
              })
            ) {
              throw new Error(
                'Capability invocation was revoked during receipt validation.',
              );
            }
            onCommitLocalReceipt(payload, recorded);
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
    const handoffIsCurrent = () =>
      mountedRef.current &&
      operationEpochRef.current === epoch &&
      capabilityActiveRef.current &&
      capabilityGenerationRef.current === capabilityGeneration &&
      leaseRef.current === lease &&
      lease.state() === 'active';
    try {
      await onOfferPermit(
        contract,
        approvedAt,
        window.location.href,
        controller.signal,
        handoffIsCurrent,
      );
      if (!handoffIsCurrent()) return;
      setMessage(
        'The exact capability is registered and its narrowing rule was offered to the connected browser guard. Nothing has run. Check the browser-owned HUD for authoritative protection status.',
      );
    } catch {
      if (!handoffIsCurrent()) return;
      setMessage(
        'The exact capability is registered, but its browser-guard handoff could not be prepared. Nothing has run. The local practice check remains available; advanced recovery can export the rule manually.',
      );
    }
  }

  async function runCapabilitySelfTest() {
    if (!contract || capabilityStatus !== 'registered') return;
    const epoch = operationEpochRef.current;
    const capabilityGeneration = capabilityGenerationRef.current;
    const modelContext = getModelContext();
    if (!modelContext?.getTools || !modelContext.executeTool) {
      setMessage(
        'This browser can register the approved action but cannot invoke its own page action. Nothing ran. Leave this page open and ask the connected agent to run the one guarded action once with no retry.',
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
    setGuidedAdvance(false);
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
    intentStateRef.current = undefined;
    setProposal(undefined);
    proposalRef.current = undefined;
    setContract(undefined);
    setReceipt(undefined);
    setReceiptState('idle');
    setApprovalEventAt(undefined);
    setAgentRequestCopyResult(undefined);
    setProposalRegistration(initialRegistration);
    setCapabilityStatus('idle');
    operationEpochRef.current += 1;
    transitionPhase('idle');
    setInvalidationReason(undefined);
    setMessage(
      'Negotiation reset. The broad source fixture is registered again.',
    );
    setLessonAnnouncement(
      'Lesson reset. Review a fresh exact action before approving it.',
    );
    onRestoreSourceTool();
    window.requestAnimationFrame(() => lessonStageHeadingRef.current?.focus());
  }

  async function copyAgentRequest() {
    try {
      await navigator.clipboard.writeText(agentRequest);
      setAgentRequestCopyResult({ request: agentRequest, status: 'copied' });
    } catch {
      setAgentRequestCopyResult({ request: agentRequest, status: 'error' });
    }
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
  const lessonStep = receipt
    ? 4
    : capabilityStatus === 'registered'
      ? 3
      : contract || workflowPhase === 'registering'
        ? 2
        : 1;
  const lessonBusy =
    guidedAdvance ||
    ['locking', 'preparing', 'registering'].includes(workflowPhase);
  const lessonStopped = workflowPhase === 'closed' && !receipt;
  const stateStayedIdentical = receipt
    ? canonicalJson(receipt.effective.before) ===
      canonicalJson(receipt.effective.after)
    : false;
  const lessonSteps = [
    ['1', 'Understand'],
    ['2', 'Approve'],
    ['3', 'Ask agent'],
    ['4', 'Verify'],
  ] as const;
  const expiryLabel = contract
    ? new Date(contract.compiled.expiresAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Five minutes after preparation';

  return (
    <section
      id="lesson"
      className="scroll-mt-20 border-t border-foreground bg-slate-950 px-5 py-8 text-slate-100 lg:px-8"
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-lime-300/30 bg-lime-300/10 text-lime-200">
            Lesson 1 of 5
          </Badge>
          <Badge variant="outline" className="border-white/20 text-slate-200">
            Practice only
          </Badge>
          <Badge variant="outline" className="border-white/20 text-slate-200">
            Fake account
          </Badge>
          <Badge variant="outline" className="border-white/20 text-slate-200">
            Nothing runs without approval
          </Badge>
        </div>

        <div className="mt-5 max-w-3xl">
          <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-lime-300">
            <BookOpenCheck className="size-4" />
            Learn by doing · about five minutes
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Try one safe WebMCP action
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-300">
            WebMCP lets a website offer actions to an AI. You will inspect one
            offer, limit it to an exact task, approve it, run it once, and
            verify what actually happened.
          </p>
        </div>

        <ol
          className="mt-6 grid gap-2 sm:grid-cols-4"
          aria-label="Lesson progress"
        >
          {lessonSteps.map(([number, label], index) => {
            const stepNumber = index + 1;
            const complete = lessonStep > stepNumber;
            const current = lessonStep === stepNumber;
            return (
              <li
                key={label}
                aria-current={current ? 'step' : undefined}
                className={
                  current
                    ? 'rounded-lg border border-lime-300/60 bg-lime-300/10 p-3'
                    : complete
                      ? 'rounded-lg border border-lime-300/25 bg-lime-300/5 p-3'
                      : 'rounded-lg border border-white/10 bg-white/5 p-3'
                }
              >
                <div className="flex items-center gap-2">
                  <span
                    className={
                      complete || current
                        ? 'flex size-6 items-center justify-center rounded-full bg-lime-300 text-xs font-bold text-slate-950'
                        : 'flex size-6 items-center justify-center rounded-full bg-white/10 text-xs text-slate-400'
                    }
                  >
                    {complete ? <Check className="size-3.5" /> : number}
                  </span>
                  <span className="text-sm font-semibold">{label}</span>
                </div>
              </li>
            );
          })}
        </ol>
        {lessonAnnouncement ? (
          <output aria-live="polite" className="sr-only">
            {lessonAnnouncement}
          </output>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-xl border border-white/15 bg-white/[0.06]">
          {lessonStopped ? (
            <div className="p-5 sm:p-7">
              <div className="flex items-start gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-300/15 text-amber-200">
                  <AlertTriangle className="size-5" />
                </div>
                <div className="max-w-2xl">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                    Stopped safely
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold">Nothing ran.</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    The permission expired or could not be verified, so the
                    Membrane closed it. The practice account was not changed and
                    the lesson did not retry.
                  </p>
                  <Button
                    className="mt-5 bg-lime-300 text-slate-950 hover:bg-lime-200"
                    onClick={resetNegotiation}
                  >
                    <RefreshCw data-icon="inline-start" />
                    Start with a fresh permission
                  </Button>
                </div>
              </div>
            </div>
          ) : lessonStep === 1 ? (
            <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="p-5 sm:p-7">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-lime-300">
                  First: understand the offer
                </p>
                <h3
                  ref={lessonStageHeadingRef}
                  tabIndex={-1}
                  className="mt-2 text-2xl font-semibold"
                >
                  The page offers your AI a read action.
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  An offered action is not permission and is not proof of
                  safety. Its name may sound harmless while its inputs or code
                  grant more authority than you expect.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <LessonFact
                    icon={<Eye />}
                    label="Page offers"
                    value="Check eligibility"
                  />
                  <LessonFact
                    icon={<LockKeyhole />}
                    label="You limit"
                    value="One fake account"
                  />
                  <LessonFact
                    icon={<ShieldCheck />}
                    label="Receipt proves"
                    value="What changed"
                  />
                </div>
              </div>
              <div className="border-t border-white/10 bg-slate-900/70 p-5 sm:p-7 lg:border-l lg:border-t-0">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Your practice task
                </p>
                <p className="mt-3 text-lg font-semibold">
                  Is TRAINING-1042 eligible?
                </p>
                <ul className="mt-4 space-y-2 text-sm text-slate-300">
                  <li className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-lime-300" />
                    Read eligibility once
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-lime-300" />
                    Do not change the account
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-lime-300" />
                    Do not retry automatically
                  </li>
                </ul>
                <Button
                  size="lg"
                  className="mt-6 h-auto min-h-11 w-full whitespace-normal bg-lime-300 px-4 py-3 text-slate-950 hover:bg-lime-200"
                  onClick={() => void prepareGuidedApproval()}
                  disabled={lessonBusy}
                >
                  <ShieldCheck data-icon="inline-start" />
                  {lessonBusy
                    ? 'Preparing a safe review…'
                    : 'Prepare one-task approval'}
                  {!lessonBusy ? <ArrowRight data-icon="inline-end" /> : null}
                </Button>
                <p className="mt-3 text-center text-xs leading-5 text-slate-400">
                  This inspects and limits the action. It does not run it.
                </p>
              </div>
            </div>
          ) : lessonStep === 2 ? (
            <div className="p-5 sm:p-7">
              <div className="flex items-start gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lime-300/15 text-lime-200">
                  <ShieldCheck className="size-5" />
                </div>
                <div className="max-w-2xl">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-lime-300">
                    Review before anything runs
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold">
                    Ready for your decision.
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    The general site action has been narrowed to one read of
                    TRAINING-1042. The AI cannot choose another account, add
                    instructions, or use the permission twice.
                  </p>
                  {experienceMode === 'read-only' ? (
                    <div className="mt-5 rounded-lg border border-sky-300/25 bg-sky-300/8 p-4 text-sm leading-6 text-sky-100">
                      <p className="font-semibold">
                        Read-only inspection complete
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-300">
                        This path stops before approval or registration of a
                        generated one-use capability. Choose a detected live
                        setup above when you want an agent to run the protected
                        practice action.
                      </p>
                      <a
                        href="#setup"
                        className="mt-3 inline-flex min-h-10 items-center rounded-md border border-sky-300/30 px-3 text-xs font-semibold text-sky-100"
                      >
                        Review setup choices
                      </a>
                    </div>
                  ) : (
                    <>
                      <Button
                        ref={approvalTriggerRef}
                        className="mt-5 bg-lime-300 text-slate-950 hover:bg-lime-200"
                        aria-haspopup="dialog"
                        aria-expanded={approvalOpen}
                        onClick={() => setApprovalOpen(true)}
                        disabled={workflowPhase !== 'review'}
                      >
                        <ShieldCheck data-icon="inline-start" />
                        Review the exact approval
                      </Button>
                      <p className="mt-3 text-xs text-slate-400">
                        Approval creates a five-minute, one-use permission. It
                        does not run the check.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : lessonStep === 3 ? (
            <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="p-5 sm:p-7">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-lime-300">
                  Approved and ready
                </p>
                <h3 className="mt-2 text-2xl font-semibold">
                  The check has not run yet.
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Your approval created a zero-input capability for this page,
                  this exact synthetic account, and one use. The broader site
                  action has been withdrawn while it is active.
                </p>
                <p className="mt-3 text-xs leading-5 text-slate-400">
                  {experienceMode === 'site-tools'
                    ? 'The action is registered on this page for the agent in the same built-in browser. Page registration does not by itself prove that the client discovered it.'
                    : experienceMode === 'local-guard'
                      ? 'If the Local Guard is connected, the page offered it the exact narrowing rule. Its browser-owned status is authoritative only for calls routed through that local path.'
                      : 'This read-only path does not claim that any client discovered or invoked the action.'}
                </p>
                <div className="mt-5 rounded-lg border border-lime-300/20 bg-lime-300/5 p-4 text-sm text-slate-200">
                  <strong className="text-white">What this run means:</strong>{' '}
                  {experienceMode === 'site-tools'
                    ? 'the agent in this built-in browser invokes the registered Site Tool directly.'
                    : experienceMode === 'local-guard'
                      ? 'the connected local agent invokes the registered action through the Local Guard and relay.'
                      : 'no agent-driven invocation is claimed until you choose a live setup.'}{' '}
                  The capability consumes its authority before the handler
                  executes.
                </div>
              </div>
              <div className="border-t border-white/10 bg-slate-900/70 p-5 sm:p-7 lg:border-l lg:border-t-0">
                <p className="text-sm font-semibold">
                  {experienceMode === 'read-only'
                    ? 'The protected action is prepared, not run'
                    : 'Hand one action to your agent'}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Expected: Eligible. Before and after state must be identical.
                </p>
                <div className="mt-5 rounded-lg border border-sky-300/25 bg-sky-300/8 p-4">
                  <p className="text-sm font-semibold text-sky-100">
                    {experienceMode === 'site-tools'
                      ? 'Your agent in this built-in browser runs this step'
                      : experienceMode === 'local-guard'
                        ? 'Your connected local agent runs this step'
                        : 'No invocation on the read-only path'}
                  </p>
                  <ol className="mt-3 space-y-2 text-xs leading-5 text-slate-300">
                    {experienceMode === 'site-tools' ? (
                      <>
                        <li>
                          1. Keep this page open in ChatGPT or Codex&apos;s
                          built-in browser.
                        </li>
                        <li>
                          2. Continue in the same compatible session detected
                          above; that one observation is not proof of universal
                          support.
                        </li>
                        <li>
                          3. Send this exact request to the same agent: “
                          {agentRequest}”
                        </li>
                      </>
                    ) : experienceMode === 'local-guard' ? (
                      <>
                        <li>1. Leave this lesson open.</li>
                        <li>
                          2. In LeftOut Local Guard, confirm “Protected: 1 exact
                          action.”
                        </li>
                        <li>
                          3. Send this exact request to your connected local
                          agent: “{agentRequest}”
                        </li>
                      </>
                    ) : (
                      <>
                        <li>1. Do not ask an agent to invoke the action.</li>
                        <li>
                          2. Review the exact target, lifetime, and prohibited
                          effects below.
                        </li>
                        <li>
                          3. Choose a live setup above when you want to complete
                          the run.
                        </li>
                      </>
                    )}
                  </ol>
                  {experienceMode !== 'read-only' ? (
                    <>
                      <Button
                        variant="outline"
                        className="mt-4 min-h-11 w-full border-sky-300/30 bg-sky-300/8 text-sky-100 hover:bg-sky-300/15 hover:text-white"
                        onClick={() => void copyAgentRequest()}
                      >
                        {agentRequestCopyState === 'copied' ? (
                          <Check data-icon="inline-start" />
                        ) : (
                          <Copy data-icon="inline-start" />
                        )}
                        {agentRequestCopyState === 'copied'
                          ? 'Request copied'
                          : 'Copy request for my agent'}
                      </Button>
                      {agentRequestCopyState !== 'idle' ? (
                        <output
                          aria-live="polite"
                          className="mt-2 block text-xs leading-5 text-sky-100"
                        >
                          {agentRequestCopyState === 'copied'
                            ? experienceMode === 'site-tools'
                              ? 'Copied — return to this browser’s chat and send it.'
                              : 'Copied — paste it into your connected local agent.'
                            : 'Copy was blocked — select the exact request above and paste it into your agent.'}
                        </output>
                      ) : null}
                    </>
                  ) : null}
                  <p className="mt-3 text-xs leading-5 text-sky-100">
                    The receipt will appear here automatically. The page has not
                    run anything itself.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 sm:p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4">
                  <div
                    className={
                      receipt?.verdict === 'PASS'
                        ? 'flex size-11 shrink-0 items-center justify-center rounded-full bg-lime-300 text-slate-950'
                        : 'flex size-11 shrink-0 items-center justify-center rounded-full bg-red-300 text-slate-950'
                    }
                  >
                    {receipt?.verdict === 'PASS' ? (
                      <Check className="size-6" />
                    ) : (
                      <AlertTriangle className="size-6" />
                    )}
                  </div>
                  <div className="max-w-2xl">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-lime-300">
                      Evidence receipt
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold">
                      {receipt?.verdict} — the action{' '}
                      {receipt?.verdict === 'PASS'
                        ? 'matched'
                        : 'did not match'}{' '}
                      your approval
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      A receipt compares the task you approved with the result
                      and observable effects. This synthetic run is evidence for
                      this one action, not proof that every WebMCP tool is safe.
                    </p>
                  </div>
                </div>
                {receipt ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => onExport(receipt)}
                    >
                      <FileCheck2 data-icon="inline-start" />
                      Save receipt
                    </Button>
                    {onNext ? (
                      <Button onClick={onNext}>
                        Continue to Lesson 2
                        <ArrowRight data-icon="inline-end" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ReceiptFact label="Approved" value="Read TRAINING-1042 once" />
                <ReceiptFact
                  label="Returned"
                  value={
                    receipt?.verdict === 'PASS'
                      ? 'Eligible'
                      : 'Unexpected result'
                  }
                />
                <ReceiptFact
                  label="Before and after"
                  value={stateStayedIdentical ? 'Identical' : 'Different'}
                  good={stateStayedIdentical}
                />
                <ReceiptFact
                  label="Side effects"
                  value={
                    receipt?.effective.sideEffects.length
                      ? receipt.effective.sideEffects.join(', ')
                      : 'None detected'
                  }
                  good={!receipt?.effective.sideEffects.length}
                />
                <ReceiptFact label="One-use permission" value="Closed" />
                <ReceiptFact
                  label="Receipt ID"
                  value={receipt?.id ?? 'Unavailable'}
                />
              </div>
            </div>
          )}
        </div>

        <details className="mt-4 rounded-lg border border-white/12 bg-white/5">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-lime-300">
            <span className="flex items-center gap-2">
              <Info className="size-4 text-lime-300" />
              How the Membrane limits this action
            </span>
          </summary>
          <div className="grid gap-3 border-t border-white/10 p-4 text-xs leading-5 text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
            <p>
              <strong className="block text-white">Exact target</strong>Bound to
              TRAINING-1042.
            </p>
            <p>
              <strong className="block text-white">No late inputs</strong>The
              capability accepts zero fields.
            </p>
            <p>
              <strong className="block text-white">One use</strong>Authority
              closes before execution.
            </p>
            <p>
              <strong className="block text-white">Fail closed</strong>Drift,
              expiry, or mismatch stops the run.
            </p>
          </div>
        </details>
      </div>

      <details className="mx-auto mt-6 max-w-5xl rounded-xl border border-white/12 bg-black/20">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-lime-300">
          Advanced security tests and protocol evidence
          <span className="mt-1 block text-xs font-normal text-slate-400">
            Schemas, hashes, source drift, connector permits, and manual
            controls
          </span>
        </summary>
        <div className="border-t border-white/10 p-5">
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
                The proposal cannot execute the source handler. Approval
                withdraws the broad tool before registering a uniquely named,
                no-input, one-use capability bound to this origin, source
                fingerprint, and versioned pure handler.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className="border-white/20 text-slate-200"
              >
                {sourceToolSuppressed
                  ? 'Source withdrawn'
                  : 'Source registered'}
              </Badge>
              <Badge
                variant="outline"
                className="border-white/20 text-slate-200"
              >
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
                <li>TTL: 5 minutes</li>
                <li>
                  Prohibited: account mutation, handler fetch, cross-account
                  access
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
                ref={approvalTriggerRef}
                className="mt-4 h-auto min-h-10 w-full border border-lime-200/70 bg-lime-300 px-4 py-2.5 text-slate-950 shadow-sm hover:bg-lime-200 focus-visible:ring-lime-300/60"
                aria-haspopup="dialog"
                aria-expanded={approvalOpen}
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
                  ? 'Review and approve exact capability'
                  : 'Prepare exact approval'}
              </Button>
            </NegotiationCard>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-white/12 bg-white/5 p-4 lg:flex-row lg:items-center lg:justify-between">
            <output
              aria-live="polite"
              className="text-xs leading-5 text-slate-300"
            >
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
                variant="secondary"
                onClick={() =>
                  contract &&
                  approvalEventAt &&
                  void onExportPermit(
                    contract,
                    approvalEventAt,
                    window.location.href,
                  ).catch(() =>
                    setMessage(
                      'The extension permit could not be exported. The capability remains registered but no bridge authority was created.',
                    ),
                  )
                }
                disabled={
                  capabilityStatus !== 'registered' ||
                  !contract ||
                  !approvalEventAt
                }
              >
                <FileCheck2 data-icon="inline-start" />
                Export extension permit
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
                ref={resetNegotiationRef}
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
                    {receipt.capability?.protocol ===
                      'webmcp-capability-negotiation/1' &&
                    receipt.capability.verification.baselineStateMatched
                      ? 'Locked baseline and required result matched.'
                      : 'The locked baseline did not match at invocation.'}{' '}
                    Controlled handler checks found{' '}
                    {receipt.capability?.protocol ===
                    'webmcp-capability-negotiation/1'
                      ? receipt.capability.verification
                          .controlledHandlerViolations.length
                      : 0}{' '}
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
        </div>
      </details>

      <AlertDialog open={approvalOpen} onOpenChange={setApprovalOpen}>
        <AlertDialogContent
          size="wide"
          initialFocus={cancelApprovalRef}
          finalFocus={() => {
            const trigger = approvalTriggerRef.current;
            return trigger && !trigger.disabled
              ? trigger
              : resetNegotiationRef.current;
          }}
          className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0"
        >
          <AlertDialogHeader className="border-b border-border px-5 py-4 sm:px-6">
            <AlertDialogMedia className="bg-amber-100 text-amber-900">
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>Approve one read-only check?</AlertDialogTitle>
            <AlertDialogDescription className="max-w-none text-left leading-6 [overflow-wrap:anywhere]">
              Review exactly what will happen before deciding. Approving creates
              a one-use permission; it does not run the check.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {proposal ? (
            <div className="px-5 py-4 sm:px-6">
              <div className="grid gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm sm:grid-cols-2">
                <ApprovalFact
                  label="Target"
                  value={contract?.intent.accountId ?? 'Not created'}
                />
                <ApprovalFact label="Allowed" value="Read eligibility once" />
                <ApprovalFact
                  label="Not allowed"
                  value="Change data, access another account, or run twice"
                />
                <ApprovalFact
                  label="Inputs"
                  value="None — the target cannot be changed later"
                />
                <ApprovalFact
                  label="Use limit"
                  value="One attempt; no automatic retry"
                />
                <ApprovalFact label="Expires" value={expiryLabel} />
              </div>
              <p className="mt-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm font-medium leading-5 text-amber-950">
                Approval registers this capability. It does not invoke it.
              </p>
              <details className="mt-4 overflow-hidden rounded-lg border border-border">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                  Technical contract and hashes
                </summary>
                <div className="space-y-2 border-t border-border bg-muted/50 p-4 font-mono text-[10px] leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                  <p className="font-sans text-xs leading-5 text-foreground">
                    The local package can detect accidental changes with its
                    self-hash. It is not a digital signature or independent
                    proof that a person approved it.
                  </p>
                  <p>approval_copy: {approvalCopy}</p>
                  <p>contract_sha256: {contract?.contractHash}</p>
                  <p>proposal_sha256: {contract?.proposalHash}</p>
                  <p>capability_id: {contract?.capabilityId}</p>
                  <p>approval_nonce: {contract?.approval.nonce}</p>
                  <p>origin: {contract?.source.origin}</p>
                  <p>
                    source_declaration_sha256:{' '}
                    {contract?.source.sourceDeclarationHash}
                  </p>
                  <p>
                    source_handler_version: {contract?.source.handlerVersion}
                  </p>
                  <p>
                    capability_handler_version:{' '}
                    {contract?.compiled.handlerVersion}
                  </p>
                  <p>generated_tool: {contract?.compiled.toolName}</p>
                  <p>expires_at: {contract?.compiled.expiresAt}</p>
                  <p>
                    required_result:{' '}
                    {JSON.stringify(contract?.intent.requiredResult)}
                  </p>
                  <p>
                    approved_baseline:{' '}
                    {JSON.stringify(contract?.intent.baseline)}
                  </p>
                  <p>
                    required_postcondition:{' '}
                    {contract?.intent.expectedPostcondition}
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
                    <summary className="cursor-pointer font-sans text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
              </details>
            </div>
          ) : null}
          <AlertDialogFooter className="mx-0 mb-0 shrink-0 rounded-b-xl px-5 py-4 sm:flex-wrap sm:px-6">
            <AlertDialogCancel
              ref={cancelApprovalRef}
              className="min-h-11 w-full sm:w-auto"
            >
              Not now
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-auto min-h-11 w-full whitespace-normal px-4 py-2.5 text-center sm:w-auto"
              onClick={() => void approveAndRegister()}
            >
              Approve one read-only check
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function LessonFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <span className="text-lime-300 [&_svg]:size-4">{icon}</span>
      <p className="mt-3 text-xs font-semibold text-white">{label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{value}</p>
    </div>
  );
}

function ReceiptFact({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-semibold text-white [overflow-wrap:anywhere]">
        {good ? <Check className="mr-1.5 inline size-4 text-lime-300" /> : null}
        {value}
      </p>
    </div>
  );
}

function ApprovalFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-medium text-foreground [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
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
