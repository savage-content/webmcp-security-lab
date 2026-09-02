import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

const siteCss = read('app/globals.css');
const tour = read('components/lab/first-visit-tour.tsx');
const lesson = read('components/lab/guided-security-lesson.tsx');
const popupCss = read('products/extension/popup.css');
const popupHtml = read('products/extension/popup.html');

describe('novice accessibility contract', () => {
  it('honors reduced-motion preferences on the public lesson and Local Guard', () => {
    for (const css of [siteCss, popupCss]) {
      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
      expect(css).toContain('animation-duration: 0.01ms !important');
      expect(css).toContain('transition-duration: 0.01ms !important');
    }
    expect(siteCss).toContain('scroll-behavior: auto');
  });

  it('keeps walkthrough and approval dialogs usable in short or zoomed viewports', () => {
    expect(tour).toContain('max-h-[calc(100vh-13rem)] overflow-y-auto');
    expect(tour).toContain('w-[calc(100%-1.5rem)] max-w-2xl');
    expect(lesson).toContain(
      'max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto',
    );
    expect(lesson).toContain('whitespace-normal');
  });

  it('gives the extension a named status surface and visible keyboard focus at 360 CSS pixels', () => {
    expect(popupCss).toContain('width: 360px');
    expect(popupCss).toContain('button:focus-visible');
    expect(popupHtml).toContain('role="status" aria-live="polite"');
    expect(popupHtml).toContain('<label for="connector">');
    expect(popupHtml).toContain('<label for="permit-text">');
    expect(popupHtml).toContain('<label for="permit-file">');
  });
});
