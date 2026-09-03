import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const roots = ['app', 'components'];
const publicSource = /\.(?:ts|tsx|js|jsx)$/;
const joinedBrand = /\bLeftOut\b/;
const numericPrice = /\$\s*\d|€\s*\d|£\s*\d|\b(?:USD|EUR|GBP)\s*\d|\b\d+(?:\.\d{1,2})?\s*dollars?\b|\bper\s+(?:month|year)\b/i;

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
    for (const root of roots) {
      for (const file of await filesUnder(root)) {
        const source = await readFile(file, 'utf8');
        expect(source, `${file} contains joined public brand copy`).not.toMatch(joinedBrand);
        expect(source, `${file} contains a public numeric price`).not.toMatch(numericPrice);
      }
    }
  });
});
