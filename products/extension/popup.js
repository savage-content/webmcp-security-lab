/* global chrome */

import { sanitizeHudModel } from './hud-model.js';
import { pageIdentityFromUrl, safeErrorMessage } from './validation.js';

const form = document.querySelector('#pair-form');
const connector = document.querySelector('#connector');
const pairButton = document.querySelector('#pair-button');
const pageOrigin = document.querySelector('#page-origin');
const status = document.querySelector('#status');
const hudSummary = document.querySelector('#hud-summary');
const hudHeadline = document.querySelector('#hud-headline');
const hudDetail = document.querySelector('#hud-detail');
const hudObserved = document.querySelector('#hud-observed');
const hudProtected = document.querySelector('#hud-protected');
const hudRun = document.querySelector('#hud-run');
const hudNext = document.querySelector('#hud-next');
const connection = document.querySelector('#connection');
const connectionOrigin = document.querySelector('#connection-origin');
const connectionSession = document.querySelector('#connection-session');
const connectionCommand = document.querySelector('#connection-command');
const forgetButton = document.querySelector('#forget-button');
const reportsButton = document.querySelector('#reports-button');
const permitText = document.querySelector('#permit-text');
const permitPasteImport = document.querySelector('#permit-paste-import');
const permitFile = document.querySelector('#permit-file');
const permitImport = document.querySelector('#permit-import');
const permitStatus = document.querySelector('#permit-status');
const permitRemove = document.querySelector('#permit-remove');

let selectedTab;
let permitImportPending = false;
let pairPending = false;

const HUD_COPY = Object.freeze({
  checking: Object.freeze({
    headline: 'Checking this page for WebMCP',
    detail: 'Reading action declarations only. Nothing can run.',
    next: 'Keep this tab open',
  }),
  'none-observed': Object.freeze({
    headline: 'No WebMCP actions observed',
    detail:
      'None are visible now. The page can still add or change actions later.',
    next: 'Continue browsing',
  }),
  detected: Object.freeze({
    headline: 'WebMCP detected',
    detail:
      'This page offers actions to an AI. Page claims are untrusted. Nothing has run.',
    next: 'Review before acting',
  }),
  protected: Object.freeze({
    headline: 'One exact action is guarded',
    detail:
      'The extension rejects a different action. Pairing is not approval, and nothing has run.',
    next: 'Return to the lesson',
  }),
  changed: Object.freeze({
    headline: 'This page changed its WebMCP actions',
    detail: 'The declaration list changed after it was observed. Nothing ran.',
    next: 'Review changes',
  }),
  receipt: Object.freeze({
    headline: 'Receipt recorded',
    detail:
      'The connector accepted evidence for one run. The one-use permission is closed.',
    next: 'Review receipt or report a concern',
  }),
  error: Object.freeze({
    headline: 'Protection paused',
    detail:
      'The local bridge cannot verify its state. No new action will be relayed.',
    next: 'Check technical details',
  }),
});

const HUD_LESSON_HEADLINES = Object.freeze({
  'read-only-claim': 'Lesson 1 eligibility read is guarded',
  'over-broad-schema': 'Lesson 2 profile-banner update is guarded',
  'tool-result-injection': 'Lesson 3 delivery-status read is guarded',
  'confirmation-mismatch': 'Lesson 4 subscription change is guarded',
  'client-discovery-variance': 'Lesson 5 session observation is guarded',
});

function setStatus(message, state = 'neutral') {
  status.textContent = message;
  status.dataset.state = state;
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || 'The extension service worker failed.');
  }
  return response.result;
}

function observedLabel(hud) {
  if (hud.state === 'checking') return 'Checking';
  if (hud.observedCount === 0) return 'None';
  return `${hud.observedCount} ${hud.observedCount === 1 ? 'action' : 'actions'}`;
}

function protectionLabel(value) {
  if (value === 'one-exact-action') return 'One exact action';
  if (value === 'closed') return 'Closed';
  return 'None';
}

function runLabel(value) {
  if (value === 'receipt-recorded') return 'Receipt recorded';
  if (value === 'unverified') return 'Not verified';
  return 'Not run';
}

function renderDisconnectedHud() {
  hudSummary.dataset.state = 'checking';
  hudHeadline.textContent = 'Connect to check for WebMCP';
  hudDetail.textContent =
    'The extension has not observed this tab. Nothing is approved and nothing has run.';
  hudObserved.textContent = 'Not checked';
  hudProtected.textContent = 'None';
  hudRun.textContent = 'Not run';
  hudNext.textContent = 'Next: connect this practice tab';
}

function renderHud(value) {
  let hud;
  try {
    hud = sanitizeHudModel(value);
  } catch {
    hudSummary.dataset.state = 'error';
    hudHeadline.textContent = HUD_COPY.error.headline;
    hudDetail.textContent = HUD_COPY.error.detail;
    hudObserved.textContent = 'Unknown';
    hudProtected.textContent = 'Unknown';
    hudRun.textContent = 'Not verified';
    hudNext.textContent = `Next: ${HUD_COPY.error.next.toLowerCase()}`;
    return 'error';
  }

  const copy = HUD_COPY[hud.state];
  hudSummary.dataset.state = hud.state;
  hudHeadline.textContent =
    hud.state === 'protected' && HUD_LESSON_HEADLINES[hud.lessonId]
      ? HUD_LESSON_HEADLINES[hud.lessonId]
      : copy.headline;
  hudDetail.textContent = copy.detail;
  hudObserved.textContent = observedLabel(hud);
  hudProtected.textContent = protectionLabel(hud.protection);
  hudRun.textContent = runLabel(hud.run);
  hudNext.textContent = `Next: ${copy.next.toLowerCase()}`;
  return hud.state;
}

function renderConnection(value) {
  const paired = value?.paired === true;
  connection.hidden = !paired;
  forgetButton.hidden = !paired;
  reportsButton.hidden = !paired;
  form.hidden = paired;
  renderPermit(value?.capabilityPermit);

  if (!paired) {
    renderDisconnectedHud();
    setStatus(
      'Not connected. Connecting does not approve or run anything.',
      'neutral',
    );
    validateForm();
    return;
  }

  connectionOrigin.textContent = value.origin;
  connectionSession.textContent = value.sessionId;
  connectionCommand.textContent = value.lastCommand || 'None';
  const hudState = renderHud(value.hud);
  if (hudState === 'error') {
    setStatus(
      'Protection is paused. Nothing new will be relayed automatically.',
      'error',
    );
  } else if (hudState === 'receipt') {
    setStatus(
      'A receipt was recorded. The one-use permission is closed.',
      'ok',
    );
  } else if (hudState === 'changed') {
    setStatus(
      'The page changed its WebMCP actions. Review before continuing.',
      'error',
    );
  } else if (hudState === 'protected') {
    setStatus('Connected. One exact action is guarded; nothing has run.', 'ok');
  } else if (hudState === 'detected') {
    setStatus(
      'Connected. WebMCP was observed; pairing did not approve it.',
      'ok',
    );
  } else if (hudState === 'none-observed') {
    setStatus('Connected. No WebMCP actions are currently observed.', 'ok');
  } else {
    setStatus('Connected. Waiting for a safe declaration check.', 'ok');
  }
}

function renderPermit(value) {
  const imported = value?.imported === true;
  permitRemove.hidden = !imported;
  if (!imported) {
    const hasDraft =
      permitText.value.trim().length > 0 || permitFile.files?.length === 1;
    permitStatus.textContent = hasDraft
      ? 'Ready to verify. Importing will not invoke any site tool.'
      : 'No capability permit imported.';
    permitStatus.dataset.state = 'neutral';
    return;
  }
  const digest =
    typeof value.digest === 'string'
      ? `${value.digest.slice(0, 12)}…${value.digest.slice(-8)}`
      : 'unavailable';
  const contract =
    typeof value.contractHash === 'string'
      ? `${value.contractHash.slice(0, 12)}…${value.contractHash.slice(-8)}`
      : 'unavailable';
  const scope =
    typeof value.origin === 'string' ? value.origin : 'unknown origin';
  permitStatus.textContent = value.consumedAt
    ? `Consumed · ${scope} · contract ${contract} · ${digest} · ${value.toolName}`
    : `Ready for ${scope} until ${value.expiresAt} · contract ${contract} · ${digest} · ${value.toolName}`;
  permitStatus.dataset.state = 'ok';
}

function updatePermitImportControls() {
  permitPasteImport.disabled =
    permitImportPending || permitText.value.trim().length === 0;
  permitImport.disabled = permitImportPending || permitFile.files?.length !== 1;
}

async function importCapabilityPermitText(textOrPromise) {
  if (!selectedTab) return;
  permitImportPending = true;
  updatePermitImportControls();
  permitStatus.textContent = 'Verifying locally. No site tool will be invoked.';
  permitStatus.dataset.state = 'neutral';
  try {
    const text = await textOrPromise;
    const result = await send({
      type: 'import-capability-permit',
      tabId: selectedTab.id,
      text,
    });
    permitText.value = '';
    permitFile.value = '';
    renderPermit(result);
  } catch (error) {
    permitStatus.textContent = safeErrorMessage(error);
    permitStatus.dataset.state = 'error';
  } finally {
    permitImportPending = false;
    updatePermitImportControls();
  }
}

function validateForm() {
  pairButton.disabled = pairPending || !selectedTab;
}

async function refreshStatus() {
  if (!selectedTab) return;
  try {
    renderConnection(
      await send({ type: 'get-active-status', tabId: selectedTab.id }),
    );
  } catch {
    renderHud(undefined);
    setStatus(
      'The extension could not verify this tab. Nothing new will be relayed.',
      'error',
    );
  }
}

async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || typeof tab.id !== 'number' || typeof tab.url !== 'string') {
      throw new Error('No active browser tab is available.');
    }
    const page = pageIdentityFromUrl(tab.url);
    selectedTab = tab;
    pageOrigin.textContent = page.origin;
    validateForm();
    await refreshStatus();
  } catch (error) {
    selectedTab = undefined;
    pageOrigin.textContent = 'Unavailable';
    form.hidden = true;
    renderHud(undefined);
    setStatus(safeErrorMessage(error), 'error');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedTab || pairPending) return;
  pairPending = true;
  validateForm();
  pairButton.textContent = 'Connecting safely…';
  setStatus('Connecting this tab. Nothing is being approved or run.');
  try {
    renderConnection(
      await send({
        type: 'pair-active-tab',
        tabId: selectedTab.id,
        connectorBase: connector.value,
      }),
    );
  } catch (error) {
    setStatus(safeErrorMessage(error), 'error');
  } finally {
    pairPending = false;
    pairButton.textContent = 'Connect this practice tab';
    validateForm();
  }
});

forgetButton.addEventListener('click', async () => {
  if (!selectedTab) return;
  forgetButton.disabled = true;
  try {
    renderConnection(
      await send({ type: 'forget-active-tab', tabId: selectedTab.id }),
    );
    form.hidden = false;
    validateForm();
  } catch (error) {
    setStatus(safeErrorMessage(error), 'error');
  } finally {
    forgetButton.disabled = false;
  }
});

reportsButton.addEventListener('click', async () => {
  if (!selectedTab) return;
  reportsButton.disabled = true;
  try {
    await send({ type: 'open-active-reports', tabId: selectedTab.id });
    setStatus(
      'Opened private evidence and the local reporting workbench.',
      'ok',
    );
  } catch (error) {
    setStatus(safeErrorMessage(error), 'error');
  } finally {
    reportsButton.disabled = false;
  }
});

permitText.addEventListener('input', () => {
  updatePermitImportControls();
  renderPermit(undefined);
});

permitPasteImport.addEventListener('click', async () => {
  if (permitText.value.trim().length === 0) return;
  await importCapabilityPermitText(permitText.value);
});

permitFile.addEventListener('change', () => {
  updatePermitImportControls();
  renderPermit(undefined);
});

permitImport.addEventListener('click', async () => {
  const file = permitFile.files?.[0];
  if (!file) return;
  await importCapabilityPermitText(file.text());
});

permitRemove.addEventListener('click', async () => {
  permitRemove.disabled = true;
  try {
    renderPermit(await send({ type: 'remove-capability-permit' }));
  } catch (error) {
    permitStatus.textContent = safeErrorMessage(error);
    permitStatus.dataset.state = 'error';
  } finally {
    permitRemove.disabled = false;
  }
});

void initialize();
setInterval(() => void refreshStatus(), 1_500);
