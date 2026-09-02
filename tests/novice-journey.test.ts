import { describe, expect, it } from 'vitest';

import {
  createNoviceJourneyCheckpoint,
  isExperienceModeSelectable,
  isExperienceModeViable,
  parseNoviceJourneyCheckpoint,
  recommendExperienceMode,
} from '../lib/lab/novice-journey';
import type { ScenarioId } from '../lib/lab/types';

describe('novice journey checkpoint', () => {
  it('recommends Site Tools only when the page can detect the API', () => {
    expect(recommendExperienceMode('available')).toBe('site-tools');
    expect(recommendExperienceMode('unavailable')).toBe('read-only');
    expect(recommendExperienceMode('checking')).toBe('read-only');
    expect(isExperienceModeSelectable('local-guard', 'unavailable')).toBe(true);
    expect(isExperienceModeViable('site-tools', 'unavailable')).toBe(false);
    expect(isExperienceModeViable('local-guard', 'unavailable')).toBe(false);
    expect(isExperienceModeViable('local-guard', 'unavailable', true)).toBe(
      true,
    );
    expect(isExperienceModeViable('read-only', 'unavailable')).toBe(true);
  });

  it('parses only a versioned, known, privacy-minimal checkpoint', () => {
    const parsed = parseNoviceJourneyCheckpoint(
      JSON.stringify({
        version: 1,
        mode: 'read-only',
        setupConfirmed: true,
        selectedLessonId: 'over-broad-schema',
        completedLessonIds: [
          'read-only-claim',
          'read-only-claim',
          'unknown-lesson',
        ],
        lastReceiptId: 'receipt-123',
        approval: { approved: true },
      }),
    );

    expect(parsed).toEqual({
      version: 1,
      mode: 'read-only',
      setupConfirmed: true,
      selectedLessonId: 'over-broad-schema',
      completedLessonIds: ['read-only-claim'],
      lastReceiptId: 'receipt-123',
    });
    expect(JSON.stringify(parsed)).not.toContain('approval');
  });

  it('rejects corrupt, unknown-version, and unknown-mode checkpoints', () => {
    expect(parseNoviceJourneyCheckpoint('{')).toBeUndefined();
    expect(
      parseNoviceJourneyCheckpoint(
        JSON.stringify({
          version: 2,
          mode: 'read-only',
          setupConfirmed: true,
          selectedLessonId: 'read-only-claim',
          completedLessonIds: [],
        }),
      ),
    ).toBeUndefined();
    expect(
      parseNoviceJourneyCheckpoint(
        JSON.stringify({
          version: 1,
          mode: 'magic-client',
          setupConfirmed: true,
          selectedLessonId: 'read-only-claim',
          completedLessonIds: [],
        }),
      ),
    ).toBeUndefined();
  });

  it('falls back to Lesson 1 and stores progress without active authority', () => {
    const checkpoint = createNoviceJourneyCheckpoint({
      mode: 'site-tools',
      setupConfirmed: true,
      selectedLessonId: 'not-a-lesson' as ScenarioId,
      completedLessonIds: ['read-only-claim'],
      lastReceiptId: 'receipt-456',
    });

    expect(checkpoint.selectedLessonId).toBe('read-only-claim');
    expect(Object.keys(checkpoint).sort()).toEqual([
      'completedLessonIds',
      'lastReceiptId',
      'mode',
      'selectedLessonId',
      'setupConfirmed',
      'version',
    ]);
  });
});
