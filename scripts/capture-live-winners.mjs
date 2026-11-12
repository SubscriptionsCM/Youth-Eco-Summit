// Operator-only public capture. Run after capture-live-presentation.py; never uses an account.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import ts from 'typescript';

const directory = new URL('../.local/source-design-20261112/', import.meta.url);
const html = await readFile(new URL('pages/home.html', directory), 'utf8');
const script = html.match(/src="(\/_next\/static\/chunks\/app\/page-[a-z0-9]+\.js)"/);
if (!script) throw new Error('Current public homepage bundle was not found');
const response = await fetch(new URL(script[1], 'https://youthecosummit.com'));
if (!response.ok) throw new Error(`Public bundle HTTP ${response.status}`);
const body = await response.text();
const ast = ts.createSourceFile('public.js', body, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let records;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'JSON.parse' && ts.isStringLiteral(node.arguments[0])) {
    const value = JSON.parse(node.arguments[0].text);
    if (Array.isArray(value.Z3) && value.Z3.every(record => [2024, 2025, 2026].includes(record.year) && typeof record.name === 'string')) records = value.Z3;
  }
  ts.forEachChild(node, visit);
}
visit(ast); // Parse data literals only; source JavaScript is never evaluated.
if (!records?.length) throw new Error('Published winner data format changed; review before importing');
await writeFile(new URL('../winners-extracted.json', directory), JSON.stringify(records, null, 2) + '\n');
await writeFile(new URL('winner-provenance.json', directory), JSON.stringify({ source: response.url, sha256: createHash('sha256').update(body).digest('hex'), records: records.length }, null, 2));
const browser = await chromium.launch({ channel: 'chrome', headless: true, timeout: 30000 });
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto('https://youthecosummit.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  const panels = {};
  for (const year of [2024, 2025, 2026]) {
    await page.getByRole('tab', { name: `${year} winners` }).click();
    await page.waitForFunction(year => document.querySelector('#winner-edition-panel')?.getAttribute('aria-labelledby') === `winner-tab-${year}`, year);
    panels[year] = await page.locator('#winner-edition-panel').evaluate(element => element.outerHTML);
  }
  await writeFile(new URL('winner-panels.json', directory), JSON.stringify(panels, null, 2));
  console.log(JSON.stringify({ publicWinnerHighlights: records.length, editions: Object.keys(panels) }));
} finally { await browser.close(); }
