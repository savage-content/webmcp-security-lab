import { defaultScenarioId, scenarios } from './scenarios';
import type { ScenarioId } from './types';

export type ExperienceMode = 'site-tools' | 'local-guard' | 'read-only';
export type SiteToolsSupport = 'checking' | 'available' | 'unavailable';

export const experienceOptions = [
  {
    id: 'site-tools',
    title: 'ChatGPT or Codex built-in browser',
    detail:
      'Use the page’s Site Tool directly with a compatible agent. No extension, local relay, pairing code, or JSON is needed.',
  },
  {
    id: 'local-guard',
    title: 'LeftOut Local Guard',
    detail:
      'Use the separate unpacked extension and local relay to test monitoring, drift alerts, one-use enforcement, and local reporting.',
  },
  {
    id: 'read-only',
    title: 'Learn without a compatible client',
    detail:
      'Inspect every safety boundary without invoking a Site Tool. This path is always available and never claims agent discovery or invocation.',
  },
] as const satisfies ReadonlyArray<{
  id: ExperienceMode;
  title: string;
  detail: string;
}>;

export function getExperienceTitle(mode: ExperienceMode) {
  return experienceOptions.find((option) => option.id === mode)?.title ?? mode;
}

export type NoviceJourneyCheckpoint = {
  version: 1;
  mode: ExperienceMode;
  setupConfirmed: boolean;
  selectedLessonId: ScenarioId;
  completedLessonIds: ScenarioId[];
  lastReceiptId?: string;
};

export const NOVICE_JOURNEY_STORAGE_KEY = 'left-out-webmcp-novice-journey-v1';

const experienceModes = new Set<ExperienceMode>([
  'site-tools',
  'local-guard',
  'read-only',
]);
const scenarioIds = new Set<ScenarioId>(
  scenarios.map((scenario) => scenario.id),
);

export function recommendExperienceMode(
  siteToolsSupport: SiteToolsSupport,
): ExperienceMode {
  return siteToolsSupport === 'available' ? 'site-tools' : 'read-only';
}

export function isExperienceModeSelectable(
  mode: ExperienceMode,
  siteToolsSupport: SiteToolsSupport,
) {
  return mode !== 'site-tools' || siteToolsSupport === 'available';
}

export function isExperienceModeViable(
  mode: ExperienceMode,
  siteToolsSupport: SiteToolsSupport,
  localGuardReady = false,
) {
  if (!isExperienceModeSelectable(mode, siteToolsSupport)) return false;
  if (mode === 'local-guard') return localGuardReady;
  return true;
}

export function parseNoviceJourneyCheckpoint(
  raw: string | null,
): NoviceJourneyCheckpoint | undefined {
  if (!raw) return undefined;

  try {
    const value = JSON.parse(raw) as Partial<NoviceJourneyCheckpoint>;
    if (
      value.version !== 1 ||
      !experienceModes.has(value.mode as ExperienceMode) ||
      typeof value.setupConfirmed !== 'boolean' ||
      !scenarioIds.has(value.selectedLessonId as ScenarioId) ||
      !Array.isArray(value.completedLessonIds)
    ) {
      return undefined;
    }

    const completedLessonIds = [
      ...new Set(
        value.completedLessonIds.filter((id): id is ScenarioId =>
          scenarioIds.has(id as ScenarioId),
        ),
      ),
    ];
    const lastReceiptId =
      typeof value.lastReceiptId === 'string' && value.lastReceiptId.length > 0
        ? value.lastReceiptId.slice(0, 200)
        : undefined;

    return {
      version: 1,
      mode: value.mode as ExperienceMode,
      setupConfirmed: value.setupConfirmed,
      selectedLessonId: value.selectedLessonId as ScenarioId,
      completedLessonIds,
      ...(lastReceiptId ? { lastReceiptId } : {}),
    };
  } catch {
    return undefined;
  }
}

export function createNoviceJourneyCheckpoint({
  mode,
  setupConfirmed,
  selectedLessonId,
  completedLessonIds,
  lastReceiptId,
}: Omit<NoviceJourneyCheckpoint, 'version'>): NoviceJourneyCheckpoint {
  return {
    version: 1,
    mode,
    setupConfirmed,
    selectedLessonId: scenarioIds.has(selectedLessonId)
      ? selectedLessonId
      : defaultScenarioId,
    completedLessonIds: [
      ...new Set(completedLessonIds.filter((id) => scenarioIds.has(id))),
    ],
    ...(lastReceiptId ? { lastReceiptId: lastReceiptId.slice(0, 200) } : {}),
  };
}
