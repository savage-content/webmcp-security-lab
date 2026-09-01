/* global chrome */

import {
  normalizePairCode,
  pageIdentityFromUrl,
  safeErrorMessage,
} from './validation.js';

const form = document.querySelector('#pair-form');
const connector = document.querySelector('#connector');
const pairCode = document.querySelector('#pair-code');
const pairButton = document.querySelector('#pair-button');
const pageOrigin = document.querySelector('#page-origin');
const status = document.querySelector('#status');
const connection = document.querySelector('#connection');
const connectionOrigin = document.querySelector('#connection-origin');
const connectionSession = document.querySelector('#connection-session');
const connectionCommand = document.querySelector('#connection-command');
const forgetButton = document.querySelector('#forget-button');

let selectedTab;

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

function renderConnection(value) {
  const paired = value?.paired === true;
  connection.hidden = !paired;
  forgetButton.hidden = !paired;
  form.hidden = paired;
  if (!paired) {
    setStatus('Not paired. Enter the connector’s one-time code.', 'neutral');
    return;
  }
  connectionOrigin.textContent = value.origin;
  connectionSession.textContent = value.sessionId;
  connectionCommand.textContent = value.lastCommand || 'None';
  if (value.lastError) {
    setStatus(
      `Paired, but the last bridge operation failed: ${value.lastError}`,
      'error',
    );
  } else if (value.lastPollAt) {
    setStatus('Paired and polling the local connector.', 'ok');
  } else {
    setStatus('Paired. Waiting for the first connector poll.', 'ok');
  }
}

function validateForm() {
  try {
    normalizePairCode(pairCode.value);
    pairButton.disabled = !selectedTab;
  } catch {
    pairButton.disabled = true;
  }
}

async function refreshStatus() {
  if (!selectedTab) return;
  try {
    renderConnection(
      await send({ type: 'get-active-status', tabId: selectedTab.id }),
    );
  } catch (error) {
    setStatus(safeErrorMessage(error), 'error');
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
    setStatus(safeErrorMessage(error), 'error');
  }
}

pairCode.addEventListener('input', () => {
  pairCode.value = pairCode.value.replace(/\D/gu, '').slice(0, 8);
  validateForm();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedTab) return;
  pairButton.disabled = true;
  setStatus('Pairing this tab…');
  try {
    const value = await send({
      type: 'pair-active-tab',
      tabId: selectedTab.id,
      connectorBase: connector.value,
      pairCode: normalizePairCode(pairCode.value),
    });
    pairCode.value = '';
    renderConnection(value);
  } catch (error) {
    pairCode.value = '';
    setStatus(safeErrorMessage(error), 'error');
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

void initialize();
setInterval(() => void refreshStatus(), 1_500);
