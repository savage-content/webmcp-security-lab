import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const presentationRoots = [
  'app',
  'components',
  'lib/capability-core',
  'lib/lab',
  'lib/site-tools',
];
const publicSource = /\.(?:ts|tsx|js|jsx)$/;
const joinedBrand = /\bLeftOut\b/;
const numericPrice = /(?:[$€£]\s*\d[\d,]*(?:\.\d{1,2})?|\b(?:USD|EUR|GBP)\s*\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s*(?:USD|EUR|GBP|dollars?|euros?|pounds?)\b|\bper\s+(?:month|year)\b)/i;

function renderedTextProjection(source: string): string {
  return source
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ');
}

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(target)));
    else if (publicSource.test(entry.name)) files.push(target);
  }
  return files;
}

describe('public copy policy', () => {
  it('uses the exact public brand and publishes no numeric prices', async () => {
    for (const root of presentationRoots) {
      for (const file of await filesUnder(root)) {
        const source = await readFile(file, 'utf8');
        const renderedText = renderedTextProjection(source);
        expect(source, `${file} contains joined public brand copy`).not.toMatch(joinedBrand);
        expect(source, `${file} contains a public numeric price`).not.toMatch(numericPrice);
        expect(renderedText, `${file} renders joined public brand copy`).not.toMatch(joinedBrand);
        expect(renderedText, `${file} renders a public numeric price`).not.toMatch(numericPrice);
      }
    }
  });
});
