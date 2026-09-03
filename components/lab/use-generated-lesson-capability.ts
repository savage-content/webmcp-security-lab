'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  canonicalJson,
  createOneUseLease,
  prepareOneUseActivation,
  sha256Hex,
} from '@/lib/capability-core';
import {
  LESSON_CAPABILITY_TTL_SECONDS,
  compileLessonCapabilityContract,
  createLessonBoundArguments,
  createLessonIntent,
  createLessonProposalRecord,
  executeLessonCapability,
  validateLessonCapabilityBinding,
} from '@/lib/lab/lesson-capabilities';
import {
  stateRevisionSnapshotMatches,
  type StateRevisionSnapshot,
} from '@/lib/lab/state-revision';
import type {
  CapabilityInvalidationReason,
  CompiledLessonCapabilityContract,
  EvidenceReceipt,
  JsonValue,
  LessonCapabilityProposalRecord,
  LessonCapabilityScenarioId,
  LessonCapabilityVerification,
  RunOutcome,
  ScenarioDefinition,
  ToolDeclaration,
  WebMcpStatus,
} from '@/lib/lab/types';
import {
  createLessonCapabilityToolResult,
  decideRegistrationSettlement,
  getModelContext,
  observeToolsPermission,
  registerPageTool,
  withOneUseRegistrationRetirement,
} from '@/lib/lab/webmcp';

export type GeneratedLessonCapabilityStatus =
  | 'idle'
  | 'preparing'
  | 'review'
  | 'registering'
  | 'ready'
  | 'claimed'
  | 'verified'
  | 'failed'
  | 'closed'
  | 'error';

export interface LessonCapabilityRunPayload {
  proposal: LessonCapabilityProposalRecord;
  contract: CompiledLessonCapabilityContract;
  approvedAt: string;
  claimedAt: string;
  outcome: RunOutcome;
  verification: LessonCapabilityVerification;
  invalidationReason: CapabilityInvalidationReason;
  webMcp: WebMcpStatus;
  stateRevision: number;
}

function normalizeEmptyInput(input: unknown) {
  const value = typeof input === 'string' ? JSON.parse(input) : input;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value as Record<string, unknown>).length !== 0
  ) {
    throw new Error('This approved capability accepts no inputs.');
  }
}

export function useGeneratedLessonCapability({
  scenario,
  sourceTool,
  getCurrentSourceState,
  getCurrentStateRevision,
  clientLabel,
  webMcp,
  onSuppressSourceTool,
  onRestoreSourceTool,
  onCreateReceipt,
  onCommitReceipt,
}: {
  scenario: ScenarioDefinition & { id: LessonCapabilityScenarioId };
  sourceTool: ToolDeclaration;
  getCurrentSourceState: () => Record<string, JsonValue>;
  getCurrentStateRevision: () => number;
  clientLabel: string;
  webMcp: WebMcpStatus;
  onSuppressSourceTool: () => true;
  onRestoreSourceTool: () => void;
  onCreateReceipt: (
    payload: LessonCapabilityRunPayload,
  ) => Promise<EvidenceReceipt>;
  onCommitReceipt: (
    payload: LessonCapabilityRunPayload,
    receipt: EvidenceReceipt,
  ) => void;
}) {
  const [status, setStatus] = useState<GeneratedLessonCapabilityStatus>('idle');
  const [message, setMessage] = useState(
    'Inspect the lesson, then freeze one exact practice action for review.',
  );
  const [proposal, setProposal] = useState<LessonCapabilityProposalRecord>();
  const [contract, setContract] = useState<CompiledLessonCapabilityContract>();
  const [approvedAt, setApprovedAt] = useState<string>();
  const [receipt, setReceipt] = useState<EvidenceReceipt>();
  const [registration, setRegistration] = useState<WebMcpStatus>();

  const sourceToolRef = useRef(sourceTool);
  const webMcpRef = useRef(webMcp);
  const mountedRef = useRef(true);
  const epochRef = useRef(0);
  const activeRef = useRef(false);
  const sourceWithdrawnRef = useRef(false);
  const contractStateRef = useRef<StateRevisionSnapshot | undefined>(undefined);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const leaseRef = useRef<ReturnType<typeof createOneUseLease> | undefined>(
    undefined,
  );
  const expiryTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    sourceToolRef.current = sourceTool;
  }, [sourceTool]);

  useEffect(() => {
    webMcpRef.current = webMcp;
  }, [webMcp]);

  const closeRegistration = useCallback(
    (nextStatus: GeneratedLessonCapabilityStatus, detail: string) => {
      epochRef.current += 1;
      activeRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = undefined;
      leaseRef.current?.invalidate(
        detail.includes('expired') ? 'expired' : 'revoked',
      );
      leaseRef.current = undefined;
      if (expiryTimerRef.current !== undefined) {
        window.clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = undefined;
      }
      setStatus(nextStatus);
      setMessage(detail);
    },
    [],
  );

  const freezeFreshContract = useCallback(async () => {
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    setStatus('preparing');
    setMessage('Freezing the exact task, source, state, and effect boundary.');
    setReceipt(undefined);
    setApprovedAt(undefined);

    try {
      const stateSnapshot = structuredClone(getCurrentSourceState());
      const stateRevision = getCurrentStateRevision();
      const toolSnapshot = structuredClone(sourceToolRef.current);
      const lockedAt = new Date().toISOString();
      const baselineStateHash = await sha256Hex(stateSnapshot);
      const intent = createLessonIntent({
        scenarioId: scenario.id,
        boundArguments: createLessonBoundArguments(scenario.id, clientLabel),
        origin: window.location.origin,
        baselineStateHash,
        lockedAt,
        ttlSeconds: LESSON_CAPABILITY_TTL_SECONDS,
      });
      const nextProposal = await createLessonProposalRecord({
        intent,
        sourceTool: toolSnapshot,
        proposedAt: new Date().toISOString(),
      });
      const nextContract = await compileLessonCapabilityContract({
        intent,
        proposal: nextProposal,
        preparedAt: new Date().toISOString(),
      });
      if (
        !mountedRef.current ||
        epochRef.current !== epoch ||
        !stateRevisionSnapshotMatches({
          expected: { revision: stateRevision, state: stateSnapshot },
          currentRevision: getCurrentStateRevision(),
          currentState: getCurrentSourceState(),
        }) ||
        canonicalJson(sourceToolRef.current) !== canonicalJson(toolSnapshot)
      ) {
        throw new Error(
          'The lesson changed while its exact contract was freezing.',
        );
      }
      setProposal(nextProposal);
      setContract(nextContract);
      contractStateRef.current = {
        revision: stateRevision,
        state: stateSnapshot,
      };
      setStatus('review');
      setMessage(
        'The exact one-use contract is frozen. Review it before any authority changes.',
      );
      return nextContract;
    } catch (error) {
      if (mountedRef.current && epochRef.current === epoch) {
        setStatus('error');
        setMessage(
          `The lesson stopped safely before approval: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
      return undefined;
    }
  }, [
    clientLabel,
    getCurrentSourceState,
    getCurrentStateRevision,
    scenario.id,
  ]);

  const prepare = useCallback(async () => {
    if (!['idle', 'error', 'closed'].includes(status)) return undefined;
    return freezeFreshContract();
  }, [freezeFreshContract, status]);

  const prepareFresh = useCallback(async () => {
    if (!['review', 'closed', 'error'].includes(status)) return undefined;
    closeRegistration(
      'idle',
      'The previous review is closed. Creating a fresh exact action now.',
    );
    sourceWithdrawnRef.current = false;
    onRestoreSourceTool();
    setProposal(undefined);
    setContract(undefined);
    setApprovedAt(undefined);
    setReceipt(undefined);
    setRegistration(undefined);
    contractStateRef.current = undefined;
    return freezeFreshContract();
  }, [closeRegistration, freezeFreshContract, onRestoreSourceTool, status]);

  const registerApprovedCapability = useCallback(async () => {
    if (!proposal || !contract || status !== 'review') return;
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    const approvalTime = new Date().toISOString();
    setApprovedAt(approvalTime);
    setStatus('registering');
    setMessage(
      'Approval recorded. Rechecking the frozen state before replacing the broad tool.',
    );

    if (
      !contractStateRef.current ||
      !stateRevisionSnapshotMatches({
        expected: contractStateRef.current,
        currentRevision: getCurrentStateRevision(),
        currentState: getCurrentSourceState(),
      })
    ) {
      closeRegistration(
        'closed',
        'The frozen contract closed safely because the synthetic state changed before approval. Nothing ran.',
      );
      return;
    }

    const activationSourceSnapshot = structuredClone(sourceToolRef.current);
    const beforeActivation = await validateLessonCapabilityBinding({
      contract,
      sourceTool: activationSourceSnapshot,
      state: structuredClone(getCurrentSourceState()),
      origin: window.location.origin,
      now: approvalTime,
    });
    if (!mountedRef.current || epochRef.current !== epoch) return;
    if (
      !contractStateRef.current ||
      !stateRevisionSnapshotMatches({
        expected: contractStateRef.current,
        currentRevision: getCurrentStateRevision(),
        currentState: getCurrentSourceState(),
      }) ||
      canonicalJson(sourceToolRef.current) !==
        canonicalJson(activationSourceSnapshot)
    ) {
      closeRegistration(
        'closed',
        'The frozen contract closed safely because the lesson changed during approval validation. Nothing ran.',
      );
      return;
    }
    if (!beforeActivation.ok) {
      closeRegistration(
        'closed',
        `The frozen contract closed safely because ${beforeActivation.reason} was detected. Nothing ran.`,
      );
      return;
    }

    const activation = prepareOneUseActivation({
      expiresAt: contract.compiled.expiresAt,
      suppressSource: onSuppressSourceTool,
    });
    if (!activation.ok) {
      closeRegistration(
        'closed',
        'The frozen contract expired before registration. Nothing ran.',
      );
      return;
    }
    const lease = activation.lease;
    leaseRef.current = lease;
    sourceWithdrawnRef.current = true;
    activeRef.current = true;

    const controller = new AbortController();
    controllerRef.current = controller;
    const remaining = Math.max(0, lease.deadline - performance.now());
    expiryTimerRef.current = window.setTimeout(() => {
      if (activeRef.current && lease.state() === 'active') {
        closeRegistration(
          'closed',
          'The one-use approval expired. Nothing ran; reset to begin again.',
        );
      }
    }, remaining);

    const modelContext = getModelContext();
    const statusResult = await registerPageTool({
      modelContext,
      tool: {
        ...contract.compiled.declaration,
        execute: withOneUseRegistrationRetirement(
          controller,
          async (input, _client, lifecycle) => {
            if (
              !activeRef.current ||
              !sourceWithdrawnRef.current ||
              epochRef.current !== epoch
            ) {
              throw new Error('This one-use capability is no longer active.');
            }
            normalizeEmptyInput(input);
            const claim = lease.claim();
            if (!claim.ok) {
              throw new Error(`This capability is already ${claim.reason}.`);
            }

            lifecycle.markClaimed();
            activeRef.current = false;
            if (expiryTimerRef.current !== undefined) {
              window.clearTimeout(expiryTimerRef.current);
              expiryTimerRef.current = undefined;
            }
            setStatus('claimed');
            setMessage(
              'The Site Tool callback consumed the one-use authority. Verifying the exact result and effect now.',
            );

            if (
              !contractStateRef.current ||
              !stateRevisionSnapshotMatches({
                expected: contractStateRef.current,
                currentRevision: getCurrentStateRevision(),
                currentState: getCurrentSourceState(),
              })
            ) {
              throw new Error(
                'The consumed capability stopped because the synthetic state changed after approval.',
              );
            }

            const claimedAt = new Date().toISOString();
            const stateSnapshot = structuredClone(getCurrentSourceState());
            const stateRevision = getCurrentStateRevision();
            const toolSnapshot = structuredClone(sourceToolRef.current);
            const binding = await validateLessonCapabilityBinding({
              contract,
              sourceTool: toolSnapshot,
              state: stateSnapshot,
              origin: window.location.origin,
              now: claimedAt,
            });
            if (!binding.ok) {
              throw new Error(
                `The consumed capability stopped before its handler: ${binding.reason}.`,
              );
            }
            if (
              !mountedRef.current ||
              epochRef.current !== epoch ||
              !stateRevisionSnapshotMatches({
                expected: { revision: stateRevision, state: stateSnapshot },
                currentRevision: getCurrentStateRevision(),
                currentState: getCurrentSourceState(),
              })
            ) {
              throw new Error(
                'The consumed capability was revoked during verification.',
              );
            }

            const observedWebMcp: WebMcpStatus = {
              ...webMcpRef.current,
              browserSupport: 'supported',
              registration: 'registered',
              permissionsPolicy: 'allowed',
              discovery: 'discovered',
              invocation: 'observed',
              detail:
                'The generated one-use lesson capability was registered, discovered, and invoked through the protected browser bridge.',
              discoveredToolNames: [contract.compiled.toolName],
            };
            const { outcome, verification } = await executeLessonCapability({
              contract,
              currentState: stateSnapshot,
              checkedAt: claimedAt,
              webMcp: observedWebMcp,
            });
            if (
              !stateRevisionSnapshotMatches({
                expected: { revision: stateRevision, state: stateSnapshot },
                currentRevision: getCurrentStateRevision(),
                currentState: getCurrentSourceState(),
              })
            ) {
              throw new Error(
                'The consumed capability stopped because the synthetic state changed during verification.',
              );
            }
            const payload: LessonCapabilityRunPayload = {
              proposal,
              contract,
              approvedAt: approvalTime,
              claimedAt,
              outcome,
              verification,
              invalidationReason: 'consumed',
              webMcp: observedWebMcp,
              stateRevision,
            };
            const recorded = await onCreateReceipt(payload);
            if (
              !mountedRef.current ||
              epochRef.current !== epoch ||
              !stateRevisionSnapshotMatches({
                expected: { revision: stateRevision, state: stateSnapshot },
                currentRevision: getCurrentStateRevision(),
                currentState: getCurrentSourceState(),
              })
            ) {
              throw new Error(
                'The receipt arrived after this lesson was closed.',
              );
            }
            onCommitReceipt(payload, recorded);
            setReceipt(recorded);
            setRegistration(observedWebMcp);
            setStatus(verification.passed ? 'verified' : 'failed');
            setMessage(
              `${recorded.verdict}: page receipt ${recorded.id.slice(0, 8)} returned to the caller. The before/after state and authority status are recorded on this page. No retry occurred.`,
            );
            return createLessonCapabilityToolResult(recorded);
          },
          {
            onClaimedFailure: (error) => {
              if (mountedRef.current && epochRef.current === epoch) {
                setStatus('failed');
                setMessage(
                  `The one-use authority was consumed and the call stopped: ${error instanceof Error ? error.message : 'unknown error'}. Do not retry.`,
                );
              }
            },
          },
        ),
      },
      signal: controller.signal,
      permissionObservation: observeToolsPermission(),
    });
    const settlement = decideRegistrationSettlement({
      mounted: mountedRef.current,
      epochMatches: epochRef.current === epoch,
      generationMatches: activeRef.current,
      leaseState: lease.state(),
    });
    if (settlement === 'preserve-claimed-execution') return;
    if (settlement === 'discard-stale-registration') {
      controller.abort();
      lease.invalidate('revoked');
      return;
    }
    setRegistration(statusResult);
    if (statusResult.registration !== 'registered') {
      sourceWithdrawnRef.current = false;
      onRestoreSourceTool();
      closeRegistration(
        'error',
        `The browser could not register the narrow capability, so the source was restored. ${statusResult.detail}`,
      );
      return;
    }

    setStatus('ready');
    setMessage(
      'The exact one-use Site Tool is registered on this public page. Nothing has run. Keep this page open and ask the agent in this built-in browser to invoke the approved action once.',
    );
  }, [
    closeRegistration,
    contract,
    getCurrentSourceState,
    getCurrentStateRevision,
    onCommitReceipt,
    onCreateReceipt,
    onRestoreSourceTool,
    onSuppressSourceTool,
    proposal,
    status,
  ]);

  const approveAndRegister = useCallback(async () => {
    try {
      await registerApprovedCapability();
    } catch (error) {
      if (mountedRef.current) {
        closeRegistration(
          'error',
          `The lesson stopped safely during protection setup: ${error instanceof Error ? error.message : 'unknown error'}. Nothing will retry automatically.`,
        );
      }
    }
  }, [closeRegistration, registerApprovedCapability]);

  const reset = useCallback(() => {
    closeRegistration(
      'idle',
      'Fresh lesson state is ready. Inspect and approve a new one-use action.',
    );
    sourceWithdrawnRef.current = false;
    onRestoreSourceTool();
    setProposal(undefined);
    setContract(undefined);
    setApprovedAt(undefined);
    setReceipt(undefined);
    setRegistration(undefined);
    contractStateRef.current = undefined;
  }, [closeRegistration, onRestoreSourceTool]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRef.current = false;
      controllerRef.current?.abort();
      leaseRef.current?.invalidate('revoked');
      if (expiryTimerRef.current !== undefined) {
        window.clearTimeout(expiryTimerRef.current);
      }
      if (sourceWithdrawnRef.current) onRestoreSourceTool();
    };
  }, [onRestoreSourceTool]);

  return {
    status,
    message,
    proposal,
    contract,
    approvedAt,
    receipt,
    registration,
    prepare,
    prepareFresh,
    approveAndRegister,
    reset,
  };
}
