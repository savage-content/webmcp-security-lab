import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

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
  });

  it('keeps connector access in the service worker and page access in MAIN world', async () => {
    const [background, content, popupCss] = await Promise.all([
      readFile(new URL('background.js', extensionRoot), 'utf8'),
      readFile(new URL('content-script.js', extensionRoot), 'utf8'),
      readFile(new URL('popup.css', extensionRoot), 'utf8'),
    ]);
    expect(background).toContain("world: 'MAIN'");
    expect(background).toContain('document.modelContext.getTools()');
    expect(background).toContain("executeTool.call(modelContext, tool, '{}')");
    expect(background).not.toContain('modelContext.registerTool(');
    expect(background).not.toContain("'check_training_eligibility'");
    expect(background).not.toContain("'propose_training_1042_read_capability'");
    expect(content).not.toContain('fetch(');
    expect(content).not.toContain('document.');
    expect(content).toContain("type: 'bridge-tick'");
    expect(popupCss).toContain('[hidden]');
    expect(popupCss).toContain('display: none !important');
  });
});
