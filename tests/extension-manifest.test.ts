import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_PERMIT_HANDOFF_SCHEMA,
  CAPABILITY_PERMIT_HANDOFF_TYPE,
} from '../lib/lab/artifacts';
import {
  ALTERNATE_BRIDGE_PORT,
  CONNECTOR_BASES,
  FIXED_BRIDGE_PORT,
} from '../products/extension/validation.js';

const extensionRoot = new URL('../products/extension/', import.meta.url);

describe('desktop extension package', () => {
  it('uses the exact narrow MV3 permissions', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('manifest.json', extensionRoot), 'utf8'),
    );
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe('0.3.0');
    expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'storage']);
    expect(FIXED_BRIDGE_PORT).toBe(8788);
    expect(ALTERNATE_BRIDGE_PORT).toBe(48_788);
    expect(manifest.host_permissions).toEqual(
      CONNECTOR_BASES.map((base) => `${base}/*`),
    );
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
    expect(manifest.background).toEqual({
      service_worker: 'background.js',
      type: 'module',
    });
    const expectedIcons = {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    };
    expect(manifest.icons).toEqual(expectedIcons);
    expect(manifest.action.default_icon).toEqual(expectedIcons);
  });

  it('keeps connector access in the service worker and page access in MAIN world', async () => {
    const [
      background,
      content,
      popupCss,
      popupHtml,
      popupJavaScript,
      policyValidation,
      lessonPolicy,
    ] = await Promise.all([
      readFile(new URL('background.js', extensionRoot), 'utf8'),
      readFile(new URL('content-script.js', extensionRoot), 'utf8'),
      readFile(new URL('popup.css', extensionRoot), 'utf8'),
      readFile(new URL('popup.html', extensionRoot), 'utf8'),
      readFile(new URL('popup.js', extensionRoot), 'utf8'),
      readFile(new URL('policy-validation.js', extensionRoot), 'utf8'),
      readFile(new URL('lesson-policy.js', extensionRoot), 'utf8'),
    ]);
    expect(background).toContain("world: 'MAIN'");
    expect(background).toContain('chrome.tabs.get(expectedTabId)');
    expect(background).not.toContain('currentWindow: true');
    expect(background).toContain('document.modelContext.getTools()');
    expect(background).toContain("executeTool.call(modelContext, tool, '{}')");
    expect(background).not.toContain('modelContext.registerTool(');
    expect(background).not.toContain("'check_training_eligibility'");
    expect(background).not.toContain("'propose_training_1042_read_capability'");
    expect(content).not.toContain('fetch(');
    expect(content).not.toContain('modelContext');
    expect(content).not.toContain('executeTool');
    expect(content).toContain("type: 'bridge-tick'");
    expect(content).toContain(`'${CAPABILITY_PERMIT_HANDOFF_TYPE}'`);
    expect(content).toContain(`'${CAPABILITY_PERMIT_HANDOFF_SCHEMA}'`);
    expect(content).toContain("type: 'offer-capability-permit'");
    expect(content).toContain('permitHandoffPending');
    expect(content).toContain('lastPermitText');
    expect(content).not.toContain('permitHandoffForwarded');
    expect(content).not.toContain("kind: 'result'");
    expect(content).toContain('LeftOut extension HUD');
    expect(popupCss).toContain('[hidden]');
    expect(popupCss).toContain('display: none !important');
    expect(popupHtml).toContain('Connect this practice tab');
    expect(popupHtml).not.toContain('id="pair-code"');
    expect(popupJavaScript).toContain("type: 'pair-active-tab'");
    expect(popupJavaScript).not.toContain('normalizePairCode');
    expect(popupJavaScript).not.toContain('pairCode:');
    expect(popupJavaScript).toContain('sanitizeHudModel(value)');
    expect(popupJavaScript).toContain('HUD_LESSON_HEADLINES[hud.lessonId]');
    expect(popupJavaScript).toContain('tabId: selectedTab.id');
    const popupCopy = popupHtml.replace(/\s+/gu, ' ');
    expect(popupCopy).toContain('Importing only narrows');
    expect(popupCopy).toContain('is not proof that approval occurred');
    expect(popupCopy).toContain(
      'user-supplied narrowing data, not an approval credential',
    );
    expect(popupHtml).toContain('Paste exact capability permit JSON');
    expect(popupHtml).toContain('Verify and import pasted permit');
    expect(popupHtml.indexOf('id="permit-text"')).toBeLessThan(
      popupHtml.indexOf('id="permit-file"'),
    );
    expect(
      popupJavaScript.match(/type: 'import-capability-permit'/gu),
    ).toHaveLength(1);
    expect(popupJavaScript).toContain(
      'await importCapabilityPermitText(permitText.value)',
    );
    expect(popupJavaScript).toContain(
      'await importCapabilityPermitText(file.text())',
    );
    expect(popupJavaScript).toContain('No site tool will be invoked.');
    expect(popupHtml).toContain('Review receipt or report a concern');
    expect(policyValidation).toContain('grantsNewAuthority');
    expect(policyValidation).not.toContain('registerTool(');
    expect(policyValidation).not.toContain('executeTool(');
    for (const prefix of [
      'get_training_1042_eligibility_once_',
      'update_profile_notice_once_',
      'get_synthetic_delivery_status_safe_once_',
      'set_training_notification_subscription_once_',
      'record_webmcp_capability_observation_once_',
    ]) {
      expect(lessonPolicy).toContain(prefix);
    }
  });
});
