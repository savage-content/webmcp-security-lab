/* global chrome */

(() => {
  const marker = '__leftoutCapabilityBridgePollerV1';
  if (globalThis[marker]) return;

  let tickInFlight = false;
  const tick = () => {
    if (tickInFlight) return;
    tickInFlight = true;
    try {
      const request = chrome.runtime.sendMessage({ type: 'bridge-tick' });
      if (request && typeof request.then === 'function') {
        request
          .catch(() => {})
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
  globalThis[marker] = { intervalId };
  addEventListener(
    'pagehide',
    () => {
      clearInterval(intervalId);
      delete globalThis[marker];
    },
    { once: true },
  );
  tick();
})();
