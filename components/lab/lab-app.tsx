'use client';

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Braces,
  CheckCircle2,
  Code2,
  ExternalLink,
  FlaskConical,
  Info,
  Radio,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
  TerminalSquare,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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
import { createEvidenceReceipt, downloadEvidenceReceipt } from '@/lib/lab/evidence';
import { runScenario } from '@/lib/lab/engine';
import {
  defaultScenarioId,
  scenarioById,
  scenarios,
} from '@/lib/lab/scenarios';
import type {
  ConfirmationEvidence,
  EvidenceReceipt,
  InvocationChannel,
  JsonValue,
  ScenarioId,
  ToolDeclaration,
  WebMcpStatus,
} from '@/lib/lab/types';

import {
  EvidencePanel,
  type PersistenceState,
  SecureComparison,
} from './evidence-panel';
import { LedgerPanel } from './ledger-panel';
import { PresentedFixture } from './presented-fixture';

interface RegisteredWebMcpTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
}

interface ModelContextApi {
  registerTool: (
    tool: ToolDeclaration & {
      execute: (input: unknown, client?: { signal?: AbortSignal }) => Promise<string>;
    },
    options?: { signal?: AbortSignal },
  ) => Promise<void> | void;
  getTools?: () => Promise<RegisteredWebMcpTool[]>;
  executeTool?: (
    tool: RegisteredWebMcpTool,
    input: string,
    options?: { signal?: AbortSignal },
  ) => Promise<string | null>;
}

type StateMap = Record<ScenarioId, Record<string, JsonValue>>;
type ReceiptMap = Partial<Record<ScenarioId, EvidenceReceipt>>;
const SESSION_STORAGE_KEY = 'left-out-webmcp-lab-session';

const surfaceDefinitions = [
  {
    number: '01',
    label: 'Presented',
    title: 'What the human sees',
    detail: 'Labels, controls, confirmation words, and visible state.',
  },
  {
    number: '02',
    label: 'Declared',
    title: 'What the agent receives',
    detail: 'Tool identity, description, schema, and annotations.',
  },
  {
    number: '03',
    label: 'Effective',
    title: 'What the code does',
    detail: 'Invocation, raw result, state changes, and durable evidence.',
  },
];

const initialWebMcpStatus: WebMcpStatus = {
  api: 'document.modelContext',
  registration: 'checking',
  permissionsPolicy: 'unknown',
  discovery: 'not-checked',
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

function getModelContext(): ModelContextApi | undefined {
  if (typeof document === 'undefined') return undefined;
  return (document as Document & { modelContext?: ModelContextApi }).modelContext;
}

function getPermissionState(): WebMcpStatus['permissionsPolicy'] {
  if (typeof document === 'undefined') return 'unknown';
  const policy = (
    document as Document & {
      permissionsPolicy?: { allowsFeature: (feature: string) => boolean };
      featurePolicy?: { allowsFeature: (feature: string) => boolean };
    }
  ).permissionsPolicy ??
    (
      document as Document & {
        featurePolicy?: { allowsFeature: (feature: string) => boolean };
      }
    ).featurePolicy;

  if (!policy?.allowsFeature) return 'unknown';

  try {
    return policy.allowsFeature('tools') ? 'allowed' : 'blocked';
  } catch {
    return 'unknown';
  }
}

function normalizeArguments(input: unknown): Record<string, JsonValue> {
  if (typeof input === 'string') {
    const parsed = JSON.parse(input) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('WebMCP arguments must be a JSON object.');
    }
    return parsed as Record<string, JsonValue>;
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('WebMCP arguments must be an object.');
  }

  return input as Record<string, JsonValue>;
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
  if (typeof value === 'number' || typeof value === 'boolean') return `${value}`;
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
  const [selectedId, setSelectedId] = useState<ScenarioId>(defaultScenarioId);
  const [stateMap, setStateMap] = useState<StateMap>(buildInitialStateMap);
  const stateMapRef = useRef(stateMap);
  const [receiptMap, setReceiptMap] = useState<ReceiptMap>({});
  const [persistence, setPersistence] = useState<PersistenceState>('idle');
  const [ledger, setLedger] = useState<EvidenceReceipt[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [ledgerUnavailable, setLedgerUnavailable] = useState(false);
  const [webMcp, setWebMcp] = useState<WebMcpStatus>(initialWebMcpStatus);
  const webMcpRef = useRef(webMcp);
  const [clientLabel, setClientLabel] = useState('This browser session');
  const [noticeDraft, setNoticeDraft] = useState(
    stateText(scenarioById['over-broad-schema'].initialState.notice),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [executionMessage, setExecutionMessage] = useState('');
  const selfTestPendingRef = useRef(false);
  const [sessionId, setSessionId] = useState('');
  const sessionIdRef = useRef('');

  const scenario = scenarioById[selectedId];
  const scenarioState = stateMap[selectedId];
  const latestReceipt = receiptMap[selectedId];

  const commitWebMcp = useCallback(
    (
      update:
        | WebMcpStatus
        | ((previous: WebMcpStatus) => WebMcpStatus),
    ) => {
      setWebMcp((previous) => {
        const next = typeof update === 'function' ? update(previous) : update;
        webMcpRef.current = next;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    stateMapRef.current = stateMap;
  }, [stateMap]);

  useEffect(() => {
    let active = true;
    const userAgent = navigator.userAgent ?? '';
    const storedSessionId = getOrCreateSessionId();
    queueMicrotask(() => {
      if (!active) return;
      setClientLabel(describeBrowser(userAgent));
      sessionIdRef.current = storedSessionId;
      setSessionId(storedSessionId);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function loadLedger() {
      try {
        const response = await fetch('/api/evidence?limit=12', {
          cache: 'no-store',
          headers: { 'X-Lab-Session': sessionId },
        });
        if (!response.ok) throw new Error('Ledger request failed.');
        const body = (await response.json()) as { receipts: EvidenceReceipt[] };
        if (!cancelled) {
          setLedger(body.receipts);
          setLedgerUnavailable(false);
        }
      } catch {
        if (!cancelled) setLedgerUnavailable(true);
      } finally {
        if (!cancelled) setLedgerLoading(false);
      }
    }

    void loadLedger();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

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
      const argumentsValue = normalizeArguments(input);
      const now = new Date().toISOString();
      const currentState = stateMapRef.current[scenario.id];
      const currentWebMcp = webMcpRef.current;
      const outcome = runScenario(
        scenario.id,
        currentState,
        argumentsValue,
        {
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
              ).userAgentData?.platform ?? navigator.platform ?? '',
          },
          clientLabel,
          webMcp: currentWebMcp,
          confirmation,
        },
      );

      const nextStateMap = {
        ...stateMapRef.current,
        [scenario.id]: outcome.after,
      };
      stateMapRef.current = nextStateMap;
      setStateMap(nextStateMap);

      const receipt = createEvidenceReceipt({
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
              ).userAgentData?.platform ?? navigator.platform ?? '',
          },
          clientLabel,
          webMcp: currentWebMcp,
          confirmation,
        },
        outcome,
      });

      setReceiptMap((current) => ({ ...current, [scenario.id]: receipt }));
      setPersistence('saving');

      let persisted = false;
      try {
        const response = await fetch('/api/evidence', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Lab-Session': receipt.sessionId,
          },
          body: JSON.stringify(receipt),
        });
        if (!response.ok) throw new Error('Evidence append failed.');
        const body = (await response.json()) as {
          receipt: EvidenceReceipt;
          persisted: boolean;
        };
        persisted = body.persisted;
        setPersistence('saved');
        setLedgerUnavailable(false);
        setLedger((current) => [
          body.receipt,
          ...current.filter((item) => item.id !== body.receipt.id),
        ]);
      } catch {
        setPersistence('error');
      }

      setExecutionMessage(
        persisted
          ? `Run ${receipt.id.slice(0, 8)} appended to the evidence ledger.`
          : `Run ${receipt.id.slice(0, 8)} completed, but durable storage was unavailable.`,
      );

      window.setTimeout(() => {
        document
          .getElementById('evidence')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);

      return JSON.stringify({
        lab: 'Left Out Security WebMCP Security Lab',
        scenario: scenario.id,
        result: outcome.rawResult,
        evidence: {
          receipt_id: receipt.id,
          persisted,
          verdict: outcome.verdict,
        },
      });
    },
    [clientLabel, scenario],
  );

  const invokeRef = useRef(invokeScenario);
  useEffect(() => {
    invokeRef.current = invokeScenario;
  }, [invokeScenario]);

  useEffect(() => {
    const controller = new AbortController();
    const modelContext = getModelContext();
    const permissionsPolicy = getPermissionState();

    if (!modelContext?.registerTool) {
      commitWebMcp({
        api: 'document.modelContext',
        registration: 'unsupported',
        permissionsPolicy,
        discovery: 'unsupported',
        detail:
          'document.modelContext is not exposed in this browser. The lab harness remains available, but is not represented as WebMCP.',
        discoveredToolNames: [],
      });
      return () => controller.abort();
    }

    if (permissionsPolicy === 'blocked') {
      commitWebMcp({
        api: 'document.modelContext',
        registration: 'denied',
        permissionsPolicy,
        discovery: 'not-checked',
        detail: 'The browser exposes WebMCP, but the tools permissions policy blocks registration.',
        discoveredToolNames: [],
      });
      return () => controller.abort();
    }

    commitWebMcp({
      api: 'document.modelContext',
      registration: 'registering',
      permissionsPolicy,
      discovery: 'not-checked',
      detail: `Registering ${scenario.tool.name} on this document.`,
      discoveredToolNames: [],
    });

    const registeredTool = {
      ...scenario.tool,
      execute: async (input: unknown) => {
        const selfTest = selfTestPendingRef.current;
        return invokeRef.current(
          input,
          selfTest ? 'webmcp-self-test' : 'webmcp',
          selfTest
            ? {
                presentedCopy: scenario.presented.confirmationCopy,
                known: true,
                approved: true,
                source: 'webmcp-self-test',
              }
            : {
                presentedCopy: scenario.presented.confirmationCopy,
                known: false,
                approved: null,
                source: 'browser-not-observable',
              },
        );
      },
    };

    Promise.resolve(
      modelContext.registerTool(registeredTool, { signal: controller.signal }),
    )
      .then(() => {
        if (controller.signal.aborted) return;
        commitWebMcp((current) => ({
          ...current,
          registration: 'registered',
          detail: `${scenario.tool.name} is registered on document.modelContext. Client discovery is still a separate observation.`,
        }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const denied =
          error instanceof DOMException && error.name === 'NotAllowedError';
        commitWebMcp((current) => ({
          ...current,
          registration: denied ? 'denied' : 'error',
          detail: denied
            ? 'Registration was denied by browser policy.'
            : `Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }));
      });

    return () => controller.abort();
  }, [commitWebMcp, scenario]);

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

  const discoverAndInvoke = useCallback(async () => {
    const modelContext = getModelContext();
    if (!modelContext?.getTools || !modelContext.executeTool) {
      commitWebMcp((current) => ({
        ...current,
        discovery: 'unsupported',
        detail:
          'This browser does not expose the in-page getTools/executeTool path. No client support is inferred.',
      }));
      return;
    }

    setRunning(true);
    try {
      const tools = await modelContext.getTools();
      const names = tools.map((tool) => tool.name);
      const selectedTool = tools.find((tool) => tool.name === scenario.tool.name);
      const nextStatus: WebMcpStatus = {
        ...webMcpRef.current,
        discovery: selectedTool ? 'discovered' : 'not-discovered',
        detail: selectedTool
          ? `${scenario.tool.name} was discovered by the same-origin in-page API.`
          : `${scenario.tool.name} was registered but not returned to this in-page caller.`,
        discoveredToolNames: names,
      };
      commitWebMcp(nextStatus);

      if (!selectedTool) return;
      selfTestPendingRef.current = true;
      await modelContext.executeTool(
        selectedTool,
        JSON.stringify(buildArguments()),
      );
    } catch (error) {
      commitWebMcp((current) => ({
        ...current,
        discovery: 'error',
        detail: `Discovery or self-test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }));
    } finally {
      selfTestPendingRef.current = false;
      setRunning(false);
    }
  }, [buildArguments, commitWebMcp, scenario.tool.name]);

  const resetScenario = useCallback(() => {
    const nextStateMap = {
      ...stateMapRef.current,
      [scenario.id]: structuredClone(scenario.initialState),
    };
    stateMapRef.current = nextStateMap;
    setStateMap(nextStateMap);
    setReceiptMap((current) => {
      const next = { ...current };
      delete next[scenario.id];
      return next;
    });
    setPersistence('idle');
    setExecutionMessage(
      'Fixture state reset. Existing evidence receipts were preserved.',
    );
    if (scenario.id === 'over-broad-schema') {
      setNoticeDraft(stateText(scenario.initialState.notice));
    }
  }, [scenario]);

  const registrationTone = useMemo(() => {
    if (webMcp.registration === 'registered') return 'good';
    if (
      webMcp.registration === 'unsupported' ||
      webMcp.registration === 'denied' ||
      webMcp.registration === 'error'
    )
      return 'warn';
    return 'muted';
  }, [webMcp.registration]);

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
              <p className="text-sm font-semibold tracking-tight">WebMCP Test Range</p>
            </div>
          </a>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Primary navigation">
            <a className="nav-link" href="#range">Run the range</a>
            <a className="nav-link" href="#ledger">Evidence ledger</a>
            <a className="nav-link" href="#safety">Safety</a>
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

      <section
        id="top"
        className="border-b border-border bg-[linear-gradient(to_right,var(--grid-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-line)_1px,transparent_1px)] bg-[size:28px_28px]"
      >
        <div className="mx-auto grid max-w-[1480px] gap-10 px-5 py-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)] lg:px-8 lg:py-16">
          <div className="max-w-4xl">
            <div className="mb-5 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-800">
              <Radio className="size-3.5" aria-hidden="true" />
              Live educational security range
            </div>
            <h1 className="max-w-4xl text-balance text-[clamp(3rem,7vw,6.8rem)] font-semibold leading-[0.88] tracking-[-0.065em]">
              Trust the effect,
              <span className="block text-muted-foreground">not the label.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-pretty text-base leading-7 text-muted-foreground lg:text-lg">
              A controlled test range for proving whether the interface a human
              sees, the capability an agent receives, and the behavior a tool
              performs actually match.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                className="h-11 px-4"
                onClick={() => document.getElementById('range')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <FlaskConical data-icon="inline-start" />
                Enter the range
                <ArrowRight data-icon="inline-end" />
              </Button>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="size-4 text-emerald-700" />
                Five isolated, resettable fixtures
              </span>
            </div>
          </div>

          <div className="self-end rounded-xl border border-foreground bg-card p-3 shadow-[6px_6px_0_0_var(--foreground)]">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <TerminalSquare className="size-3.5" aria-hidden="true" />
                Range status
              </div>
              <span className="font-mono text-[9px] text-muted-foreground">SESSION / LIVE</span>
            </div>
            <div className="grid gap-2 p-3 sm:grid-cols-3">
              <StatusMetric value="05" label="Fixtures" />
              <StatusMetric value="ON" label="Safe mode" tone="good" />
              <StatusMetric
                value={
                  webMcp.registration === 'registered'
                    ? 'READY'
                    : webMcp.registration === 'unsupported'
                      ? 'N/A'
                      : '…'
                }
                label="WebMCP"
                tone={registrationTone}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1480px] px-5 py-10 lg:px-8 lg:py-14">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              The security method
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">
              Three surfaces. One security truth.
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            Names and approval words are claims. Before/after state and observed
            effects are evidence.
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
              <h3 className="text-lg font-semibold tracking-tight">{surface.title}</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {surface.detail}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section id="range" className="mx-auto max-w-[1480px] scroll-mt-20 px-5 pb-8 lg:px-8 lg:pb-12">
        <div className="overflow-hidden rounded-xl border border-foreground bg-card shadow-[7px_7px_0_0_var(--accent-strong)]">
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
                      setSelectedId(item.id);
                      setPersistence(receiptMap[item.id] ? 'saved' : 'idle');
                      setExecutionMessage('');
                    }}
                  >
                    <span className="font-mono text-[10px] opacity-60">{item.ordinal}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{item.shortTitle}</span>
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
                  Generated accounts, synthetic state, same-origin storage, and no external actions.
                </p>
              </div>
            </aside>

            <div className="min-w-0">
              <div className="p-5 md:p-7 lg:p-8">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-amber-100 text-amber-900" variant="secondary">
                        Deliberately vulnerable
                      </Badge>
                      <Badge variant="outline">Scenario {scenario.ordinal} / v{scenario.version}</Badge>
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
                      {scenario.tool.name}
                    </p>
                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                      {webMcp.detail}
                    </p>
                  </div>
                </div>

                <div className="mt-8 grid gap-5 xl:grid-cols-2">
                  <div>
                    <SurfaceHeader number="01" label="Presented surface" icon={<Activity />} />
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
                    <SurfaceHeader number="02" label="Declared agent surface" icon={<Bot />} />
                    <div className="overflow-hidden rounded-xl border border-[#26354a] bg-[#101722] text-slate-100">
                      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
                          <Braces className="size-3.5" />
                          document.modelContext
                        </div>
                        <span className="font-mono text-[9px] text-lime-300">registerTool()</span>
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
                        Invoke the same scenario handler
                      </p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        The WebMCP path uses the tool registered above. The lab harness is an explicit fallback for unsupported browsers and is never presented as agent discovery.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" onClick={resetScenario} disabled={running}>
                        <RefreshCw data-icon="inline-start" />
                        Reset fixture
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void discoverAndInvoke()}
                        disabled={running || webMcp.registration !== 'registered'}
                      >
                        <ScanSearch data-icon="inline-start" />
                        Discover & invoke
                      </Button>
                      <Button onClick={() => setConfirmOpen(true)} disabled={running}>
                        <FlaskConical data-icon="inline-start" />
                        {running ? 'Running…' : 'Run via lab harness'}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <ObservationCell label="Registration" value={webMcp.registration} />
                    <ObservationCell label="Policy" value={webMcp.permissionsPolicy} />
                    <ObservationCell label="Discovery" value={webMcp.discovery} />
                  </div>
                  {executionMessage ? (
                    <output aria-live="polite" className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
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
                onDownload={downloadEvidenceReceipt}
              />
              <SecureComparison scenario={scenario} />
            </div>
          </div>
        </div>
      </section>

      <LedgerPanel
        receipts={ledger}
        loading={ledgerLoading}
        unavailable={ledgerUnavailable}
        onDownload={downloadEvidenceReceipt}
      />

      <section id="safety" className="border-y border-border bg-foreground text-background">
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
              'Session-scoped fixtures; append-only receipts',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-lg border border-white/14 bg-white/5 p-4 text-sm leading-6 text-background/78">
                <CheckCircle2 className="mt-1 size-4 shrink-0 text-lime-300" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1480px] flex-col gap-5 px-5 py-8 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <p className="font-semibold text-foreground">Left Out Security · WebMCP Security Lab</p>
          <p className="mt-1">MIT licensed. Built as a controlled educational test range.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <a className="footer-link" href="https://github.com/webmachinelearning/webmcp" target="_blank" rel="noreferrer">
            WebMCP proposal <ExternalLink className="size-3" />
          </a>
          <a className="footer-link" href="https://developer.chrome.com/docs/ai/webmcp" target="_blank" rel="noreferrer">
            Browser support notes <ExternalLink className="size-3" />
          </a>
          <a className="footer-link" href="https://github.com/savage-content/webmcp-security-lab" target="_blank" rel="noreferrer">
            Source <ExternalLink className="size-3" />
          </a>
        </div>
      </footer>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-amber-100 text-amber-900">
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>{scenario.presented.confirmationTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {scenario.presented.confirmationCopy}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border border-dashed border-border bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
            Lab note: this approval copy is evidence. The handler’s actual effect may differ.
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runManualHarness()}>
              {scenario.presented.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function SurfaceHeader({ number, label, icon }: { number: string; label: string; icon: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">{number}</span>
    </div>
  );
}

function StatusMetric({ value, label, tone = 'muted' }: { value: string; label: string; tone?: 'good' | 'warn' | 'muted' }) {
  const toneClass = tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-800' : '';
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className={`font-mono text-lg font-semibold tracking-tight ${toneClass}`}>{value}</div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
    </div>
  );
}

function RegistrationBadge({ status }: { status: WebMcpStatus['registration'] }) {
  const good = status === 'registered';
  const warning = status === 'unsupported' || status === 'denied' || status === 'error';
  return (
    <span className={`flex items-center gap-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] ${good ? 'text-emerald-700' : warning ? 'text-amber-800' : 'text-muted-foreground'}`}>
      <span className={`size-1.5 rounded-full ${good ? 'bg-emerald-600' : warning ? 'bg-amber-600' : 'bg-muted-foreground'}`} />
      {status}
    </span>
  );
}

function ObservationCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">{label}</span>
      <span className="font-mono text-[10px] font-semibold">{value}</span>
    </div>
  );
}
