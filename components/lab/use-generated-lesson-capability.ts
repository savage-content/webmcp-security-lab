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
  sourceState,
  clientLabel,
  webMcp,
  onSuppressSourceTool,
  onRestoreSourceTool,
  onCreateReceipt,
  onOfferPermit,
}: {
  scenario: ScenarioDefinition & { id: LessonCapabilityScenarioId };
  sourceTool: ToolDeclaration;
  sourceState: Record<string, JsonValue>;
  clientLabel: string;
  webMcp: WebMcpStatus;
  onSuppressSourceTool: () => true;
  onRestoreSourceTool: () => void;
  onCreateReceipt: (
    payload: LessonCapabilityRunPayload,
  ) => Promise<EvidenceReceipt>;
  onOfferPermit: (
    contract: CompiledLessonCapabilityContract,
    approvedAt: string,
    pageUrl: string,
  ) => Promise<void>;
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
  const sourceStateRef = useRef(sourceState);
  const webMcpRef = useRef(webMcp);
  const mountedRef = useRef(true);
  const epochRef = useRef(0);
  const activeRef = useRef(false);
  const sourceWithdrawnRef = useRef(false);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const leaseRef = useRef<ReturnType<typeof createOneUseLease> | undefined>(
    undefined,
  );
  const expiryTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    sourceToolRef.current = sourceTool;
  }, [sourceTool]);

  useEffect(() => {
    sourceStateRef.current = sourceState;
  }, [sourceState]);

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
      const stateSnapshot = structuredClone(sourceStateRef.current);
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
        canonicalJson(sourceStateRef.current) !==
          canonicalJson(stateSnapshot) ||
        canonicalJson(sourceToolRef.current) !== canonicalJson(toolSnapshot)
      ) {
        throw new Error(
          'The lesson changed while its exact contract was freezing.',
        );
      }
      setProposal(nextProposal);
      setContract(nextContract);
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
  }, [clientLabel, scenario.id]);

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

    const beforeActivation = await validateLessonCapabilityBinding({
      contract,
      sourceTool: structuredClone(sourceToolRef.current),
      state: structuredClone(sourceStateRef.current),
      origin: window.location.origin,
      now: approvalTime,
    });
    if (!mountedRef.current || epochRef.current !== epoch) return;
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
              'The browser guard consumed the one-use authority. Verifying the exact result and effect now.',
            );

            const claimedAt = new Date().toISOString();
            const stateSnapshot = structuredClone(sourceStateRef.current);
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
            if (!mountedRef.current || epochRef.current !== epoch) {
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
            const recorded = await onCreateReceipt({
              proposal,
              contract,
              approvedAt: approvalTime,
              claimedAt,
              outcome,
              verification,
              invalidationReason: 'consumed',
              webMcp: observedWebMcp,
            });
            if (!mountedRef.current || epochRef.current !== epoch) {
              throw new Error(
                'The receipt arrived after this lesson was closed.',
              );
            }
            setReceipt(recorded);
            setRegistration(observedWebMcp);
            setStatus(verification.passed ? 'verified' : 'failed');
            setMessage(
              `${recorded.verdict}: page receipt ${recorded.id.slice(0, 8)} returned to the caller. Check the extension or connector for independent guard and ledger status. No retry occurred.`,
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
    setRegistration(statusResult);

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
    try {
      await onOfferPermit(contract, approvalTime, window.location.href);
      setMessage(
        'The one-use action was offered to the browser guard. Nothing has run. Confirm “Protected” in the extension HUD, then ask your connected agent to run it once.',
      );
    } catch {
      sourceWithdrawnRef.current = false;
      onRestoreSourceTool();
      closeRegistration(
        'error',
        'The one-use action was registered, but the browser guard did not accept its permit. Nothing ran. Reset this action; do not use a local-run fallback.',
      );
    }
  }, [
    closeRegistration,
    contract,
    onCreateReceipt,
    onOfferPermit,
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
