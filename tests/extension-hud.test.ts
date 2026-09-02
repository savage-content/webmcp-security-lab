import { describe, expect, it } from 'vitest';

import {
  buildHudModel,
  HUD_SCHEMA_VERSION,
  sanitizeHudModel,
} from '../products/extension/hud-model.js';

const TOOL_NAME = 'update_profile_notice_once_0123456789abcdef';

const connection = {
  origin: 'http://localhost:3001',
  observation: {
    toolCount: 2,
    toolNames: ['broad_page_tool', TOOL_NAME],
    observedAt: '2026-09-01T20:00:00.000Z',
    digest: 'a'.repeat(64),
    changed: false,
  },
  lastCommand: null,
  lastPollAt: '2026-09-01T20:00:01.000Z',
  lastError: null,
};

describe('extension HUD model', () => {
  it('distinguishes observed tools from an exact active permit', () => {
    const detected = buildHudModel({ connection });
    expect(detected).toMatchObject({
      state: 'detected',
      protection: 'none',
      run: 'not-run',
      observedCount: 2,
    });
    expect(detected.detail).toContain('Page declarations are untrusted');

    const protectedState = buildHudModel({
      connection: {
        ...connection,
        observation: {
          ...connection.observation,
          toolCount: 1,
          toolNames: [TOOL_NAME],
          changed: false,
        },
      },
      permit: {
        imported: true,
        boundToCurrentDocument: true,
        lessonId: 'over-broad-schema',
        toolName: TOOL_NAME,
        origin: connection.origin,
        expiresAt: '2026-09-01T20:05:00.000Z',
        consumedAt: null,
      },
      now: Date.parse('2026-09-01T20:01:00.000Z'),
    });
    expect(protectedState).toMatchObject({
      state: 'protected',
      protection: 'one-exact-action',
      run: 'not-run',
    });
    expect(protectedState).toMatchObject({
      lessonId: 'over-broad-schema',
      headline: 'Lesson 2 profile-banner update is guarded',
    });

    expect(
      buildHudModel({
        connection,
        permit: {
          imported: true,
          boundToCurrentDocument: false,
          origin: connection.origin,
          expiresAt: '2026-09-01T20:05:00.000Z',
          consumedAt: null,
        },
        now: Date.parse('2026-09-01T20:01:00.000Z'),
      }).state,
    ).toBe('detected');
  });

  it.each([
    ['the exact name after an unexplained change', [TOOL_NAME], 1],
    ['an extra tool', [TOOL_NAME, 'unexpected_tool'], 2],
    ['a different tool', ['unexpected_tool'], 1],
    ['missing tool-name evidence', undefined, 1],
  ])(
    'fails closed when a changed declaration has %s',
    (_label, toolNames, toolCount) => {
      const changedConnection = {
        ...connection,
        observation: {
          ...connection.observation,
          changed: true,
          toolCount,
          ...(toolNames ? { toolNames } : { toolNames: undefined }),
        },
      };
      expect(
        buildHudModel({
          connection: changedConnection,
          permit: {
            imported: true,
            boundToCurrentDocument: true,
            lessonId: 'over-broad-schema',
            toolName: TOOL_NAME,
            origin: connection.origin,
            expiresAt: '2026-09-01T20:05:00.000Z',
            consumedAt: null,
          },
          now: Date.parse('2026-09-01T20:01:00.000Z'),
        }).state,
      ).toBe('changed');
    },
  );

  it('prioritizes changes, errors, and committed receipts', () => {
    expect(
      buildHudModel({
        connection: {
          ...connection,
          observation: { ...connection.observation, changed: true },
        },
      }).state,
    ).toBe('changed');
    expect(
      buildHudModel({
        connection: { ...connection, lastError: 'connector offline' },
      }).state,
    ).toBe('error');
    expect(
      buildHudModel({
        connection: {
          ...connection,
          lastCommand: 'invoke-approved-capability',
        },
      }).state,
    ).toBe('detected');

    expect(
      buildHudModel({
        connection: {
          ...connection,
          observation: {
            ...connection.observation,
            toolCount: 0,
            toolNames: [],
          },
          lastCommand: 'invoke-approved-capability',
        },
        permit: {
          imported: true,
          boundToCurrentDocument: true,
          lessonId: 'tool-result-injection',
          toolName: TOOL_NAME,
          origin: connection.origin,
          expiresAt: '2026-09-01T20:05:00.000Z',
          consumedAt: '2026-09-01T20:00:30.000Z',
        },
        now: Date.parse('2026-09-01T20:01:00.000Z'),
      }).state,
    ).toBe('receipt');

    expect(
      buildHudModel({
        connection: {
          ...connection,
          observation: {
            ...connection.observation,
            toolCount: 0,
            toolNames: [],
          },
          lastCommand: 'invoke-approved-capability',
          pendingCompletion: { command_id: 'pending-delivery' },
        },
        permit: {
          imported: true,
          boundToCurrentDocument: true,
          toolName: TOOL_NAME,
          origin: connection.origin,
          consumedAt: '2026-09-01T20:00:30.000Z',
        },
      }).state,
    ).toBe('none-observed');

    expect(
      buildHudModel({
        connection: {
          ...connection,
          lastCommand: 'invoke-approved-capability',
        },
        permit: {
          imported: true,
          boundToCurrentDocument: true,
          lessonId: 'tool-result-injection',
          toolName: TOOL_NAME,
          origin: connection.origin,
          expiresAt: '2026-09-01T20:05:00.000Z',
          consumedAt: null,
        },
        now: Date.parse('2026-09-01T20:01:00.000Z'),
      }).state,
    ).toBe('detected');
  });

  it('accepts only the bounded fixed-copy HUD envelope', () => {
    const model = buildHudModel({ connection });
    expect(sanitizeHudModel(model)).toEqual(model);
    expect(() =>
      sanitizeHudModel({
        ...model,
        schemaVersion: HUD_SCHEMA_VERSION,
        observedCount: 101,
      }),
    ).toThrow('HUD state is invalid');
  });
});
