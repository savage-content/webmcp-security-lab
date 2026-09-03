import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const presentationRoots = [
  'app',
  'components',
  'lib/capability-core',
  'lib/lab',
  'lib/site-tools',
  'products/connector',
  'products/extension',
  'products/reporting-operator',
];
const publicSource = /\.(?:ts|tsx|js|jsx|css|html|json|svg)$/;
const joinedBrand = /\bLeftOut\b/;
const numericPrice =
  /(?:[$€£]\s*\d[\d,]*(?:\.\d{1,2})?|\b(?:USD|EUR|GBP)\s*\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s*[$€£](?!\{)|\b\d[\d,]*(?:\.\d{1,2})?\s*(?:USD|EUR|GBP|dollars?|euros?|pounds?)\b|\bper\s+(?:month|year)\b)/i;
const immutableLegacyContract =
  'This report reflects self-reported evidence readiness. LeftOut Security has not inspected, tested, or independently validated the described system.';

function normalizeRenderedText(source: string): string {
  return source
    .replace(/&#x([0-9a-f]+);?/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);?/g, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&(dollar|pound|euro|zerowidthspace|zwj|zwnj);/gi, (entity) => {
      const values: Record<string, string> = {
        '&dollar;': '$',
        '&pound;': '£',
        '&euro;': '€',
        '&zerowidthspace;': '',
        '&zwj;': '',
        '&zwnj;': '',
      };
      return values[entity.toLowerCase()] ?? entity;
    })
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function staticExpressionText(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) return staticTemplateText(node);
  if (ts.isParenthesizedExpression(node)) {
    return staticExpressionText(node.expression);
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticExpressionText(node.left);
    const right = staticExpressionText(node.right);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  return undefined;
}

function jsxTextValue(value: string): string {
  const lines = value.replace(/\r/g, '').split('\n');
  const lastNonEmptyLine = lines.findLastIndex((line) => /\S/u.test(line));
  let rendered = '';
  for (const [index, rawLine] of lines.entries()) {
    let line = rawLine.replace(/\t/g, ' ');
    if (index !== 0) line = line.replace(/^\s+/u, '');
    if (index !== lines.length - 1) line = line.replace(/\s+$/u, '');
    if (!line) continue;
    rendered += line;
    if (index !== lastNonEmptyLine) rendered += ' ';
  }
  return rendered;
}

function jsxRenderedText(node: ts.Node): string {
  if (ts.isJsxText(node)) return jsxTextValue(node.text);
  if (ts.isJsxExpression(node)) {
    return node.expression ? (staticExpressionText(node.expression) ?? '') : '';
  }
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
    return node.children.map(jsxRenderedText).join('');
  }
  return '';
}

function staticPublicProjections(source: string): string[] {
  const syntax = ts.createSourceFile(
    'public-copy.tsx',
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
  const projections: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      projections.push(jsxRenderedText(node));
    }
    if (ts.isBinaryExpression(node)) {
      const value = staticExpressionText(node);
      if (value !== undefined) projections.push(value);
    }
    if (ts.isJsxAttribute(node) && node.initializer) {
      const value = ts.isStringLiteral(node.initializer)
        ? node.initializer.text
        : ts.isJsxExpression(node.initializer) && node.initializer.expression
          ? staticExpressionText(node.initializer.expression)
          : undefined;
      if (value !== undefined) projections.push(value);
    }
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  return projections.map(normalizeRenderedText).filter(Boolean);
}

function staticTemplateText(node: ts.TemplateLiteral): string | undefined {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  let value = node.head.text;
  for (const span of node.templateSpans) {
    const expression = staticExpressionText(span.expression);
    if (expression === undefined) return undefined;
    value += expression + span.literal.text;
  }
  return value;
}

function staticMarkupExpressionProjections(source: string): string[] {
  const syntax = ts.createSourceFile(
    'public-copy.tsx',
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
  const projections: string[] = [];
  function visit(node: ts.Node) {
    const value =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node) ||
      ts.isBinaryExpression(node)
        ? staticExpressionText(node)
        : undefined;
    if (value?.includes('<') && value.includes('>')) {
      projections.push(normalizeRenderedText(value));
      projections.push(renderedTextProjection(value));
    }
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  return projections.map(normalizeRenderedText).filter(Boolean);
}

function cssGeneratedTextProjections(source: string): string[] {
  const bySelector = new Map<string, { before?: string; after?: string }>();
  const rule = /([^{}]+)::(before|after)\s*\{([^{}]*)\}/giu;
  for (const match of source.matchAll(rule)) {
    const selector = match[1]?.trim();
    const position = match[2]?.toLowerCase() as 'before' | 'after';
    const body = match[3] ?? '';
    if (!selector) continue;
    const declaration = /(?:^|;)\s*content\s*:\s*([^;}]*)/iu.exec(body)?.[1];
    if (!declaration) continue;
    const parts = [...declaration.matchAll(/(['"])(.*?)\1/gu)].map(
      (item) => item[2] ?? '',
    );
    if (parts.length === 0) continue;
    const existing = bySelector.get(selector) ?? {};
    existing[position] = parts.join('');
    bySelector.set(selector, existing);
  }
  return [...bySelector.values()].flatMap(({ before = '', after = '' }) => [
    normalizeRenderedText(before),
    normalizeRenderedText(after),
    normalizeRenderedText(before + after),
  ]);
}

function stripMarkup(source: string): string {
  let output = '';
  let quote = '';
  let insideTag = false;
  for (const character of source) {
    if (!insideTag) {
      if (character === '<') insideTag = true;
      else output += character;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      insideTag = false;
    }
  }
  return output;
}

function renderedTextProjection(source: string): string {
  const withoutComments = source.replace(/<!--[\s\S]*?-->/gu, '');
  const wrapped = `const __copy = <>${withoutComments}</>;`;
  const jsx = staticPublicProjections(wrapped).at(0);
  if (jsx !== undefined) return jsx;
  return normalizeRenderedText(
    stripMarkup(withoutComments.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')),
  );
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
  it('limits the old joined brand to explicit compatibility readers', async () => {
    const source = await readFile('lib/legacy-contracts.ts', 'utf8');
    expect(source.split(immutableLegacyContract)).toHaveLength(2);
    expect(source.replace(immutableLegacyContract, '')).not.toMatch(
      joinedBrand,
    );
    expect(source).toContain('accepted only while reading old');
    expect(source).toContain('records; new records');

    const androidSource = await readFile(
      'android-conformance/src/main/kotlin/com/leftout/security/capability/Model.kt',
      'utf8',
    );
    expect(androidSource.split(immutableLegacyContract)).toHaveLength(2);
    expect(androidSource).toContain(
      immutableLegacyContract.replace('LeftOut', 'Left Out'),
    );
  });

  it('preserves adjacent JSX text and catches currency in either order', () => {
    expect(renderedTextProjection('<span>Left</span><span>Out</span>')).toMatch(
      joinedBrand,
    );
    expect(
      renderedTextProjection('<span>Left</span>\n  <span>Out</span>'),
    ).toMatch(joinedBrand);
    expect(renderedTextProjection("<span>{'Left'}</span>Out")).toMatch(
      joinedBrand,
    );
    expect(renderedTextProjection("<span>Left</span>\n  {'Out'}")).toMatch(
      joinedBrand,
    );
    expect(renderedTextProjection("{'Left'}\n  <span>Out</span>")).toMatch(
      joinedBrand,
    );
    expect(renderedTextProjection("{'Left'}\n  {'Out'}")).toMatch(joinedBrand);
    expect(renderedTextProjection('<span>Left</span>\n  Out')).toMatch(
      joinedBrand,
    );
    expect(renderedTextProjection("{'Left'}\n  Out")).toMatch(joinedBrand);
    expect(renderedTextProjection('Left\n  <span>Out</span>')).toMatch(
      joinedBrand,
    );
    expect(renderedTextProjection("Left\n  {'Out'}")).toMatch(joinedBrand);
    expect(
      renderedTextProjection(
        '<span>Left</span>{/* formatting */}<span>Out</span>',
      ),
    ).toMatch(joinedBrand);
    expect(
      renderedTextProjection(
        '<span>Left</span>{ /* formatting */ }<span>Out</span>',
      ),
    ).toMatch(joinedBrand);
    expect(
      renderedTextProjection(
        '<span>Left</span><!-- formatting --><span>Out</span>',
      ),
    ).toMatch(joinedBrand);
    expect(
      renderedTextProjection('<span title="1 > 0">Left</span><span>Out</span>'),
    ).toMatch(joinedBrand);
    expect(renderedTextProjection('<span>Left&#x4f;ut</span>')).toMatch(
      joinedBrand,
    );
    expect(renderedTextProjection("<span>{'Left' + 'Out'}</span>")).toMatch(
      joinedBrand,
    );
    expect(renderedTextProjection('<span>Left\u200bOut</span>')).toMatch(
      joinedBrand,
    );
    expect(
      renderedTextProjection('<span>$</span><strong>5,000</strong>'),
    ).toMatch(numericPrice);
    expect(renderedTextProjection('<span>&#36;5,000</span>')).toMatch(
      numericPrice,
    );
    expect(renderedTextProjection("<span>{'$' + '5,000'}</span>")).toMatch(
      numericPrice,
    );
    expect(
      renderedTextProjection('<span>5,000</span><strong> USD</strong>'),
    ).toMatch(numericPrice);
    expect(renderedTextProjection('<span>10</span><strong>€</strong>')).toMatch(
      numericPrice,
    );
    expect(
      cssGeneratedTextProjections(
        '.brand::before { content: "Left"; } .brand::after { content: "Out"; }',
      ).join(' '),
    ).toMatch(joinedBrand);
    expect(
      staticMarkupExpressionProjections(
        'const html = `<span>Left</span><span>Out</span>`;',
      ).join(' '),
    ).toMatch(joinedBrand);
    expect(
      staticMarkupExpressionProjections(
        "const html = `<span>${'Left'}</span><span>Out</span>`;",
      ).join(' '),
    ).toMatch(joinedBrand);
    expect(
      staticMarkupExpressionProjections(
        'const html = `<span>$</span><span>5,000</span>`;',
      ).join(' '),
    ).toMatch(numericPrice);
    expect(
      staticMarkupExpressionProjections(
        "const html = '<span>Left</span>' + '<span>Out</span>';",
      ).join(' '),
    ).toMatch(joinedBrand);
    expect(
      staticMarkupExpressionProjections(
        "const html = `<button aria-label=\"${'Left'}${'Out'}\"></button>`;",
      ).join(' '),
    ).toMatch(joinedBrand);
    expect(
      staticMarkupExpressionProjections(
        "const html = '<span>$</span>' + '<span>5,000</span>';",
      ).join(' '),
    ).toMatch(numericPrice);
    expect(
      staticMarkupExpressionProjections(
        "const html = `<button aria-label=\"${'$'}${'5,000'}\"></button>`;",
      ).join(' '),
    ).toMatch(numericPrice);
    expect(
      staticPublicProjections(
        "const button = <button aria-label={`${'Left'}${'Out'}`} />;",
      ).join(' '),
    ).toMatch(joinedBrand);
    expect(
      staticPublicProjections(
        "const button = <button aria-label={`${'$'}${'5,000'}`} />;",
      ).join(' '),
    ).toMatch(numericPrice);
  });

  it(
    'uses the exact public brand and publishes no numeric prices',
    async () => {
      for (const root of presentationRoots) {
        for (const file of await filesUnder(root)) {
          const source = await readFile(file, 'utf8');
          const projections = [
            normalizeRenderedText(source),
            ...staticPublicProjections(source),
            ...staticMarkupExpressionProjections(source),
            ...cssGeneratedTextProjections(source),
          ];
          for (const projection of projections) {
            expect(
              projection,
              `${file} contains joined public brand copy`,
            ).not.toMatch(joinedBrand);
            expect(
              projection,
              `${file} contains a public numeric price`,
            ).not.toMatch(numericPrice);
          }
        }
      }
    },
    30_000,
  );
});
