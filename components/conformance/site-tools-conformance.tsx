'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { getModelContext } from '@/lib/lab/webmcp';
import {
  SITE_TOOLS_CONFORMANCE_VERSION,
  classifyConformanceObservation,
  conformanceCases,
  type ConformanceCaseId,
  type ConformanceObservation,
  type ConformanceVerdict,
  type ExecutionSurface,
  type ObservationState,
  type SiteToolsModel,
  type WorkspaceClass,
} from '@/lib/site-tools/conformance';

type RegistrationState = ConformanceObservation['page']['registration'];

const fixedResult = {
  fixture: 'leftout-site-tools-conformance',
  result: 'synthetic-ping-ok',
} as const;

function shortId(id: string) {
  return id.replaceAll('-', '').slice(0, 12);
}

function verdictTone(verdict: ConformanceVerdict) {
  if (verdict === 'PASS' || verdict === 'EXPECTED_NEGATIVE') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-950';
  }
  if (verdict === 'FAIL') return 'border-red-300 bg-red-50 text-red-950';
  return 'border-amber-300 bg-amber-50 text-amber-950';
}

function ObservationButtons({
  value,
  onChange,
}: {
  value: ObservationState;
  onChange: (value: ObservationState) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-2"
      aria-label="Record client observation"
    >
      <Button
        type="button"
        size="sm"
        variant={value === 'observed' ? 'default' : 'outline'}
        onClick={() => onChange('observed')}
      >
        Agent found it
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === 'not-observed' ? 'default' : 'outline'}
        onClick={() => onChange('not-observed')}
      >
        Agent did not find it
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => onChange('unknown')}
      >
        Clear
      </Button>
    </div>
  );
}

export function SiteToolsConformance() {
  const [sessionId, setSessionId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [registrationId, setRegistrationId] = useState('');
  const [model, setModel] = useState<SiteToolsModel>('unknown');
  const [workspace, setWorkspace] = useState<WorkspaceClass>('unknown');
  const [executionSurface, setExecutionSurface] = useState<ExecutionSurface>(
    'chatgpt-built-in-browser',
  );
  const [appVersion, setAppVersion] = useState('');
  const [apiSupport, setApiSupport] =
    useState<ConformanceObservation['page']['apiSupport']>('unknown');
  const [registration, setRegistration] =
    useState<RegistrationState>('not-attempted');
  const [baselineDiscovery, setBaselineDiscovery] =
    useState<ObservationState>('unknown');
  const [baselineInvocation, setBaselineInvocation] =
    useState<ObservationState>('unknown');
  const [browserSafetyReview, setBrowserSafetyReview] =
    useState<ObservationState>('unknown');
  const [replacementInvocation, setReplacementInvocation] =
    useState<ObservationState>('unknown');
  const [staleInvocation, setStaleInvocation] =
    useState<ObservationState>('unknown');
  const [controlObservations, setControlObservations] = useState<
    Record<'declarative' | 'iframe' | 'luna', ObservationState>
  >({ declarative: 'unknown', iframe: 'unknown', luna: 'unknown' });
  const [frameRegistration, setFrameRegistration] =
    useState<RegistrationState>('not-attempted');
  const [message, setMessage] = useState(
    'Record the exact environment before interpreting availability.',
  );
  const activeController = useRef<AbortController | undefined>(undefined);
  const activeRegistration = useRef(registrationId);

  useEffect(() => {
    const supported = Boolean(getModelContext()?.registerTool);
    queueMicrotask(() => {
      setSessionId(crypto.randomUUID());
      setDocumentId(crypto.randomUUID());
      const firstRegistrationId = crypto.randomUUID();
      setRegistrationId(firstRegistrationId);
      activeRegistration.current = firstRegistrationId;
      setApiSupport(supported ? 'supported' : 'unsupported');
    });
    return () => activeController.current?.abort();
  }, []);

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const value = event.data as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const record = value as Record<string, unknown>;
      if (
        record.type !== 'leftout-conformance-frame-status' ||
        record.documentId !== documentId
      ) {
        return;
      }
      if (record.registration === 'registered') {
        setFrameRegistration('registered');
      } else if (record.registration === 'denied') {
        setFrameRegistration('denied');
      } else {
        setFrameRegistration('failed');
      }
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [documentId]);

  const provenance = useMemo(
    () => ({
      model,
      workspace,
      executionSurface,
      appVersion: appVersion.trim(),
      sessionId,
      documentId,
      registrationId,
      observedAt: new Date().toISOString(),
    }),
    [
      appVersion,
      documentId,
      executionSurface,
      model,
      registrationId,
      sessionId,
      workspace,
    ],
  );

  const baselineObservation = useMemo<ConformanceObservation>(
    () => ({
      caseId: 'C01-top-level-imperative',
      provenance,
      page: { apiSupport, registration },
      client: {
        discovery:
          baselineInvocation === 'observed' ? 'observed' : baselineDiscovery,
        invocation: baselineInvocation,
      },
      browserSafetyReview,
      positiveBaselineInSameSession: false,
    }),
    [
      apiSupport,
      baselineDiscovery,
      baselineInvocation,
      browserSafetyReview,
      provenance,
      registration,
    ],
  );
  const baselineResult = classifyConformanceObservation(baselineObservation);
  const positiveBaseline = baselineResult.verdict === 'PASS';

  const resultFor = useCallback(
    (caseId: ConformanceCaseId) => {
      const common: ConformanceObservation = {
        caseId,
        provenance,
        page: { apiSupport, registration },
        client: { discovery: 'unknown', invocation: 'unknown' },
        browserSafetyReview,
        positiveBaselineInSameSession: positiveBaseline,
      };
      if (caseId === 'C01-top-level-imperative') return baselineResult;
      if (caseId === 'C02-registration-binding') {
        return classifyConformanceObservation({
          ...common,
          client: {
            discovery:
              replacementInvocation === 'observed' ? 'observed' : 'unknown',
            invocation: replacementInvocation,
          },
          staleRegistrationInvocation: staleInvocation,
        });
      }
      if (caseId === 'C04-declarative-unsupported') {
        return classifyConformanceObservation({
          ...common,
          client: {
            discovery: controlObservations.declarative,
            invocation: controlObservations.declarative,
          },
        });
      }
      if (caseId === 'C05-iframe-unsupported') {
        return classifyConformanceObservation({
          ...common,
          client: {
            discovery: controlObservations.iframe,
            invocation: controlObservations.iframe,
          },
        });
      }
      if (caseId === 'C06-luna-negative-control') {
        return classifyConformanceObservation({
          ...common,
          client: {
            discovery: controlObservations.luna,
            invocation: controlObservations.luna,
          },
        });
      }
      return classifyConformanceObservation({
        ...common,
        previousDocumentInvocation: 'unknown',
      });
    },
    [
      apiSupport,
      baselineResult,
      browserSafetyReview,
      controlObservations,
      positiveBaseline,
      provenance,
      registration,
      replacementInvocation,
      staleInvocation,
    ],
  );

  const registerTool = useCallback(
    async (replacement = false) => {
      const modelContext = getModelContext();
      if (!modelContext?.registerTool) {
        setApiSupport('unsupported');
        setRegistration('not-attempted');
        setMessage(
          'This page does not expose document.modelContext. That is an availability observation, not a security failure.',
        );
        return;
      }

      const previousId = activeRegistration.current;
      activeController.current?.abort();
      const nextId = replacement ? crypto.randomUUID() : registrationId;
      if (replacement) {
        setRegistrationId(nextId);
        setReplacementInvocation('unknown');
        setStaleInvocation('unknown');
      } else {
        setBaselineDiscovery('unknown');
        setBaselineInvocation('unknown');
      }
      activeRegistration.current = nextId;
      const controller = new AbortController();
      activeController.current = controller;
      const name = `los_conformance_ping_${shortId(nextId)}`;
      setRegistration('not-attempted');
      try {
        await modelContext.registerTool(
          {
            name,
            title: replacement
              ? 'Left Out current registration control'
              : 'Left Out top-level Site Tools baseline',
            description:
              'Return a fixed synthetic conformance value. No inputs, mutation, network request, or follow-on action.',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
              additionalProperties: false,
            },
            annotations: {
              readOnlyHint: true,
              untrustedContentHint: false,
            },
            execute: async () => {
              if (activeRegistration.current !== nextId) {
                setStaleInvocation('observed');
                throw new Error('Withdrawn registration rejected.');
              }
              if (replacement) {
                setReplacementInvocation('observed');
              } else {
                setBaselineDiscovery('observed');
                setBaselineInvocation('observed');
              }
              return {
                ...fixedResult,
                session_id: sessionId,
                document_id: documentId,
                registration_id: nextId,
              };
            },
          },
          { signal: controller.signal },
        );
        setRegistration('registered');
        setMessage(
          replacement
            ? `Registration A (${shortId(previousId)}) was withdrawn. Registration B (${shortId(nextId)}) is current.`
            : `${name} is registered on this top-level document. Registration alone does not prove client discovery.`,
        );
      } catch (error) {
        const denied =
          error &&
          typeof error === 'object' &&
          'name' in error &&
          String(error.name) === 'NotAllowedError';
        setRegistration(denied ? 'denied' : 'failed');
        setMessage(
          denied
            ? 'The browser denied page registration.'
            : `Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
    [documentId, registrationId, sessionId],
  );

  function prepareNavigationCheck() {
    sessionStorage.setItem(
      'leftout-site-tools-navigation-control',
      JSON.stringify({
        version: SITE_TOOLS_CONFORMANCE_VERSION,
        sessionId,
        documentId,
        registrationId,
        model,
        workspace,
        executionSurface,
        appVersion: appVersion.trim(),
        positiveBaseline,
      }),
    );
    window.location.assign('/conformance/blank');
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-800">
              Left Out Security · Advanced test family
            </p>
            <h1 className="mt-1 text-xl font-semibold">
              Site Tools conformance
            </h1>
          </div>
          <Link
            className="inline-flex items-center gap-2 text-sm font-semibold"
            href="/"
          >
            <ArrowLeft className="size-4" /> Beginner lessons
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1380px] px-5 py-8 lg:px-8 lg:py-12">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div>
            <Badge variant="outline">
              Version {SITE_TOOLS_CONFORMANCE_VERSION}
            </Badge>
            <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              Prove each support stage. Do not collapse them into “works.”
            </h2>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
              This suite measures ChatGPT Site Tools in the built-in browser. It
              records page API support, registration, policy, client discovery,
              invocation, model, workspace, document, and session as separate
              evidence. Experimental browser-guard research is future work and
              is not evidence for this native Site Tools suite.
            </p>
          </div>
          <Alert className="border-amber-300 bg-amber-50 p-4 text-amber-950">
            <AlertTriangle />
            <AlertTitle>Operator-declared context</AlertTitle>
            <AlertDescription className="text-amber-900">
              The page cannot verify the selected model, workspace, app build,
              client discovery, or browser safety-review UI. Record only what
              you actually observe. Missing context stays inconclusive.
            </AlertDescription>
          </Alert>
        </section>

        <section className="mt-8 overflow-hidden rounded-xl border border-foreground bg-card">
          <div className="border-b border-border p-5 sm:p-6">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-800">
              Preflight
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              Freeze the environment under test
            </h2>
          </div>
          <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
            <label
              htmlFor="conformance-surface"
              className="text-sm font-semibold"
            >
              Execution surface
              <NativeSelect
                id="conformance-surface"
                className="mt-2 w-full"
                value={executionSurface}
                onChange={(event) =>
                  setExecutionSurface(event.target.value as ExecutionSurface)
                }
              >
                <NativeSelectOption value="chatgpt-built-in-browser">
                  ChatGPT built-in browser
                </NativeSelectOption>
                <NativeSelectOption value="in-page-harness">
                  In-page harness
                </NativeSelectOption>
              </NativeSelect>
            </label>
            <label
              htmlFor="conformance-model"
              className="text-sm font-semibold"
            >
              Model under test
              <NativeSelect
                id="conformance-model"
                className="mt-2 w-full"
                value={model}
                onChange={(event) =>
                  setModel(event.target.value as SiteToolsModel)
                }
              >
                <NativeSelectOption value="unknown">
                  Choose model
                </NativeSelectOption>
                <NativeSelectOption value="gpt-5.6-sol">
                  GPT-5.6 Sol
                </NativeSelectOption>
                <NativeSelectOption value="gpt-5.6-terra">
                  GPT-5.6 Terra
                </NativeSelectOption>
                <NativeSelectOption value="gpt-5.6-luna">
                  GPT-5.6 Luna — negative control
                </NativeSelectOption>
              </NativeSelect>
            </label>
            <label
              htmlFor="conformance-workspace"
              className="text-sm font-semibold"
            >
              Workspace class
              <NativeSelect
                id="conformance-workspace"
                className="mt-2 w-full"
                value={workspace}
                onChange={(event) =>
                  setWorkspace(event.target.value as WorkspaceClass)
                }
              >
                <NativeSelectOption value="unknown">
                  Choose workspace
                </NativeSelectOption>
                <NativeSelectOption value="eligible-workspace">
                  Eligible (not Enterprise/Edu)
                </NativeSelectOption>
                <NativeSelectOption value="enterprise-or-edu">
                  Enterprise or Edu — unsupported
                </NativeSelectOption>
              </NativeSelect>
            </label>
            <label
              htmlFor="conformance-app-version"
              className="text-sm font-semibold"
            >
              App version or build
              <Input
                id="conformance-app-version"
                className="mt-2"
                value={appVersion}
                maxLength={80}
                placeholder="Record exactly what the client shows"
                onChange={(event) => setAppVersion(event.target.value)}
              />
            </label>
          </div>
          <div className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
            <Fact label="Session" value={shortId(sessionId)} />
            <Fact label="Document" value={shortId(documentId)} />
            <Fact label="Page API" value={apiSupport} />
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-foreground bg-[#05081a] p-5 text-slate-100 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-lime-300">
                C01 · Required positive baseline
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Register one harmless top-level Site Tool
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Registration proves only that this page registered a tool. Ask
                the agent in this same built-in browser to invoke the Left Out
                synthetic conformance ping once. The callback records invocation
                automatically.
              </p>
            </div>
            <Button
              className="bg-lime-300 text-slate-950 hover:bg-lime-200"
              disabled={!sessionId || !documentId || !registrationId}
              onClick={() => void registerTool(false)}
            >
              <Bot data-icon="inline-start" /> Register baseline tool
            </Button>
          </div>
          <div className="mt-5 rounded-lg border border-white/15 bg-white/5 p-4">
            <p className="text-sm font-semibold">Tell the same agent:</p>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              “Invoke the Left Out top-level Site Tools baseline once. Do not
              invoke any other tool.”
            </p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DarkFact label="Registration" value={registration} />
            <DarkFact label="Client discovery" value={baselineDiscovery} />
            <DarkFact label="Invocation callback" value={baselineInvocation} />
            <DarkFact label="Registration ID" value={shortId(registrationId)} />
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-slate-300">
              If the agent inspected but did not invoke, record discovery here:
            </p>
            <ObservationButtons
              value={baselineDiscovery}
              onChange={setBaselineDiscovery}
            />
          </div>
          <div
            className={`mt-5 rounded-lg border p-4 ${verdictTone(baselineResult.verdict)}`}
          >
            <p className="font-mono text-xs font-bold">
              {baselineResult.verdict}
            </p>
            <p className="mt-1 text-xs leading-5">{baselineResult.summary}</p>
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          {conformanceCases.slice(1).map((testCase) => {
            const result = resultFor(testCase.id);
            return (
              <article
                key={testCase.id}
                className="rounded-xl border border-border bg-card p-5 sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {testCase.id.split('-')[0]}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold">
                      {testCase.title}
                    </h3>
                  </div>
                  <Badge variant="outline">{result.verdict}</Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {testCase.expected}
                </p>

                {testCase.id === 'C02-registration-binding' ? (
                  <div className="mt-4 space-y-3">
                    <Button
                      variant="outline"
                      onClick={() => void registerTool(true)}
                    >
                      <RefreshCw data-icon="inline-start" /> Withdraw A;
                      register B
                    </Button>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Ask the agent to invoke the current Left Out conformance
                      ping. Then separately ask whether the previous
                      registration is still available.
                    </p>
                    <ObservationButtons
                      value={staleInvocation}
                      onChange={setStaleInvocation}
                    />
                  </div>
                ) : null}

                {testCase.id === 'C03-navigation-binding' ? (
                  <div className="mt-4">
                    <Button variant="outline" onClick={prepareNavigationCheck}>
                      Run full-navigation control{' '}
                      <ExternalLink data-icon="inline-end" />
                    </Button>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      This intentionally replaces this document. The next page
                      records whether the old tool remains available.
                    </p>
                  </div>
                ) : null}

                {testCase.id === 'C04-declarative-unsupported' ? (
                  <div className="mt-4 space-y-3">
                    <form
                      {...({
                        toolname: 'los_declarative_control',
                        tooldescription:
                          'Synthetic declarative control. Do not submit.',
                      } as Record<string, string>)}
                      onSubmit={(event) => event.preventDefault()}
                      className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground"
                    >
                      Declarative control present; it performs no action.
                    </form>
                    <ObservationButtons
                      value={controlObservations.declarative}
                      onChange={(value) =>
                        setControlObservations((current) => ({
                          ...current,
                          declarative: value,
                        }))
                      }
                    />
                  </div>
                ) : null}

                {testCase.id === 'C05-iframe-unsupported' ? (
                  <div className="mt-4 space-y-3">
                    <iframe
                      className="h-24 w-full rounded-md border border-border bg-background"
                      title="Same-origin iframe Site Tools control"
                      src={`/conformance/frame?parentDocument=${encodeURIComponent(documentId)}`}
                    />
                    <p className="text-xs text-muted-foreground">
                      Child registration: {frameRegistration}. This says nothing
                      about top-level client discovery.
                    </p>
                    <ObservationButtons
                      value={controlObservations.iframe}
                      onChange={(value) =>
                        setControlObservations((current) => ({
                          ...current,
                          iframe: value,
                        }))
                      }
                    />
                  </div>
                ) : null}

                {testCase.id === 'C06-luna-negative-control' ? (
                  <div className="mt-4 space-y-3">
                    <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                      Run in a separate Luna session. Do not call absence a
                      security pass; record it as the expected model negative.
                    </p>
                    <ObservationButtons
                      value={controlObservations.luna}
                      onChange={(value) =>
                        setControlObservations((current) => ({
                          ...current,
                          luna: value,
                        }))
                      }
                    />
                  </div>
                ) : null}

                <div
                  className={`mt-4 rounded-md border p-3 text-xs leading-5 ${verdictTone(result.verdict)}`}
                >
                  <strong>{result.verdict}</strong> — {result.summary}
                </div>
              </article>
            );
          })}
        </section>

        <section className="mt-8 grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2 sm:p-6">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-700" />
              <h2 className="font-semibold">Browser safety-review evidence</h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              The page cannot observe the browser&apos;s review or confirmation
              UI. Record it independently; do not infer it from callback
              success.
            </p>
          </div>
          <ObservationButtons
            value={browserSafetyReview}
            onChange={setBrowserSafetyReview}
          />
        </section>

        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          {message}
        </p>
      </div>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-all text-sm font-semibold">{value}</p>
    </div>
  );
}

function DarkFact({ label, value }: { label: string; value: string }) {
  const Icon =
    value === 'observed' || value === 'registered'
      ? CheckCircle2
      : CircleDashed;
  return (
    <div className="rounded-lg border border-white/12 bg-white/5 p-3">
      <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">
        <Icon className="size-3" /> {label}
      </p>
      <p className="mt-2 break-all text-xs font-semibold text-slate-100">
        {value}
      </p>
    </div>
  );
}
