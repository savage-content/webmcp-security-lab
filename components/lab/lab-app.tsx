'use client';

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Braces,
  CheckCircle2,
  ChevronDown,
  Code2,
  ExternalLink,
  FlaskConical,
  Info,
  Radio,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  createEvidenceReceiptArtifact,
  createPolicyJsonArtifact,
  type JsonArtifact,
} from '@/lib/lab/artifacts';
import { createEvidenceReceipt } from '@/lib/lab/evidence';
import { runScenario } from '@/lib/lab/engine';
import { createCapabilityEvidence } from '@/lib/lab/capability-negotiation';
import { createLessonCapabilityEvidence } from '@/lib/lab/lesson-capabilities';
import { assessScenarioRisk } from '@/lib/lab/risk';
import { planStateRevisionCommit } from '@/lib/lab/state-revision';
import {
  normalizeInvocationArguments,
  parseCapabilityEvidenceReceipt,
  parseEvidenceReceipt,
} from '@/lib/lab/schemas';
import {
  createNoviceJourneyCheckpoint,
  isExperienceModeSelectable,
  isExperienceModeViable,
  NOVICE_JOURNEY_STORAGE_KEY,
  parseNoviceJourneyCheckpoint,
  recommendExperienceMode,
  restoreNoviceJourneyCheckpoint,
  type ExperienceMode,
  type SiteToolsSupport,
} from '@/lib/lab/novice-journey';
import {
  defaultScenarioId,
  scenarioById,
  scenarios,
} from '@/lib/lab/scenarios';
import type {
  ConfirmationEvidence,
  EvidenceReceipt,
  LessonCapabilityScenarioId,
  InvocationChannel,
  JsonValue,
  ScenarioDefinition,
  ScenarioId,
  ToolDeclaration,
  WebMcpStatus,
} from '@/lib/lab/types';
import {
  LEGACY_CHROMIUM_RESULT_DELIVERY_GRACE_MS,
  createUnattributedWebMcpConfirmation,
  executeRegisteredTool,
  getModelContext,
  observeToolsPermission,
  registerPageTool,
} from '@/lib/lab/webmcp';

import { ArtifactExportDialog } from './artifact-export-dialog';
import {
  CapabilityNegotiator,
  type CapabilityRunPayload,
} from './capability-negotiator';
import {
  FirstRunGuide,
  GuidedSecurityLesson,
  LessonPicker,
} from './guided-security-lesson';
import { ExperienceChooser } from './experience-chooser';
import { FirstVisitTour } from './first-visit-tour';
import type { LessonCapabilityRunPayload } from './use-generated-lesson-capability';
import {
  EvidencePanel,
  type PersistenceState,
  SecureComparison,
} from './evidence-panel';
import { LedgerPanel } from './ledger-panel';
import { PresentedFixture } from './presented-fixture';
import { HeadsUpPanel } from './heads-up-panel';
import { PreflightComparison, RiskRules } from './risk-panel';

type StateMap = Record<ScenarioId, Record<string, JsonValue>>;
type ReceiptMap = Partial<Record<ScenarioId, EvidenceReceipt>>;
type ConfirmationMode = 'lab-harness' | 'webmcp-self-test';
const SESSION_STORAGE_KEY = 'left-out-webmcp-lab-session';

const surfaceDefinitions = [
  {
    number: '01',
    label: 'Learn',
    title: 'Understand WebMCP by using it',
    detail:
      'A person and their agent inspect an offer, approve one exact task, run it, and read the proof together.',
  },
  {
    number: '02',
    label: 'Protect',
    title: 'Contain one approved action',
    detail:
      'Exact approval narrows a Site Tool to one target, one expected effect, one call, and no retry.',
  },
  {
    number: '03',
    label: 'Report',
    title: 'Turn observations into useful evidence',
    detail:
      'Privacy-safe issue drafts and receipts support humans, remediation work, and future security-tooling feeds.',
  },
];

const initialWebMcpStatus: WebMcpStatus = {
  api: 'document.modelContext',
  browserSupport: 'checking',
  registration: 'checking',
  permissionsPolicy: 'unknown',
  discovery: 'not-checked',
  invocation: 'not-observed',
  detail: 'Checking this browser for page-scoped WebMCP support.',
  discoveredToolNames: [],
};

function buildInitialStateMap(): StateMap {
  return Object.fromEntries(
    scenarios.map((scenario) => [
      scenario.id,
      structuredClone(scenario.initialState),
    ]),
  ) as StateMap;
}

function describeBrowser(userAgent: string) {
  const chrome = userAgent.match(/(?:Chrome|Chromium)\/(\d+)/);
  if (chrome) return `Chromium ${chrome[1]}`;
  const firefox = userAgent.match(/Firefox\/(\d+)/);
  if (firefox) return `Firefox ${firefox[1]}`;
  const safari = userAgent.match(/Version\/(\d+).+Safari/);
  if (safari) return `Safari ${safari[1]}`;
  return 'This browser session';
}

function stateText(value: JsonValue | undefined) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return `${value}`;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

function getOrCreateSessionId() {
  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(SESSION_STORAGE_KEY, created);
  return created;
}

export function LabApp() {
  const [experienceMode, setExperienceMode] =
    useState<ExperienceMode>('read-only');
  const [setupConfirmed, setSetupConfirmed] = useState(false);
  const [siteToolsSupport, setSiteToolsSupport] =
    useState<SiteToolsSupport>('checking');
  const [journeyHydrated, setJourneyHydrated] = useState(false);
  const [persistedCompletedLessonIds, setPersistedCompletedLessonIds] =
    useState<Set<ScenarioId>>(() => new Set());
  const [lastReceiptId, setLastReceiptId] = useState<string>();
  const [recoveryMessage, setRecoveryMessage] = useState<string>();
  const [tourRequestKey, setTourRequestKey] = useState(0);
  const [selectedId, setSelectedId] = useState<ScenarioId>(defaultScenarioId);
  const [scenarioOneSourceRevision, setScenarioOneSourceRevision] = useState(0);
  const scenarioOneSourceRevisionRef = useRef(0);
  const [sourceToolSuppressed, setSourceToolSuppressed] = useState(false);
  const sourceRegistrationControllerRef = useRef<AbortController | undefined>(
    undefined,
  );
  const sourceRegistrationGenerationRef = useRef('not-registered');
  const sourceEnabledRef = useRef(false);
  const [stateMap, setStateMap] = useState<StateMap>(buildInitialStateMap);
  const stateMapRef = useRef(stateMap);
  const stateRevisionMapRef = useRef(
    Object.fromEntries(scenarios.map((item) => [item.id, 0])) as Record<
      ScenarioId,
      number
    >,
  );
  const [receiptMap, setReceiptMap] = useState<ReceiptMap>({});
  const [secureReceiptMap, setSecureReceiptMap] = useState<ReceiptMap>({});
  const [persistence, setPersistence] = useState<PersistenceState>('idle');
  const [securePersistence, setSecurePersistence] =
    useState<PersistenceState>('idle');
  const [ledger, setLedger] = useState<EvidenceReceipt[]>([]);
  const [webMcp, setWebMcp] = useState<WebMcpStatus>(initialWebMcpStatus);
  const webMcpRef = useRef(webMcp);
  const [clientLabel, setClientLabel] = useState('This browser session');
  const [noticeDraft, setNoticeDraft] = useState(
    stateText(scenarioById['over-broad-schema'].initialState.notice),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmationMode, setConfirmationMode] =
    useState<ConfirmationMode>('lab-harness');
  const [running, setRunning] = useState(false);
  const [secureRunning, setSecureRunning] = useState(false);
  const [executionMessage, setExecutionMessage] = useState('');
  const [exportArtifact, setExportArtifact] = useState<JsonArtifact>();
  const sessionIdRef = useRef('');

  const scenario = useMemo(() => {
    const selected = scenarioById[selectedId];
    if (selected.id !== 'read-only-claim' || scenarioOneSourceRevision === 0) {
      return selected;
    }
    return {
      ...selected,
      version: `${selected.version}+source-drift.${scenarioOneSourceRevision}`,
      tool: {
        ...selected.tool,
        description: `${selected.tool.description} Source declaration revision ${scenarioOneSourceRevision}.`,
      },
    };
  }, [scenarioOneSourceRevision, selectedId]);
  const scenarioState = stateMap[selectedId];
  const latestReceipt = receiptMap[selectedId];
  const latestSecureReceipt = secureReceiptMap[selectedId];
  const riskAssessment = useMemo(
    () => assessScenarioRisk(scenario),
    [scenario],
  );
  const secureConfirmationCopy = useMemo(
    () =>
      scenario.id === 'client-discovery-variance'
        ? `${scenario.secureConfirmationCopy} Named client: ${clientLabel}.`
        : scenario.secureConfirmationCopy,
    [clientLabel, scenario],
  );
  const completedLessonIds = useMemo(() => {
    const completed = new Set<ScenarioId>(persistedCompletedLessonIds);
    for (const item of scenarios) {
      if (
        secureReceiptMap[item.id]?.verdict === 'PASS' ||
        ledger.some(
          (receipt) =>
            receipt.scenario.id === item.id && receipt.verdict === 'PASS',
        )
      ) {
        completed.add(item.id);
      }
    }
    return completed;
  }, [ledger, persistedCompletedLessonIds, secureReceiptMap]);
  const nextScenario = useMemo(() => {
    const index = scenarios.findIndex((item) => item.id === scenario.id);
    return index >= 0 ? scenarios[index + 1] : undefined;
  }, [scenario.id]);

  const commitWebMcp = useCallback(
    (update: WebMcpStatus | ((previous: WebMcpStatus) => WebMcpStatus)) => {
      const previous = webMcpRef.current;
      const next = typeof update === 'function' ? update(previous) : update;
      webMcpRef.current = next;
      setWebMcp(next);
    },
    [],
  );

  const suppressSourceTool = useCallback(() => {
    sourceEnabledRef.current = false;
    sourceRegistrationGenerationRef.current = crypto.randomUUID();
    sourceRegistrationControllerRef.current?.abort();
    sourceRegistrationControllerRef.current = undefined;
    setSourceToolSuppressed(true);
    commitWebMcp((current) => ({
      ...current,
      registration: 'unregistered',
      discovery: 'not-discovered',
      invocation: 'not-observed',
      detail: `The broad ${scenario.shortTitle} source tool was explicitly unregistered before the generated capability was registered.`,
      discoveredToolNames: current.discoveredToolNames.filter(
        (name) => name !== scenario.tool.name,
      ),
    }));
    return true;
  }, [commitWebMcp, scenario.shortTitle, scenario.tool.name]);

  const restoreSourceTool = useCallback(() => {
    scenarioOneSourceRevisionRef.current = 0;
    setScenarioOneSourceRevision(0);
    setSourceToolSuppressed(false);
  }, []);

  const getScenarioOneSourceTool = useCallback((): ToolDeclaration => {
    const base = scenarioById['read-only-claim'].tool;
    const revision = scenarioOneSourceRevisionRef.current;
    if (revision === 0) return base;
    return {
      ...base,
      description: `${base.description} Source declaration revision ${revision}.`,
    };
  }, []);

  const getScenarioOneSourceState = useCallback(
    () => stateMapRef.current['read-only-claim'],
    [],
  );

  const getScenarioOneStateRevision = useCallback(
    () => stateRevisionMapRef.current['read-only-claim'],
    [],
  );

  const getCurrentScenarioState = useCallback(
    () => stateMapRef.current[scenario.id],
    [scenario.id],
  );

  const getCurrentScenarioStateRevision = useCallback(
    () => stateRevisionMapRef.current[scenario.id],
    [scenario.id],
  );

  const driftScenarioOneSource = useCallback(() => {
    const next = scenarioOneSourceRevisionRef.current + 1;
    scenarioOneSourceRevisionRef.current = next;
    setScenarioOneSourceRevision(next);
  }, []);

  useEffect(() => {
    stateMapRef.current = stateMap;
  }, [stateMap]);

  useEffect(() => {
    let active = true;
    const userAgent = navigator.userAgent ?? '';
    const storedSessionId = getOrCreateSessionId();
    const detectedSupport: SiteToolsSupport = getModelContext()?.registerTool
      ? 'available'
      : 'unavailable';
    let storedJourney: ReturnType<typeof parseNoviceJourneyCheckpoint>;
    try {
      storedJourney = parseNoviceJourneyCheckpoint(
        window.localStorage.getItem(NOVICE_JOURNEY_STORAGE_KEY),
      );
    } catch {
      storedJourney = undefined;
    }
    queueMicrotask(() => {
      if (!active) return;
      setClientLabel(describeBrowser(userAgent));
      sessionIdRef.current = storedSessionId;
      setSiteToolsSupport(detectedSupport);
      if (storedJourney) {
        const restoredJourney = restoreNoviceJourneyCheckpoint(
          storedJourney,
          detectedSupport,
        );
        const receiptCheckpoint = storedJourney.lastReceiptId
          ? ` Last receipt checkpoint: ${storedJourney.lastReceiptId.slice(0, 8)}.`
          : '';
        setExperienceMode(restoredJourney.mode);
        setSetupConfirmed(restoredJourney.setupConfirmed);
        setSelectedId(restoredJourney.selectedLessonId);
        setPersistedCompletedLessonIds(
          new Set(restoredJourney.completedLessonIds),
        );
        setLastReceiptId(restoredJourney.lastReceiptId);
        setRecoveryMessage(
          restoredJourney.recovery === 'retired-local-guard'
            ? `Your previous experimental Local Guard setup is no longer a public lesson option. Lesson progress was preserved, but no setup, approval, or live authority was restored.${receiptCheckpoint}`
            : restoredJourney.recovery === 'restored'
              ? `Restored Lesson ${scenarioById[storedJourney.selectedLessonId].ordinal} and ${storedJourney.completedLessonIds.length} completed lesson${storedJourney.completedLessonIds.length === 1 ? '' : 's'}. No approval or live authority was restored.${receiptCheckpoint}`
              : `Your previous Site Tools setup is unavailable here. Choose a viable path; no approval or live authority was restored.${receiptCheckpoint}`,
        );
      } else {
        setExperienceMode(recommendExperienceMode(detectedSupport));
        setSetupConfirmed(false);
      }
      setJourneyHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const registrationUnavailable = ['unsupported', 'denied', 'error'].includes(
      webMcp.registration,
    );
    if (!registrationUnavailable) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSiteToolsSupport('unavailable');
      if (experienceMode === 'site-tools') {
        setExperienceMode('read-only');
        setSetupConfirmed(false);
        setRecoveryMessage(
          'This page could not register a Site Tool in the current browser or policy. Choose the read-only path; nothing was approved or run.',
        );
      }
    });
    return () => {
      active = false;
    };
  }, [experienceMode, webMcp.registration]);

  useEffect(() => {
    if (!journeyHydrated) return;
    const checkpoint = createNoviceJourneyCheckpoint({
      mode: experienceMode,
      setupConfirmed,
      selectedLessonId: selectedId,
      completedLessonIds: scenarios
        .filter((item) => completedLessonIds.has(item.id))
        .map((item) => item.id),
      lastReceiptId,
    });
    try {
      window.localStorage.setItem(
        NOVICE_JOURNEY_STORAGE_KEY,
        JSON.stringify(checkpoint),
      );
    } catch {
      // The lesson remains usable when browser storage is unavailable.
    }
  }, [
    completedLessonIds,
    experienceMode,
    journeyHydrated,
    lastReceiptId,
    selectedId,
    setupConfirmed,
  ]);

  const recordNoviceReceipt = useCallback(
    (scenarioId: ScenarioId, receipt: EvidenceReceipt) => {
      setLastReceiptId(receipt.id);
      if (receipt.verdict !== 'PASS') return;
      setPersistedCompletedLessonIds((current) => {
        if (current.has(scenarioId)) return current;
        const next = new Set(current);
        next.add(scenarioId);
        return next;
      });
    },
    [],
  );

  const buildArguments = useCallback(() => {
    const args = structuredClone(scenario.defaultArguments);
    const current = stateMapRef.current[scenario.id];

    if (scenario.id === 'over-broad-schema') {
      args.notice = noticeDraft;
    }
    if (scenario.id === 'confirmation-mismatch') {
      args.desired_state = current.subscribed !== true;
    }
    if (scenario.id === 'client-discovery-variance') {
      args.client_label = clientLabel;
    }

    return args;
  }, [clientLabel, noticeDraft, scenario]);

  const invokeScenario = useCallback(
    async (
      input: unknown,
      channel: InvocationChannel,
      confirmation: ConfirmationEvidence,
    ) => {
      const argumentsValue = normalizeInvocationArguments(input);
      const now = new Date().toISOString();
      const currentState = stateMapRef.current[scenario.id];
      const currentWebMcp = webMcpRef.current;
      const outcome = runScenario(scenario.id, currentState, argumentsValue, {
        channel,
        now,
        origin: window.location.origin,
        browser: {
          userAgent: navigator.userAgent ?? '',
          language: navigator.language ?? '',
          platform:
            (
              navigator as Navigator & {
                userAgentData?: { platform?: string };
              }
            ).userAgentData?.platform ??
            navigator.platform ??
            '',
        },
        clientLabel,
        webMcp: currentWebMcp,
        confirmation,
      });

      const nextStateMap = {
        ...stateMapRef.current,
        [scenario.id]: outcome.after,
      };
      stateRevisionMapRef.current[scenario.id] += 1;
      stateMapRef.current = nextStateMap;
      setStateMap(nextStateMap);

      const receipt = parseEvidenceReceipt(
        createEvidenceReceipt({
          scenario,
          declaration: scenario.tool,
          argumentsValue,
          sessionId: sessionIdRef.current || getOrCreateSessionId(),
          context: {
            channel,
            now,
            origin: window.location.origin,
            browser: {
              userAgent: navigator.userAgent ?? '',
              language: navigator.language ?? '',
              platform:
                (
                  navigator as Navigator & {
                    userAgentData?: { platform?: string };
                  }
                ).userAgentData?.platform ??
                navigator.platform ??
                '',
            },
            clientLabel,
            webMcp: currentWebMcp,
            confirmation,
          },
          outcome,
        }),
      );

      setReceiptMap((current) => ({ ...current, [scenario.id]: receipt }));
      setPersistence('saved');
      setLedger((current) =>
        [receipt, ...current.filter((item) => item.id !== receipt.id)].slice(
          0,
          12,
        ),
      );

      setExecutionMessage(
        `Run ${receipt.id.slice(0, 8)} completed. Its receipt is private to this page session unless you export it.`,
      );

      window.setTimeout(() => {
        document
          .getElementById('evidence')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);

      return {
        lab: 'Left Out Security WebMCP Security Lab',
        scenario: scenario.id,
        result: outcome.rawResult,
        evidence: {
          receipt_id: receipt.id,
          persisted: false,
          verdict: outcome.verdict,
        },
      };
    },
    [clientLabel, scenario],
  );

  const invokeRef = useRef(invokeScenario);
  useEffect(() => {
    invokeRef.current = invokeScenario;
  }, [invokeScenario]);

  const createLocalCapabilityReceipt = useCallback(
    async (payload: CapabilityRunPayload) => {
      const capability = createCapabilityEvidence({
        proposal: payload.proposal,
        contract: payload.contract,
        approvedAt: payload.approvedAt,
        claimedAt: payload.claimedAt,
        verification: payload.verification,
        invalidatedAt: payload.claimedAt,
        invalidationReason: payload.invalidationReason,
      });
      const observedWebMcp: WebMcpStatus = {
        ...webMcpRef.current,
        browserSupport: 'supported',
        registration: 'registered',
        permissionsPolicy: 'allowed',
        discovery: 'discovered',
        invocation: 'observed',
        detail: `The generated capability was registered and discovered for this call. Its one-use authority was synchronously consumed; physical registration retirement is scheduled ${LEGACY_CHROMIUM_RESULT_DELIVERY_GRACE_MS} ms after successful callback fulfillment for Chrome 152 result-delivery compatibility.`,
        discoveredToolNames: [payload.contract.compiled.toolName],
      };
      const context = {
        channel: 'negotiated-capability' as const,
        now: payload.claimedAt,
        origin: window.location.origin,
        browser: {
          userAgent: navigator.userAgent ?? '',
          language: navigator.language ?? '',
          platform:
            (
              navigator as Navigator & {
                userAgentData?: { platform?: string };
              }
            ).userAgentData?.platform ??
            navigator.platform ??
            '',
        },
        clientLabel,
        webMcp: observedWebMcp,
        confirmation: {
          presentedCopy: payload.contract.approval.copy,
          known: true,
          approved: true,
          source: 'capability-contract' as const,
        },
      };
      const receipt = await parseCapabilityEvidenceReceipt(
        createEvidenceReceipt({
          scenario,
          declaration: payload.contract.compiled.declaration,
          argumentsValue: {},
          context,
          outcome: payload.outcome,
          sessionId: sessionIdRef.current || getOrCreateSessionId(),
          capability,
        }),
      );
      return receipt;
    },
    [clientLabel, scenario],
  );

  const commitLocalCapabilityReceipt = useCallback(
    (payload: CapabilityRunPayload, receipt: EvidenceReceipt) => {
      const commit = planStateRevisionCommit({
        expected: {
          revision: payload.stateRevision,
          state: payload.outcome.before,
        },
        currentRevision: stateRevisionMapRef.current['read-only-claim'],
        currentState: stateMapRef.current['read-only-claim'],
        nextState: payload.outcome.after,
      });
      if (!commit) {
        throw new Error(
          'The Scenario 1 state changed while the receipt was being verified.',
        );
      }
      const nextStateMap = {
        ...stateMapRef.current,
        'read-only-claim': commit.state,
      };
      stateRevisionMapRef.current['read-only-claim'] = commit.revision;
      stateMapRef.current = nextStateMap;
      setStateMap(nextStateMap);
      setSecureReceiptMap((current) => ({
        ...current,
        'read-only-claim': receipt,
      }));
      recordNoviceReceipt('read-only-claim', receipt);
      setExecutionMessage(
        `Capability receipt ${receipt.id.slice(0, 8)} exists only in this document session. Export it before reset or reload; the capability handler made no evidence POST.`,
      );
    },
    [recordNoviceReceipt],
  );

  const createLocalLessonCapabilityReceipt = useCallback(
    async (payload: LessonCapabilityRunPayload) => {
      const capability = createLessonCapabilityEvidence({
        proposal: payload.proposal,
        contract: payload.contract,
        approvedAt: payload.approvedAt,
        claimedAt: payload.claimedAt,
        verification: payload.verification,
        invalidatedAt: payload.claimedAt,
        invalidationReason: payload.invalidationReason,
      });
      const context = {
        channel: 'negotiated-capability' as const,
        now: payload.claimedAt,
        origin: window.location.origin,
        browser: {
          userAgent: navigator.userAgent ?? '',
          language: navigator.language ?? '',
          platform:
            (
              navigator as Navigator & {
                userAgentData?: { platform?: string };
              }
            ).userAgentData?.platform ??
            navigator.platform ??
            '',
        },
        clientLabel,
        webMcp: payload.webMcp,
        confirmation: {
          presentedCopy: payload.contract.approval.copy,
          known: true,
          approved: true,
          source: 'capability-contract' as const,
        },
      };
      const receipt = await parseCapabilityEvidenceReceipt(
        createEvidenceReceipt({
          scenario,
          declaration: payload.contract.compiled.declaration,
          argumentsValue: {},
          context,
          outcome: payload.outcome,
          sessionId: sessionIdRef.current || getOrCreateSessionId(),
          capability,
        }),
      );
      return receipt;
    },
    [clientLabel, scenario],
  );

  const commitLocalLessonCapabilityReceipt = useCallback(
    (payload: LessonCapabilityRunPayload, receipt: EvidenceReceipt) => {
      const commit = planStateRevisionCommit({
        expected: {
          revision: payload.stateRevision,
          state: payload.outcome.before,
        },
        currentRevision: stateRevisionMapRef.current[scenario.id],
        currentState: stateMapRef.current[scenario.id],
        nextState: payload.outcome.after,
      });
      if (!commit) {
        throw new Error(
          'The synthetic state changed while the receipt was being verified.',
        );
      }
      const nextStateMap = {
        ...stateMapRef.current,
        [scenario.id]: commit.state,
      };
      stateRevisionMapRef.current[scenario.id] = commit.revision;
      stateMapRef.current = nextStateMap;
      setStateMap(nextStateMap);
      setSecureReceiptMap((current) => ({
        ...current,
        [scenario.id]: receipt,
      }));
      recordNoviceReceipt(scenario.id, receipt);
      setExecutionMessage(
        `Page receipt ${receipt.id.slice(0, 8)} returned to the caller. The page made no evidence POST; only the connector can validate and store its own linked entry.`,
      );
    },
    [recordNoviceReceipt, scenario.id],
  );

  useEffect(() => {
    if (sourceToolSuppressed) {
      sourceEnabledRef.current = false;
      commitWebMcp((current) => ({
        ...current,
        registration: 'unregistered',
        discovery: 'not-discovered',
        invocation: 'not-observed',
        detail: `The broad ${scenario.shortTitle} source tool is withdrawn while the negotiated capability lifecycle is active.`,
        discoveredToolNames: current.discoveredToolNames.filter(
          (name) => name !== scenario.tool.name,
        ),
      }));
      return;
    }

    const controller = new AbortController();
    const registrationGeneration = crypto.randomUUID();
    sourceRegistrationGenerationRef.current = registrationGeneration;
    sourceEnabledRef.current = true;
    sourceRegistrationControllerRef.current = controller;
    const modelContext = getModelContext();
    const permissionObservation = observeToolsPermission();

    commitWebMcp({
      api: 'document.modelContext',
      browserSupport: modelContext?.registerTool ? 'supported' : 'unsupported',
      registration: 'registering',
      permissionsPolicy: permissionObservation,
      discovery: 'not-checked',
      invocation: 'not-observed',
      detail: `Registering ${scenario.tool.name} on this document.`,
      discoveredToolNames: [],
    });

    const registeredTool = {
      ...scenario.tool,
      execute: async (input: unknown) => {
        if (
          !sourceEnabledRef.current ||
          sourceRegistrationGenerationRef.current !== registrationGeneration
        ) {
          throw new Error(
            'This source-tool registration was withdrawn or superseded.',
          );
        }
        commitWebMcp((current) => ({
          ...current,
          discovery: 'discovered',
          invocation: 'observed',
          detail: `${scenario.tool.name} was invoked through WebMCP. The page cannot prove whether this callback came from its approved self-test request or a competing client call.`,
          discoveredToolNames: Array.from(
            new Set([...current.discoveredToolNames, scenario.tool.name]),
          ),
        }));
        return invokeRef.current(
          input,
          'webmcp',
          createUnattributedWebMcpConfirmation(
            scenario.presented.confirmationCopy,
          ),
        );
      },
    };

    void registerPageTool({
      modelContext,
      tool: registeredTool,
      signal: controller.signal,
      permissionObservation,
    }).then((status) => {
      if (!controller.signal.aborted) commitWebMcp(status);
    });

    return () => {
      if (sourceRegistrationGenerationRef.current === registrationGeneration) {
        sourceEnabledRef.current = false;
        sourceRegistrationGenerationRef.current = crypto.randomUUID();
      }
      controller.abort();
      if (sourceRegistrationControllerRef.current === controller) {
        sourceRegistrationControllerRef.current = undefined;
      }
    };
  }, [commitWebMcp, scenario, sourceToolSuppressed]);

  const runManualHarness = useCallback(async () => {
    setConfirmOpen(false);
    setRunning(true);
    try {
      await invokeScenario(buildArguments(), 'lab-harness', {
        presentedCopy: scenario.presented.confirmationCopy,
        known: true,
        approved: true,
        source: 'lab-dialog',
      });
    } catch (error) {
      setExecutionMessage(
        error instanceof Error ? error.message : 'The controlled run failed.',
      );
    } finally {
      setRunning(false);
    }
  }, [buildArguments, invokeScenario, scenario.presented.confirmationCopy]);

  const runWebMcpSelfTest = useCallback(async () => {
    setConfirmOpen(false);
    const modelContext = getModelContext();
    if (!modelContext?.getTools || !modelContext.executeTool) {
      setExecutionMessage(
        'This browser does not expose the optional in-page WebMCP self-test. Ask the browser agent to invoke the registered tool, or use the clearly labeled harness.',
      );
      return;
    }

    setRunning(true);
    try {
      const tools = await modelContext.getTools();
      const names = tools.map((tool) => tool.name);
      const selectedTool = tools.find(
        (tool) => tool.name === scenario.tool.name,
      );
      commitWebMcp((current) => ({
        ...current,
        discovery: selectedTool ? 'discovered' : 'not-discovered',
        detail: selectedTool
          ? `${scenario.tool.name} was discovered by the same-origin in-page API. Invocation still requires this explicit approval.`
          : `${scenario.tool.name} was registered but not returned to this in-page caller.`,
        discoveredToolNames: names,
      }));

      if (!selectedTool) return;
      await executeRegisteredTool(modelContext, selectedTool, buildArguments());
    } catch (error) {
      setExecutionMessage(
        `WebMCP self-test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setRunning(false);
    }
  }, [buildArguments, commitWebMcp, scenario.tool.name]);

  async function runSecureRetest() {
    setSecureRunning(true);
    setSecurePersistence('idle');
    try {
      const now = new Date().toISOString();
      const secureArguments = structuredClone(scenario.secureDefaultArguments);
      if (scenario.id === 'client-discovery-variance') {
        secureArguments.client_label = clientLabel;
      }
      const context = {
        channel: 'secure-retest' as const,
        now,
        origin: window.location.origin,
        browser: {
          userAgent: navigator.userAgent ?? '',
          language: navigator.language ?? '',
          platform:
            (
              navigator as Navigator & {
                userAgentData?: { platform?: string };
              }
            ).userAgentData?.platform ??
            navigator.platform ??
            '',
        },
        clientLabel,
        webMcp: webMcpRef.current,
        confirmation: {
          presentedCopy: secureConfirmationCopy,
          known: true,
          approved: true,
          source: 'builder-retest' as const,
        },
      };
      const outcome = runScenario(
        scenario.id,
        structuredClone(scenario.initialState),
        secureArguments,
        context,
        true,
      );
      const receipt = createEvidenceReceipt({
        scenario,
        declaration: scenario.secureTool,
        argumentsValue: secureArguments,
        sessionId: sessionIdRef.current || getOrCreateSessionId(),
        context,
        outcome,
      });
      setSecureReceiptMap((current) => ({
        ...current,
        [scenario.id]: receipt,
      }));
      recordNoviceReceipt(scenario.id, receipt);

      setSecurePersistence('saved');
      setLedger((current) =>
        [receipt, ...current.filter((item) => item.id !== receipt.id)].slice(
          0,
          12,
        ),
      );

      setExecutionMessage(
        `Secure retest ${receipt.id.slice(0, 8)} finished ${receipt.verdict}. Its receipt is private to this page session unless you export it.`,
      );
      window.setTimeout(() => {
        document
          .getElementById('builder')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    } finally {
      setSecureRunning(false);
    }
  }

  const checkDiscovery = useCallback(async () => {
    const modelContext = getModelContext();
    if (!modelContext?.getTools) {
      commitWebMcp((current) => ({
        ...current,
        discovery: 'unsupported',
        detail:
          'This browser does not expose the optional in-page getTools() check. External client discovery is not inferred.',
      }));
      return;
    }

    setRunning(true);
    try {
      const tools = await modelContext.getTools();
      const names = tools.map((tool) => tool.name);
      const selectedTool = tools.find(
        (tool) => tool.name === scenario.tool.name,
      );
      const nextStatus: WebMcpStatus = {
        ...webMcpRef.current,
        discovery: selectedTool ? 'discovered' : 'not-discovered',
        detail: selectedTool
          ? `${scenario.tool.name} was discovered by the same-origin in-page API.`
          : `${scenario.tool.name} was registered but not returned to this in-page caller.`,
        discoveredToolNames: names,
      };
      commitWebMcp(nextStatus);
    } catch (error) {
      commitWebMcp((current) => ({
        ...current,
        discovery: 'error',
        detail: `Discovery check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }));
    } finally {
      setRunning(false);
    }
  }, [commitWebMcp, scenario.tool.name]);

  const resetScenario = useCallback(() => {
    const nextStateMap = {
      ...stateMapRef.current,
      [scenario.id]: structuredClone(scenario.initialState),
    };
    stateRevisionMapRef.current[scenario.id] += 1;
    stateMapRef.current = nextStateMap;
    setStateMap(nextStateMap);
    setReceiptMap((current) => {
      const next = { ...current };
      delete next[scenario.id];
      return next;
    });
    setSecureReceiptMap((current) => {
      const next = { ...current };
      delete next[scenario.id];
      return next;
    });
    setPersistence('idle');
    setSecurePersistence('idle');
    setExecutionMessage(
      'Fixture state reset. Existing evidence receipts were preserved.',
    );
    if (scenario.id === 'over-broad-schema') {
      setNoticeDraft(stateText(scenario.initialState.notice));
    }
  }, [scenario]);

  const changeExperienceMode = useCallback(
    (nextMode: ExperienceMode) => {
      if (!isExperienceModeSelectable(nextMode, siteToolsSupport)) return;
      if (nextMode === experienceMode) return;
      restoreSourceTool();
      setExperienceMode(nextMode);
      setSetupConfirmed(false);
      setRecoveryMessage(
        'Setup changed. Confirm this path to continue. Any unused approval was closed and will not be restored.',
      );
    },
    [experienceMode, restoreSourceTool, siteToolsSupport],
  );

  const confirmExperienceMode = useCallback(() => {
    if (!isExperienceModeViable(experienceMode, siteToolsSupport)) return;
    setSetupConfirmed(true);
    setRecoveryMessage(undefined);
  }, [experienceMode, siteToolsSupport]);

  const openPracticeReport = useCallback(() => {
    const report = document.getElementById(
      'report-preview',
    ) as HTMLDetailsElement | null;
    if (report) report.open = true;
    report?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const selectGuidedLesson = useCallback(
    (nextId: ScenarioId) => {
      if (!setupConfirmed) {
        document
          .getElementById('setup')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (
        nextId !== selectedId &&
        experienceMode === 'site-tools' &&
        siteToolsSupport === 'available'
      ) {
        const checkpoint = createNoviceJourneyCheckpoint({
          mode: experienceMode,
          setupConfirmed,
          selectedLessonId: nextId,
          completedLessonIds: scenarios
            .filter((item) => completedLessonIds.has(item.id))
            .map((item) => item.id),
          lastReceiptId,
        });
        try {
          window.localStorage.setItem(
            NOVICE_JOURNEY_STORAGE_KEY,
            JSON.stringify(checkpoint),
          );

          // Chrome 152 currently retains enough configuration churn after
          // standards-based AbortSignal unregistration to reject the eleventh
          // dynamic tool registration in one document. A document transition
          // invokes the browser's own unloading cleanup and gives the next
          // lesson a fresh tool map without restoring any approval.
          sourceEnabledRef.current = false;
          sourceRegistrationGenerationRef.current = crypto.randomUUID();
          sourceRegistrationControllerRef.current?.abort();
          sourceRegistrationControllerRef.current = undefined;
          window.location.reload();
          return;
        } catch {
          // Storage-restricted browsers keep the in-page fallback rather than
          // reloading into the wrong lesson.
        }
      }
      if (nextId !== selectedId) restoreSourceTool();
      setSelectedId(nextId);
      setPersistence(receiptMap[nextId] ? 'saved' : 'idle');
      setSecurePersistence(secureReceiptMap[nextId] ? 'saved' : 'idle');
      setExecutionMessage('');
      window.setTimeout(() => {
        document
          .getElementById('lesson')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    },
    [
      receiptMap,
      completedLessonIds,
      experienceMode,
      lastReceiptId,
      restoreSourceTool,
      secureReceiptMap,
      selectedId,
      setupConfirmed,
      siteToolsSupport,
    ],
  );

  const startGuidedLesson = useCallback(() => {
    selectGuidedLesson('read-only-claim');
  }, [selectGuidedLesson]);

  const startFirstVisitTour = useCallback(() => {
    setTourRequestKey((current) => current + 1);
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-5 px-5 py-3.5 lg:px-8">
          <a className="flex items-center gap-3" href="#top">
            <div className="flex size-9 items-center justify-center rounded-md border border-foreground bg-foreground text-background">
              <ShieldAlert className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Left Out Security
              </p>
              <p className="text-sm font-semibold tracking-tight">
                WebMCP Test Range
              </p>
            </div>
          </a>
          <nav
            className="hidden items-center gap-6 md:flex"
            aria-label="Primary navigation"
          >
            <a className="nav-link" href="#top">
              Start
            </a>
            <a className="nav-link" href="#setup">
              Learn Site Tools
            </a>
            <a className="nav-link" href="#ledger">
              Review evidence
            </a>
            <a className="nav-link" href="#advanced-lab">
              Advanced
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="hidden border-emerald-700/30 bg-emerald-50 text-emerald-800 sm:inline-flex"
            >
              <span className="size-1.5 rounded-full bg-emerald-600" />
              Synthetic only
            </Badge>
            <a
              aria-label="View source on GitHub"
              className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-muted"
              href="https://github.com/savage-content/webmcp-security-lab"
              rel="noreferrer"
              target="_blank"
            >
              <Code2 className="size-4" />
            </a>
          </div>
        </div>
      </header>

      <FirstVisitTour
        key={tourRequestKey}
        forceOpen={tourRequestKey > 0}
        mode={experienceMode}
        setupConfirmed={setupConfirmed}
        siteToolsSupport={siteToolsSupport}
        clientLabel={clientLabel}
        onModeChange={changeExperienceMode}
        onConfirmSetup={confirmExperienceMode}
        onFinish={startGuidedLesson}
      />

      <section
        id="top"
        className="border-b border-border bg-[linear-gradient(to_right,var(--grid-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-line)_1px,transparent_1px)] bg-[size:28px_28px]"
      >
        <div className="mx-auto grid max-w-[1480px] gap-10 px-5 py-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)] lg:px-8 lg:py-16">
          <div className="max-w-4xl">
            <div className="mb-5 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-800">
              <Radio className="size-3.5" aria-hidden="true" />
              Interactive Site Tools learning + safety lab
            </div>
            <h1 className="max-w-4xl text-balance text-[clamp(3rem,7vw,6.8rem)] font-semibold leading-[0.88] tracking-[-0.065em]">
              Learn what a website offers your AI
              <span className="block text-muted-foreground">
                before you let it run.
              </span>
            </h1>
            <p className="mt-7 max-w-2xl text-pretty text-base leading-7 text-muted-foreground lg:text-lg">
              ChatGPT calls these Site Tools, an implementation of WebMCP.
              Practice safely with five synthetic lessons using the native
              browser path or a no-invocation learning path.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                className="h-11 px-4"
                onClick={startFirstVisitTour}
              >
                <FlaskConical data-icon="inline-start" />
                Start the 2-minute walkthrough
                <ArrowRight data-icon="inline-end" />
              </Button>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="size-4 text-emerald-700" />
                Fake data · nothing runs without approval
              </span>
            </div>
          </div>

          <HeadsUpPanel
            scenario={scenario}
            assessment={riskAssessment}
            webMcp={webMcp}
            secureReceipt={latestSecureReceipt}
            onInspect={startGuidedLesson}
          />
        </div>
      </section>

      <section
        id="platform"
        className="mx-auto max-w-[1480px] scroll-mt-20 px-5 py-10 lg:px-8 lg:py-14"
      >
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              The complete learning path
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">
              Learn it. Protect the session. Review what happened.
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            Every lesson starts with one plain question and one controlled
            practice. Schemas, source code, and client experiments stay in the
            optional advanced lab.
          </p>
        </div>
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-3">
          {surfaceDefinitions.map((surface) => (
            <article key={surface.label} className="bg-card p-5 lg:p-6">
              <div className="mb-9 flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-muted-foreground">
                  {surface.number}
                </span>
                <Badge variant="outline">{surface.label}</Badge>
              </div>
              <h3 className="text-lg font-semibold tracking-tight">
                {surface.title}
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {surface.detail}
              </p>
            </article>
          ))}
        </div>
        <ExperienceChooser
          mode={experienceMode}
          confirmed={setupConfirmed}
          siteToolsSupport={siteToolsSupport}
          clientLabel={clientLabel}
          recoveryMessage={recoveryMessage}
          onChange={changeExperienceMode}
          onConfirm={confirmExperienceMode}
        />
        {setupConfirmed ? (
          <>
            <FirstRunGuide mode={experienceMode} />
            <LessonPicker
              scenarios={scenarios}
              selectedId={selectedId}
              completedIds={completedLessonIds}
              onSelect={selectGuidedLesson}
            />
          </>
        ) : (
          <div className="mt-5 rounded-xl border border-amber-300/55 bg-amber-50 p-5 text-amber-950">
            <p className="text-sm font-semibold">Lessons are waiting</p>
            <p className="mt-1 text-xs leading-5">
              Confirm a supported setup above. This gate prevents the page from
              sending a first-time visitor into instructions their browser
              cannot complete.
            </p>
          </div>
        )}
      </section>

      <section
        id="range"
        className="mx-auto max-w-[1480px] scroll-mt-20 px-5 pb-8 lg:px-8 lg:pb-12"
      >
        <div className="overflow-hidden rounded-xl border border-foreground bg-card shadow-[7px_7px_0_0_var(--accent-strong)]">
          {!setupConfirmed ? (
            <div
              id="lesson"
              className="scroll-mt-20 bg-slate-950 p-6 text-slate-100 sm:p-8"
            >
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-lime-300">
                Before Lesson 1
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Confirm a viable setup first.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                The lab has not approved or run a lesson action, and no one-use
                capability has been registered. Return to the setup check and
                confirm the path detected for this browser.
              </p>
              <Button
                variant="secondary"
                className="mt-5"
                onClick={() =>
                  document
                    .getElementById('setup')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                Return to setup
              </Button>
            </div>
          ) : scenario.id === 'read-only-claim' ? (
            <CapabilityNegotiator
              key={`${scenario.id}:${experienceMode}`}
              experienceMode={experienceMode}
              sourceTool={scenario.tool}
              sourceState={scenarioState}
              getCurrentSourceTool={getScenarioOneSourceTool}
              getCurrentSourceState={getScenarioOneSourceState}
              getCurrentStateRevision={getScenarioOneStateRevision}
              sourceToolSuppressed={sourceToolSuppressed}
              onSuppressSourceTool={suppressSourceTool}
              onRestoreSourceTool={restoreSourceTool}
              onSourceDrift={driftScenarioOneSource}
              onCreateLocalReceipt={createLocalCapabilityReceipt}
              onCommitLocalReceipt={commitLocalCapabilityReceipt}
              onExport={(receipt) =>
                setExportArtifact(createEvidenceReceiptArtifact(receipt))
              }
              onNext={
                nextScenario
                  ? () => selectGuidedLesson(nextScenario.id)
                  : undefined
              }
            />
          ) : (
            <GuidedSecurityLesson
              key={`${scenario.id}:${experienceMode}`}
              experienceMode={experienceMode}
              scenario={
                scenario as ScenarioDefinition & {
                  id: LessonCapabilityScenarioId;
                }
              }
              assessment={riskAssessment}
              sourceState={scenarioState}
              getCurrentSourceState={getCurrentScenarioState}
              getCurrentStateRevision={getCurrentScenarioStateRevision}
              clientLabel={clientLabel}
              webMcp={webMcp}
              onSuppressSourceTool={suppressSourceTool}
              onRestoreSourceTool={restoreSourceTool}
              onCreateReceipt={createLocalLessonCapabilityReceipt}
              onCommitReceipt={commitLocalLessonCapabilityReceipt}
              onResetScenario={resetScenario}
              onNext={
                nextScenario
                  ? () => selectGuidedLesson(nextScenario.id)
                  : undefined
              }
            />
          )}

          {setupConfirmed && latestSecureReceipt ? (
            <section
              id="lesson-complete"
              aria-labelledby="lesson-complete-heading"
              className="border-t border-lime-300/25 bg-slate-900 px-5 py-6 text-slate-100 sm:px-8"
            >
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-lime-300">
                    {latestSecureReceipt.verdict === 'PASS'
                      ? 'Lesson checkpoint saved'
                      : 'Review required'}
                  </p>
                  <h2
                    id="lesson-complete-heading"
                    className="mt-1 text-xl font-semibold"
                  >
                    {latestSecureReceipt.verdict} · Receipt{' '}
                    {latestSecureReceipt.id.slice(0, 8)}
                  </h2>
                  <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-300">
                    Your lesson position and this receipt ID are remembered on
                    this device. The approval and one-use authority are closed
                    and will never resume after reload.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setExportArtifact(
                        createEvidenceReceiptArtifact(latestSecureReceipt),
                      )
                    }
                  >
                    Save full receipt
                  </Button>
                  <Button variant="outline" onClick={openPracticeReport}>
                    <ScanSearch data-icon="inline-start" />
                    Preview safe report
                  </Button>
                  {nextScenario && latestSecureReceipt.verdict === 'PASS' ? (
                    <Button
                      className="bg-lime-300 text-slate-950 hover:bg-lime-200"
                      onClick={() => selectGuidedLesson(nextScenario.id)}
                    >
                      Continue to Lesson {nextScenario.ordinal}
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          <details id="advanced-lab" className="group border-t border-white/10">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-slate-900 px-5 py-4 text-left text-slate-100 outline-none transition-colors hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime-300 sm:px-8">
              <span>
                <span className="block text-sm font-semibold">
                  Explore the advanced security lab
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-400">
                  Optional: inspect misleading claims, schemas, source drift,
                  fixes, and protocol evidence.
                </span>
              </span>
              <ChevronDown className="size-5 shrink-0 transition-transform group-open:rotate-180" />
            </summary>

            <div className="border-t border-white/10 bg-slate-950 px-5 py-5 text-slate-100 sm:px-8">
              <div className="flex flex-col gap-4 rounded-lg border border-amber-300/25 bg-amber-300/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-3xl">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                    Experimental developer preview
                  </p>
                  <h3 className="mt-1 text-base font-semibold">
                    Local Guard is future work, not part of this judged flow.
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    The public lesson uses native Site Tools only. A separate,
                    unsigned browser-monitoring prototype remains research and
                    is not a setup choice, distributed product, or security
                    guarantee.
                  </p>
                </div>
                <Link
                  className="shrink-0 text-sm font-semibold text-amber-200 underline underline-offset-4"
                  href="/local-guard"
                >
                  Read the future-work boundary
                </Link>
              </div>
            </div>

            <div className="grid lg:grid-cols-[270px_minmax(0,1fr)]">
              <aside className="border-b border-border bg-muted/45 p-3 lg:border-b-0 lg:border-r">
                <div className="px-3 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Scenario fixtures
                </div>
                <nav aria-label="Security scenarios" className="space-y-1">
                  {scenarios.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={item.id === selectedId ? 'page' : undefined}
                      className={`group flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors ${
                        item.id === selectedId
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground hover:bg-background hover:text-foreground'
                      }`}
                      onClick={() => {
                        if (item.id !== selectedId) restoreSourceTool();
                        setSelectedId(item.id);
                        setPersistence(receiptMap[item.id] ? 'saved' : 'idle');
                        setSecurePersistence(
                          secureReceiptMap[item.id] ? 'saved' : 'idle',
                        );
                        setExecutionMessage('');
                      }}
                    >
                      <span className="font-mono text-[10px] opacity-60">
                        {item.ordinal}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          {item.shortTitle}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] opacity-65">
                          {item.category}
                        </span>
                      </span>
                      <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
                    </button>
                  ))}
                </nav>

                <div className="mt-5 rounded-md border border-border bg-background p-3">
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Safety boundary
                  </p>
                  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                    Generated accounts, synthetic state, same-origin storage,
                    and no external actions.
                  </p>
                </div>
              </aside>

              <div className="min-w-0">
                <div className="p-5 md:p-7 lg:p-8">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className="bg-amber-100 text-amber-900"
                          variant="secondary"
                        >
                          Deliberately vulnerable
                        </Badge>
                        <Badge variant="outline">
                          Scenario {scenario.ordinal} / v{scenario.version}
                        </Badge>
                        <Badge variant="outline">{scenario.riskLabel}</Badge>
                      </div>
                      <p className="mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {scenario.category}
                      </p>
                      <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-0.045em] md:text-4xl">
                        {scenario.summary}
                      </h2>
                      <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
                        {scenario.expectedFinding}
                      </p>
                    </div>

                    <div className="w-full rounded-lg border border-border bg-background p-3 xl:w-[320px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Page-scoped registration
                        </span>
                        <RegistrationBadge status={webMcp.registration} />
                      </div>
                      <p className="mt-3 break-all font-mono text-[11px] font-semibold">
                        {sourceToolSuppressed &&
                        scenario.id === 'read-only-claim'
                          ? 'broad source withdrawn'
                          : scenario.tool.name}
                      </p>
                      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                        {webMcp.detail}
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 rounded-xl border border-border bg-background p-4 md:p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                      <div>
                        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Guided human + agent flow
                        </p>
                        <h3 className="mt-1 text-lg font-semibold tracking-tight">
                          Know what is offered before anything runs.
                        </h3>
                      </div>
                      <p className="max-w-lg text-xs leading-5 text-muted-foreground">
                        Detection and registration are automatic. Invocation is
                        not. Ask the agent to inspect first, then approve only
                        this harmless synthetic fixture.
                      </p>
                    </div>
                    <div className="mt-4 grid gap-1.5 sm:grid-cols-5">
                      <JourneyStep
                        number="1"
                        label="Browser support"
                        done={webMcp.browserSupport === 'supported'}
                      />
                      <JourneyStep
                        number="2"
                        label="Tool registered"
                        done={webMcp.registration === 'registered'}
                      />
                      <JourneyStep
                        number="3"
                        label="Client discovers"
                        done={webMcp.discovery === 'discovered'}
                      />
                      <JourneyStep
                        number="4"
                        label="Effect observed"
                        done={Boolean(latestReceipt)}
                      />
                      <JourneyStep
                        number="5"
                        label="Fix verified"
                        done={latestSecureReceipt?.verdict === 'PASS'}
                      />
                    </div>
                    <div className="mt-4">
                      <PreflightComparison
                        scenario={scenario}
                        assessment={riskAssessment}
                      />
                    </div>
                    <div className="mt-3">
                      <RiskRules assessment={riskAssessment} />
                    </div>
                  </div>

                  <div className="mt-8 grid gap-5 xl:grid-cols-2">
                    <div>
                      <SurfaceHeader
                        number="01"
                        label="Presented surface"
                        icon={<Activity />}
                      />
                      <div className="rounded-xl border border-border bg-muted/35 p-4 md:p-5">
                        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {scenario.presented.eyebrow}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold tracking-tight">
                          {scenario.presented.title}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {scenario.presented.description}
                        </p>
                        <div className="mt-5">
                          <PresentedFixture
                            scenario={scenario}
                            state={scenarioState}
                            noticeDraft={noticeDraft}
                            onNoticeDraftChange={setNoticeDraft}
                            webMcp={webMcp}
                          />
                        </div>
                        <div className="mt-4 flex items-center gap-2 text-[11px] font-medium text-emerald-800">
                          <CheckCircle2 className="size-3.5" />
                          {scenario.presented.apparentPromise}
                        </div>
                      </div>
                    </div>

                    <div>
                      <SurfaceHeader
                        number="02"
                        label="Declared agent surface"
                        icon={<Bot />}
                      />
                      <div className="overflow-hidden rounded-xl border border-[#26354a] bg-[#101722] text-slate-100">
                        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
                            <Braces className="size-3.5" />
                            document.modelContext
                          </div>
                          <span className="font-mono text-[9px] text-lime-300">
                            registerTool()
                          </span>
                        </div>
                        <pre className="max-h-[420px] overflow-auto p-4 font-mono text-[10px] leading-5 text-slate-200 md:p-5">
                          {JSON.stringify(scenario.tool, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-xl border border-border bg-background p-4 md:p-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="max-w-2xl">
                        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Choose how to verify
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          Discovery checks never execute the tool. A genuine
                          WebMCP self-test and the fallback harness both require
                          explicit approval and are labeled separately in
                          evidence.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={resetScenario}
                          disabled={running}
                        >
                          <RefreshCw data-icon="inline-start" />
                          Reset fixture
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => void checkDiscovery()}
                          disabled={
                            running || webMcp.registration !== 'registered'
                          }
                        >
                          <ScanSearch data-icon="inline-start" />
                          Check discovery only
                        </Button>
                        <Button
                          onClick={() => {
                            setConfirmationMode('webmcp-self-test');
                            setConfirmOpen(true);
                          }}
                          disabled={
                            running || webMcp.registration !== 'registered'
                          }
                        >
                          <Radio data-icon="inline-start" />
                          WebMCP self-test
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setConfirmationMode('lab-harness');
                            setConfirmOpen(true);
                          }}
                          disabled={running}
                        >
                          <FlaskConical data-icon="inline-start" />
                          {running ? 'Running…' : 'Fallback harness'}
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                      <ObservationCell
                        label="Browser API"
                        value={webMcp.browserSupport}
                      />
                      <ObservationCell
                        label="Registration"
                        value={webMcp.registration}
                      />
                      <ObservationCell
                        label="Policy"
                        value={webMcp.permissionsPolicy}
                      />
                      <ObservationCell
                        label="Discovery"
                        value={webMcp.discovery}
                      />
                      <ObservationCell
                        label="Invocation"
                        value={webMcp.invocation}
                      />
                    </div>
                    {executionMessage ? (
                      <output
                        aria-live="polite"
                        className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground"
                      >
                        <Info className="mt-0.5 size-3.5 shrink-0" />
                        {executionMessage}
                      </output>
                    ) : null}
                  </div>
                </div>

                <EvidencePanel
                  scenario={scenario}
                  receipt={latestReceipt}
                  persistence={persistence}
                  onExport={(receipt) =>
                    setExportArtifact(createEvidenceReceiptArtifact(receipt))
                  }
                />
                <SecureComparison
                  scenario={scenario}
                  assessment={riskAssessment}
                  confirmationCopy={secureConfirmationCopy}
                  receipt={latestSecureReceipt}
                  persistence={securePersistence}
                  running={secureRunning}
                  onRetest={() => void runSecureRetest()}
                  onExportPolicy={() =>
                    setExportArtifact(
                      createPolicyJsonArtifact(scenario, riskAssessment),
                    )
                  }
                />
              </div>
            </div>
          </details>
        </div>
      </section>

      <LedgerPanel
        receipts={ledger}
        onExport={(receipt) =>
          setExportArtifact(createEvidenceReceiptArtifact(receipt))
        }
      />

      <section
        id="safety"
        className="border-y border-border bg-foreground text-background"
      >
        <div className="mx-auto grid max-w-[1480px] gap-8 px-5 py-12 lg:grid-cols-[0.75fr_1.25fr] lg:px-8 lg:py-16">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-background/55">
              Safety statement
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
              Vulnerable on purpose. Harmless by design.
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              'Generated training identities only',
              'No credentials or real accounts',
              'No email, purchase, or external mutation',
              'Session-scoped fixtures; private exportable receipts',
            ].map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-lg border border-white/14 bg-white/5 p-4 text-sm leading-6 text-background/78"
              >
                <CheckCircle2 className="mt-1 size-4 shrink-0 text-lime-300" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1480px] flex-col gap-5 px-5 py-8 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <p className="font-semibold text-foreground">
            Left Out Security · WebMCP Security Lab
          </p>
          <p className="mt-1">
            MIT licensed. Built as a controlled educational test range.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <a
            className="footer-link"
            href="https://github.com/webmachinelearning/webmcp"
            target="_blank"
            rel="noreferrer"
          >
            WebMCP proposal <ExternalLink className="size-3" />
          </a>
          <a
            className="footer-link"
            href="https://developer.chrome.com/docs/ai/webmcp"
            target="_blank"
            rel="noreferrer"
          >
            Browser support notes <ExternalLink className="size-3" />
          </a>
          <a
            className="footer-link"
            href="https://github.com/savage-content/webmcp-security-lab"
            target="_blank"
            rel="noreferrer"
          >
            Source <ExternalLink className="size-3" />
          </a>
        </div>
      </footer>

      <ArtifactExportDialog
        artifact={exportArtifact}
        onClose={() => setExportArtifact(undefined)}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="sm:max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-amber-100 text-amber-900">
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {confirmationMode === 'webmcp-self-test'
                ? `Approve WebMCP self-test: ${scenario.presented.confirmationTitle}`
                : scenario.presented.confirmationTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {scenario.presented.confirmationCopy}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <PreflightComparison
            scenario={scenario}
            assessment={riskAssessment}
            compact
          />
          <div className="rounded-md border border-dashed border-border bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
            {confirmationMode === 'webmcp-self-test'
              ? 'This requests the selected tool through document.modelContext.executeTool() only after approval. Because the shared callback cannot distinguish a competing client call, its receipt records browser confirmation as unobservable.'
              : 'This uses the explicit fallback harness. It is useful for education, but it is never reported as WebMCP discovery or invocation.'}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void (confirmationMode === 'webmcp-self-test'
                  ? runWebMcpSelfTest()
                  : runManualHarness())
              }
            >
              {confirmationMode === 'webmcp-self-test'
                ? 'Approve WebMCP run'
                : scenario.presented.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function SurfaceHeader({
  number,
  label,
  icon,
}: {
  number: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">
        {number}
      </span>
    </div>
  );
}

function JourneyStep({
  number,
  label,
  done,
}: {
  number: string;
  label: string;
  done: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        done ? 'border-emerald-700/25 bg-emerald-50' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] text-muted-foreground">
          {number}
        </span>
        <span
          className={`size-1.5 rounded-full ${done ? 'bg-emerald-600' : 'bg-muted-foreground/40'}`}
        />
      </div>
      <div className="mt-3 text-[11px] font-semibold leading-4">{label}</div>
    </div>
  );
}

function RegistrationBadge({
  status,
}: {
  status: WebMcpStatus['registration'];
}) {
  const good = status === 'registered';
  const warning =
    status === 'unsupported' ||
    status === 'unregistered' ||
    status === 'denied' ||
    status === 'error';
  return (
    <span
      className={`flex items-center gap-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] ${good ? 'text-emerald-700' : warning ? 'text-amber-800' : 'text-muted-foreground'}`}
    >
      <span
        className={`size-1.5 rounded-full ${good ? 'bg-emerald-600' : warning ? 'bg-amber-600' : 'bg-muted-foreground'}`}
      />
      {status}
    </span>
  );
}

function ObservationCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[10px] font-semibold">{value}</span>
    </div>
  );
}
