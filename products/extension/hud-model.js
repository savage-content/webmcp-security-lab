export const HUD_SCHEMA_VERSION = 'leftout.webmcp-hud/1';

const HUD_STATES = new Set([
  'checking',
  'none-observed',
  'detected',
  'protected',
  'changed',
  'receipt',
  'error',
]);

const LESSON_ACTION_LABELS = Object.freeze({
  'read-only-claim': 'Lesson 1 eligibility read',
  'over-broad-schema': 'Lesson 2 profile-banner update',
  'tool-result-injection': 'Lesson 3 delivery-status read',
  'confirmation-mismatch': 'Lesson 4 subscription change',
  'client-discovery-variance': 'Lesson 5 session observation',
});

function fixedState(state, observedCount, observedAt, lessonId = null) {
  const lessonAction = LESSON_ACTION_LABELS[lessonId] ?? null;
  const base = {
    schemaVersion: HUD_SCHEMA_VERSION,
    state,
    observedCount,
    observedAt,
    protection: 'none',
    run: 'not-run',
    lessonId: lessonAction ? lessonId : null,
  };
  switch (state) {
    case 'checking':
      return {
        ...base,
        headline: 'Checking this page for WebMCP',
        detail: 'Reading action declarations only. Nothing can run.',
        nextAction: 'Keep this tab open',
      };
    case 'none-observed':
      return {
        ...base,
        headline: 'No WebMCP actions observed',
        detail:
          'None are visible now. This is an observation, not a guarantee; the page can add actions later.',
        nextAction: 'Continue browsing',
      };
    case 'detected':
      return {
        ...base,
        headline: 'WebMCP detected',
        detail: `This page currently offers ${observedCount} ${observedCount === 1 ? 'action' : 'actions'} to an AI. Page declarations are untrusted. Nothing has run.`,
        nextAction: 'Review before acting',
      };
    case 'protected':
      return {
        ...base,
        protection: 'one-exact-action',
        headline: lessonAction
          ? `${lessonAction} is guarded`
          : 'One exact lesson action is guarded',
        detail:
          'The current page has a document-bound, one-use permit. The extension rejects a different lesson action. Nothing has run.',
        nextAction: 'Return to the lesson',
      };
    case 'changed':
      return {
        ...base,
        headline: 'This page changed its WebMCP actions',
        detail:
          'The declaration list changed after observation. Nothing ran. Review the change before continuing.',
        nextAction: 'Review changes',
      };
    case 'receipt':
      return {
        ...base,
        protection: 'closed',
        run: 'receipt-recorded',
        headline: 'Receipt recorded',
        detail:
          'The connector accepted evidence for one run. The one-use permission is closed.',
        nextAction: 'Review receipt or report a concern',
      };
    default:
      return {
        ...base,
        run: 'unverified',
        headline: 'Protection paused',
        detail:
          'The local bridge could not verify its state. No new action will be relayed. Do not retry automatically.',
        nextAction: 'Check the extension',
      };
  }
}

/**
 * @param {{ connection?: any, permit?: any, now?: number }} [options]
 */
export function buildHudModel({ connection, permit, now = Date.now() } = {}) {
  if (!connection) return fixedState('checking', 0, null);
  const observation = connection.observation;
  const observedCount = Number.isInteger(observation?.toolCount)
    ? Math.max(0, Math.min(100, observation.toolCount))
    : 0;
  const observedAt =
    typeof observation?.observedAt === 'string' ? observation.observedAt : null;

  if (connection.lastError) {
    return fixedState('error', observedCount, observedAt);
  }
  if (observation?.changed === true) {
    return fixedState('changed', observedCount, observedAt);
  }
  const permitBoundToCurrentPage =
    permit?.imported === true &&
    permit.boundToCurrentDocument === true &&
    typeof permit.toolName === 'string' &&
    permit.origin === connection.origin;
  const permitActive =
    permitBoundToCurrentPage &&
    !permit.consumedAt &&
    typeof permit.expiresAt === 'string' &&
    Number.isFinite(Date.parse(permit.expiresAt)) &&
    Date.parse(permit.expiresAt) > now;
  const observationMatchesExactPermitTool =
    observedCount === 1 &&
    Array.isArray(observation?.toolNames) &&
    observation.toolNames.length === 1 &&
    observation.toolNames[0] === permit?.toolName;
  if (permitActive && observationMatchesExactPermitTool) {
    return fixedState('protected', observedCount, observedAt, permit.lessonId);
  }
  const observationShowsClosedAuthority =
    observedCount === 0 &&
    Array.isArray(observation?.toolNames) &&
    observation.toolNames.length === 0;
  if (
    permitBoundToCurrentPage &&
    typeof permit.consumedAt === 'string' &&
    connection.lastCommand === 'invoke-approved-capability' &&
    connection.lastPollAt &&
    !connection.pendingCompletion &&
    (observationMatchesExactPermitTool || observationShowsClosedAuthority)
  ) {
    return fixedState('receipt', observedCount, observedAt);
  }
  if (!observation) return fixedState('checking', 0, null);
  return fixedState(
    observedCount > 0 ? 'detected' : 'none-observed',
    observedCount,
    observedAt,
  );
}

export function sanitizeHudModel(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    value.schemaVersion !== HUD_SCHEMA_VERSION ||
    !HUD_STATES.has(value.state) ||
    typeof value.headline !== 'string' ||
    typeof value.detail !== 'string' ||
    typeof value.nextAction !== 'string' ||
    !Number.isInteger(value.observedCount) ||
    value.observedCount < 0 ||
    value.observedCount > 100 ||
    !['none', 'one-exact-action', 'closed'].includes(value.protection) ||
    !['not-run', 'receipt-recorded', 'unverified'].includes(value.run) ||
    (value.lessonId !== null &&
      value.lessonId !== undefined &&
      !Object.hasOwn(LESSON_ACTION_LABELS, value.lessonId))
  ) {
    throw new Error('The extension HUD state is invalid.');
  }
  return {
    schemaVersion: HUD_SCHEMA_VERSION,
    state: value.state,
    headline: value.headline,
    detail: value.detail,
    nextAction: value.nextAction,
    observedCount: value.observedCount,
    observedAt: typeof value.observedAt === 'string' ? value.observedAt : null,
    protection: value.protection,
    run: value.run,
    lessonId:
      typeof value.lessonId === 'string' &&
      Object.hasOwn(LESSON_ACTION_LABELS, value.lessonId)
        ? value.lessonId
        : null,
  };
}
