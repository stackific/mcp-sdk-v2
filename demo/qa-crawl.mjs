// Unattended QA crawler: drives the live companion SPA at http://localhost:8000
// with Playwright, visiting every page and clicking every interactive control,
// capturing what each interaction produced. Writes evidence JSON + screenshots
// under qa_per_page/_evidence/ for the human-readable QA reports.
//
// Note: the app keeps an open SSE debug stream, so 'networkidle' never settles —
// we use fixed settle waits and explicit selector waits instead.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../qa_per_page/_evidence');
const SCREENS = resolve(OUT, 'screens');
mkdirSync(SCREENS, { recursive: true });

const BASE = 'http://localhost:8000';

// Mirrors the sidebar NAV (app-layout.tsx). `/` first so the auto-connect runs.
const PAGES = [
  { n: 1, to: '/', slug: 'overview', label: 'Overview & Discovery', group: 'I · Foundations' },
  {
    n: 2,
    to: '/foundations',
    slug: 'foundations',
    label: 'Protocol Foundations',
    group: 'I · Foundations',
  },
  {
    n: 3,
    to: '/json-model',
    slug: 'json-model',
    label: 'JSON Value Model',
    group: 'I · Foundations',
  },
  { n: 4, to: '/jsonrpc', slug: 'jsonrpc', label: 'JSON-RPC Framing', group: 'I · Foundations' },
  { n: 5, to: '/meta', slug: 'meta', label: 'The _meta Envelope', group: 'I · Foundations' },
  { n: 6, to: '/stateless', slug: 'stateless', label: 'Stateless Model', group: 'I · Foundations' },
  {
    n: 7,
    to: '/capabilities',
    slug: 'capabilities',
    label: 'Capabilities',
    group: 'I · Foundations',
  },
  {
    n: 8,
    to: '/extensions',
    slug: 'extensions',
    label: 'Extensions Map',
    group: 'I · Foundations',
  },
  {
    n: 9,
    to: '/transport',
    slug: 'transport',
    label: 'Transport & HTTP',
    group: 'II · Transports',
  },
  {
    n: 10,
    to: '/mrtr',
    slug: 'mrtr',
    label: 'Multi-Round-Trip',
    group: 'III · Interaction & utilities',
  },
  {
    n: 11,
    to: '/pagination',
    slug: 'pagination',
    label: 'Pagination',
    group: 'III · Interaction & utilities',
  },
  {
    n: 12,
    to: '/caching',
    slug: 'caching',
    label: 'Caching',
    group: 'III · Interaction & utilities',
  },
  {
    n: 13,
    to: '/content',
    slug: 'content',
    label: 'Content Blocks',
    group: 'III · Interaction & utilities',
  },
  {
    n: 14,
    to: '/progress',
    slug: 'progress',
    label: 'Progress & Cancel',
    group: 'III · Interaction & utilities',
  },
  {
    n: 15,
    to: '/logging',
    slug: 'logging',
    label: 'Logging',
    group: 'III · Interaction & utilities',
  },
  {
    n: 16,
    to: '/tracing',
    slug: 'tracing',
    label: 'Tracing',
    group: 'III · Interaction & utilities',
  },
  {
    n: 17,
    to: '/notifications',
    slug: 'notifications',
    label: 'Notifications',
    group: 'III · Interaction & utilities',
  },
  {
    n: 18,
    to: '/subscriptions',
    slug: 'subscriptions',
    label: 'Subscriptions',
    group: 'III · Interaction & utilities',
  },
  { n: 19, to: '/tools', slug: 'tools', label: 'Tools', group: 'IV · Server features' },
  { n: 20, to: '/resources', slug: 'resources', label: 'Resources', group: 'IV · Server features' },
  {
    n: 21,
    to: '/templates',
    slug: 'templates',
    label: 'Resource Templates',
    group: 'IV · Server features',
  },
  { n: 22, to: '/prompts', slug: 'prompts', label: 'Prompts', group: 'IV · Server features' },
  {
    n: 23,
    to: '/completion',
    slug: 'completion',
    label: 'Completion',
    group: 'IV · Server features',
  },
  {
    n: 24,
    to: '/elicitation',
    slug: 'elicitation',
    label: 'Elicitation',
    group: 'V · Client features',
  },
  { n: 25, to: '/sampling', slug: 'sampling', label: 'Sampling', group: 'V · Client features' },
  { n: 26, to: '/roots', slug: 'roots', label: 'Roots', group: 'V · Client features' },
  { n: 27, to: '/errors', slug: 'errors', label: 'Errors', group: 'VI · Errors & authorization' },
  {
    n: 28,
    to: '/authorization',
    slug: 'authorization',
    label: 'Authorization',
    group: 'VI · Errors & authorization',
  },
  { n: 29, to: '/tasks', slug: 'tasks', label: 'Tasks', group: 'VII · Extensions' },
  { n: 30, to: '/apps', slug: 'apps', label: 'MCP Apps (UI)', group: 'VII · Extensions' },
  {
    n: 31,
    to: '/lifecycle',
    slug: 'lifecycle',
    label: 'Feature Lifecycle',
    group: 'VIII · Governance',
  },
  { n: 32, to: '/security', slug: 'security', label: 'Security', group: 'VIII · Governance' },
  {
    n: 33,
    to: '/conformance',
    slug: 'conformance',
    label: 'Conformance',
    group: 'VIII · Governance',
  },
  { n: 34, to: '/registries', slug: 'registries', label: 'Registries', group: 'VIII · Governance' },
];

const clip = (s, n = 2000) => (s == null ? '' : String(s).replace(/\s+\n/g, '\n').slice(0, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// Global capture buffers (sliced per-page / per-click).
const consoleMsgs = [];
const pageErrors = [];
const netFails = [];
const popups = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning')
    consoleMsgs.push({ type: m.type(), text: m.text() });
});
page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)));
page.on('requestfailed', (r) => {
  const f = r.failure();
  netFails.push({ url: r.url(), method: r.method(), error: f?.errorText });
});
page.on('response', (r) => {
  if (r.status() >= 400)
    netFails.push({ url: r.url(), method: r.request().method(), status: r.status() });
});
context.on('page', async (p) => {
  try {
    await p.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
    popups.push({ url: p.url(), title: await p.title().catch(() => '') });
    await p.close();
  } catch {
    /* ignore */
  }
});

const results = [];

async function readPanels() {
  return page
    .$$eval('main [data-testid="result-ok"], main [data-testid="result-error"]', (els) =>
      els.map((e) => ({ kind: e.getAttribute('data-testid'), text: e.innerText.slice(0, 800) })),
    )
    .catch(() => []);
}

for (const pg of PAGES) {
  const startConsole = consoleMsgs.length;
  const startErr = pageErrors.length;
  const startNet = netFails.length;

  const record = { ...pg, header: {}, interactions: [], load: {}, footer: {} };
  try {
    await page.goto(BASE + pg.to, { waitUntil: 'commit', timeout: 15000 });
    await page.waitForSelector('main h1', { timeout: 8000 }).catch(() => {});
    await sleep(1200); // let auto-load effects (lists, status) run

    record.header.title =
      (await page
        .locator('main h1')
        .first()
        .innerText()
        .catch(() => '')) || '';
    record.header.badges = await page
      .$$eval('main h1 ~ * .inline-flex, main .mb-4 .inline-flex', (els) =>
        els.map((e) => e.innerText.trim()).filter(Boolean),
      )
      .catch(() => []);
    record.header.description = clip(
      await page
        .locator('main .mb-4 p')
        .allInnerTexts()
        .then((a) => a.join('\n'))
        .catch(() => ''),
      900,
    );
    // Left column (the cards / interactive content).
    record.leftColumn = clip(
      await page
        .locator('main .lg\\:grid-cols-2 > div')
        .first()
        .innerText()
        .catch(() => ''),
      2500,
    );
    record.footer.connStatus = await page
      .locator('[data-testid="conn-status"]')
      .innerText()
      .catch(() => null);
    record.footer.protoVersion = await page
      .locator('[data-testid="proto-version"]')
      .innerText()
      .catch(() => null);
  } catch (e) {
    record.load.navError = String(e?.message ?? e);
  }

  // Click every enabled, visible button in <main>, across a few passes so
  // newly-revealed controls (e.g. an elicitation form) are also exercised.
  const clicked = new Set();
  for (let pass = 0; pass < 3; pass++) {
    let handles;
    try {
      handles = await page.$$('main button');
    } catch {
      break;
    }
    let didClick = false;
    for (let i = 0; i < handles.length; i++) {
      if (record.interactions.length >= 30) break;
      const b = handles[i];
      let text = '';
      try {
        text = (await b.innerText()).trim().replace(/\s+/g, ' ').slice(0, 60);
      } catch {
        continue; // detached
      }
      const sig = `${text}#${i}`;
      if (clicked.has(sig)) continue;
      clicked.add(sig);
      // Skip wire-panel frame rows (expandable JSON) and the wire "Clear" control —
      // they aren't page capability actions and only add noise to the report.
      if (/^[→←↳↘↗↙]/.test(text) || /#\d+$/.test(text) || text === 'Clear') continue;
      let disabled, visible;
      try {
        disabled = await b.isDisabled();
        visible = await b.isVisible();
      } catch {
        continue;
      }
      if (!visible) continue;

      const cBefore = consoleMsgs.length;
      const eBefore = pageErrors.length;
      const nBefore = netFails.length;
      const pBefore = popups.length;
      let clickErr = null;
      if (!disabled) {
        try {
          await b.click({ timeout: 3000 });
          didClick = true;
          await sleep(1100); // settle: backend round-trip + render
        } catch (e) {
          clickErr = String(e?.message ?? e);
        }
      }
      // If a server elicitation modal opened, record it and resolve it (Decline) so the
      // page isn't blocked and the originating tool call can complete and be observed.
      const modal = page.locator('[data-testid="elicitation-modal"]');
      if (await modal.count().catch(() => 0)) {
        const modalText = (await modal.innerText().catch(() => ''))
          .replace(/\s+/g, ' ')
          .slice(0, 220);
        (record.elicitationModals ??= []).push({ afterButton: text, text: modalText });
        const resolve = modal.getByRole('button', { name: /Decline|Cancel/ });
        if (await resolve.count().catch(() => 0)) {
          await resolve
            .first()
            .click({ timeout: 2000 })
            .catch(() => {});
          await sleep(900);
        }
      }
      record.interactions.push({
        button: text,
        disabledAtStart: disabled,
        clickError: clickErr,
        panels: disabled ? [] : await readPanels(),
        newConsole: consoleMsgs.slice(cBefore).map((m) => `${m.type}: ${m.text}`.slice(0, 200)),
        newPageErrors: pageErrors.slice(eBefore),
        newNetFails: netFails.slice(nBefore),
        newPopups: popups.slice(pBefore),
      });
    }
    if (!didClick) break;
  }

  await page
    .screenshot({
      path: resolve(SCREENS, `${String(pg.n).padStart(2, '0')}-${pg.slug}.png`),
      fullPage: true,
    })
    .catch(() => {});

  record.load.consoleErrors = consoleMsgs
    .slice(startConsole)
    .map((m) => `${m.type}: ${m.text}`.slice(0, 200));
  record.load.pageErrors = pageErrors.slice(startErr);
  record.load.netFails = netFails.slice(startNet);
  results.push(record);
  console.log(
    `[${pg.n}/${PAGES.length}] ${pg.to} — ${record.interactions.length} interactions, ${record.load.consoleErrors.length} console errs, ${record.load.netFails.length} net fails`,
  );
}

// Theme toggle (sidebar footer) — an interaction outside <main>.
let themeTest = {};
try {
  await page.goto(BASE + '/', { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="theme-toggle"]', { timeout: 5000 });
  const before = await page.evaluate(() => document.documentElement.className);
  await page.locator('[data-testid="theme-toggle"]').click();
  await sleep(400);
  const after = await page.evaluate(() => document.documentElement.className);
  await page.locator('[data-testid="theme-toggle"]').click();
  await sleep(300);
  const restored = await page.evaluate(() => document.documentElement.className);
  themeTest = { before, after, restored };
} catch (e) {
  themeTest = { error: String(e?.message ?? e) };
}

writeFileSync(
  resolve(OUT, 'evidence.json'),
  JSON.stringify({ generatedFrom: BASE, pages: results, themeTest }, null, 2),
);
console.log('\nWROTE', resolve(OUT, 'evidence.json'));
console.log('THEME', JSON.stringify(themeTest));

await browser.close();
