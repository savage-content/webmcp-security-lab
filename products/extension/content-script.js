/* global chrome */

(() => {
  const marker = '__leftoutCapabilityBridgePollerV3';
  if (globalThis[marker]) return;

  const permitHandoffType = 'leftout:webmcp-capability-permit';
  const permitHandoffSchema = 'leftout.page-capability-handoff/1';
  const maxPermitBytes = 65_536;
  let permitHandoffPending = false;
  let lastPermitText = '';

  const allowedStates = new Set([
    'checking',
    'none-observed',
    'detected',
    'protected',
    'changed',
    'receipt',
    'error',
  ]);
  const host = document.createElement('aside');
  host.setAttribute('aria-label', 'Left Out WebMCP extension status');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .hud { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: min(340px, calc(100vw - 32px)); border: 1px solid #34443c; border-radius: 12px; background: #0d1512; color: #f3f7f4; box-shadow: 0 18px 60px rgba(0,0,0,.38); font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-bottom: 1px solid #28352f; }
    .brand { color: #9ce6bd; font: 700 10px/1.2 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; }
    button { border: 0; background: transparent; color: #aebdb5; font: 600 11px/1 system-ui, sans-serif; cursor: pointer; }
    button:focus-visible { outline: 2px solid #9ce6bd; outline-offset: 3px; }
    .body { padding: 13px; }
    .headline { margin: 0; font: 750 15px/1.3 system-ui, sans-serif; }
    .detail { margin: 7px 0 0; color: #bcc9c2; font: 12px/1.5 system-ui, sans-serif; }
    .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 12px; }
    .fact { padding: 8px; border: 1px solid #28352f; border-radius: 7px; background: rgba(255,255,255,.035); }
    .label { display: block; color: #7f968a; font: 700 9px/1.3 ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; }
    .value { display: block; margin-top: 4px; color: #edf5f0; font: 650 11px/1.35 system-ui, sans-serif; }
    .honesty { margin: 7px 0 0; color: #788b81; font: 10px/1.4 system-ui, sans-serif; }
    .dot { display: inline-block; width: 7px; height: 7px; margin-right: 7px; border-radius: 999px; background: #e5a83d; }
    .hud[data-state='protected'] .dot, .hud[data-state='receipt'] .dot { background: #7ee2a8; }
    .hud[data-state='changed'] .dot, .hud[data-state='error'] .dot { background: #f08070; }
    .hud.collapsed { width: auto; max-width: min(340px, calc(100vw - 32px)); }
    .hud.collapsed .body { display: none; }
    .hud.collapsed .bar { border-bottom: 0; }
    @media (max-width: 420px) { .hud { right: 8px; bottom: 8px; width: calc(100vw - 16px); } }
  `;
  const panel = document.createElement('section');
  panel.className = 'hud';
  panel.dataset.state = 'checking';
  panel.innerHTML = `
    <div class="bar">
      <span class="brand"><span class="dot"></span>Left Out extension HUD</span>
      <button type="button" aria-expanded="true">Hide</button>
    </div>
    <div class="body">
      <p class="headline">Checking this page for WebMCP</p>
      <p class="detail">Reading action declarations only. Nothing can run.</p>
      <div class="facts">
        <div class="fact"><span class="label">Observed</span><span class="value observed">Checking</span></div>
        <div class="fact"><span class="label">Protected</span><span class="value protected">None</span></div>
        <div class="fact"><span class="label">Run</span><span class="value run">Not run</span></div>
        <div class="fact"><span class="label">Next</span><span class="value action">Keep this tab open</span></div>
      </div>
      <p class="honesty">The browser extension icon is the canonical status. A page can imitate an in-page notice.</p>
    </div>
  `;
  shadow.append(style, panel);
  (document.body ?? document.documentElement).append(host);

  const toggle = panel.querySelector('button');
  const headline = panel.querySelector('.headline');
  const detail = panel.querySelector('.detail');
  const observed = panel.querySelector('.observed');
  const protectedValue = panel.querySelector('.protected');
  const run = panel.querySelector('.run');
  const action = panel.querySelector('.action');
  let userCollapsed = false;

  toggle.addEventListener('click', () => {
    userCollapsed = !userCollapsed;
    panel.classList.toggle('collapsed', userCollapsed);
    toggle.textContent = userCollapsed ? 'Show WebMCP status' : 'Hide';
    toggle.setAttribute('aria-expanded', String(!userCollapsed));
  });

  function renderHud(value) {
    if (
      !value ||
      typeof value !== 'object' ||
      value.schemaVersion !== 'leftout.webmcp-hud/1' ||
      !allowedStates.has(value.state) ||
      typeof value.headline !== 'string' ||
      typeof value.detail !== 'string' ||
      typeof value.nextAction !== 'string' ||
      !Number.isInteger(value.observedCount)
    ) {
      return;
    }
    panel.dataset.state = value.state;
    headline.textContent = value.headline;
    detail.textContent = value.detail;
    observed.textContent = `${value.observedCount} ${value.observedCount === 1 ? 'action' : 'actions'}`;
    protectedValue.textContent =
      value.protection === 'one-exact-action'
        ? '1 exact action'
        : value.protection === 'closed'
          ? 'Closed'
          : 'None';
    run.textContent =
      value.run === 'receipt-recorded'
        ? 'Receipt recorded'
        : value.run === 'unverified'
          ? 'Unverified'
          : 'Not run';
    action.textContent = value.nextAction;
    if (['changed', 'error'].includes(value.state)) {
      userCollapsed = false;
      panel.classList.remove('collapsed');
      toggle.textContent = 'Hide';
      toggle.setAttribute('aria-expanded', 'true');
    }
  }

  function hasExactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const keys = Object.keys(value).toSorted();
    return (
      keys.length === expected.length &&
      expected.toSorted().every((key, index) => keys[index] === key)
    );
  }

  function handlePermitHandoff(event) {
    if (event.source !== window || event.origin !== location.origin) return;
    const value = event.data;
    if (
      permitHandoffPending ||
      value?.permitText === lastPermitText ||
      !hasExactKeys(value, ['permitText', 'schemaVersion', 'type']) ||
      value.schemaVersion !== permitHandoffSchema ||
      value.type !== permitHandoffType ||
      typeof value.permitText !== 'string' ||
      new TextEncoder().encode(value.permitText).length > maxPermitBytes ||
      value.permitText.length === 0
    ) {
      return;
    }
    permitHandoffPending = true;
    lastPermitText = value.permitText;

    // The page supplies untrusted narrowing data. The worker independently
    // validates it against one row in the closed five-lesson policy and this exact paired
    // browser document. This message cannot pair, register, invoke, or retry.
    try {
      const request = chrome.runtime.sendMessage({
        type: 'offer-capability-permit',
        text: value.permitText,
      });
      if (request && typeof request.finally === 'function') {
        void request
          .catch(() => undefined)
          .finally(() => {
            permitHandoffPending = false;
          });
      } else {
        permitHandoffPending = false;
      }
    } catch {
      permitHandoffPending = false;
      // The page cannot treat this one-way offer as acceptance. The extension
      // HUD is the browser-owned source of truth.
    }
  }

  addEventListener('message', handlePermitHandoff);

  let tickInFlight = false;
  const tick = () => {
    if (tickInFlight) return;
    tickInFlight = true;
    try {
      const request = chrome.runtime.sendMessage({ type: 'bridge-tick' });
      if (request && typeof request.then === 'function') {
        request
          .then((response) => {
            if (response?.ok) renderHud(response.result?.hud);
          })
          .catch(() => {
            renderHud({
              schemaVersion: 'leftout.webmcp-hud/1',
              state: 'error',
              headline: 'Protection paused',
              detail:
                'The extension worker is unavailable. No new action will be relayed. Do not retry automatically.',
              nextAction: 'Check the extension',
              observedCount: 0,
              protection: 'none',
              run: 'unverified',
            });
          })
          .finally(() => {
            tickInFlight = false;
          });
      } else {
        tickInFlight = false;
      }
    } catch {
      tickInFlight = false;
      // Extension reloads invalidate this isolated world. No page data is read.
    }
  };
  const intervalId = setInterval(tick, 1_000);
  globalThis[marker] = { intervalId, host };
  addEventListener(
    'pagehide',
    () => {
      clearInterval(intervalId);
      removeEventListener('message', handlePermitHandoff);
      host.remove();
      delete globalThis[marker];
    },
    { once: true },
  );
  tick();
})();
