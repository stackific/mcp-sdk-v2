import { mkdirSync } from 'node:fs';

import { chromium } from 'playwright';

const BASE = process.env.FRONTEND_URL || 'http://localhost:8000';
const SHOT_DIR = process.env.SHOT_DIR || '/tmp/e2e';
mkdirSync(SHOT_DIR, { recursive: true });

const sel = (id) => `[data-testid="${id}"]`;

const checks = [
  {
    name: 'overview',
    path: '/',
    run: async (p) => {
      await p.click(sel('run-discover'));
      await p.waitForSelector(`${sel('result-error')}, ${sel('result-ok')}`, { timeout: 25000 });
    },
  },
  {
    name: 'tools',
    path: '/tools',
    run: async (p) => {
      await p.click(sel('run-tool'));
      await p.waitForSelector(sel('result-ok'), { timeout: 25000 });
    },
  },
  {
    name: 'resources',
    path: '/resources',
    run: async (p) => {
      await p.click(sel('run-read'));
      await p.waitForSelector(sel('result-ok'), { timeout: 25000 });
    },
  },
  {
    name: 'templates',
    path: '/templates',
    run: async (p) => {
      await p.click(sel('run-template-read'));
      await p.waitForSelector(sel('result-ok'), { timeout: 25000 });
    },
  },
  {
    name: 'prompts',
    path: '/prompts',
    run: async (p) => {
      await p.click(sel('run-prompt'));
      await p.waitForSelector(sel('result-ok'), { timeout: 25000 });
    },
  },
  {
    name: 'completion',
    path: '/completion',
    run: async (p) => {
      await p.click(sel('run-complete'));
      // Assert at least one real suggestion value (not the empty-state span).
      await p.waitForSelector(sel('completion-value'), { timeout: 25000 });
    },
  },
  {
    name: 'sampling',
    path: '/sampling',
    run: async (p) => {
      await p.click(sel('run-sampling'));
      await p.waitForSelector(sel('result-ok'), { timeout: 45000 });
    },
  },
  {
    name: 'roots',
    path: '/roots',
    run: async (p) => {
      await p.click(sel('run-roots'));
      await p.waitForSelector(sel('result-ok'), { timeout: 25000 });
    },
  },
  {
    name: 'notifications',
    path: '/notifications',
    run: async (p) => {
      await p.click(sel('run-notifications'));
      await p.waitForSelector(sel('result-ok'), { timeout: 30000 });
    },
  },
  {
    name: 'logging',
    path: '/logging',
    run: async (p) => {
      await p.click(sel('run-logging'));
      await p.waitForSelector(sel('result-ok'), { timeout: 30000 });
    },
  },
  {
    name: 'errors',
    path: '/errors',
    run: async (p) => {
      await p.click(sel('run-proto-error'));
      await p.waitForSelector(sel('result-error'), { timeout: 25000 });
    },
  },
  {
    name: 'elicitation-form',
    path: '/elicitation',
    run: async (p) => {
      await p.click(sel('run-elicit-form'));
      await p.waitForSelector(sel('elicitation-modal'), { timeout: 20000 });
      await p.fill('#elicit-username', 'ada');
      await p.fill('#elicit-email', 'ada@example.com');
      await p.click(sel('elicit-accept'));
      await p.waitForSelector(sel('result-ok'), { timeout: 25000 });
    },
  },
  {
    name: 'subscriptions',
    path: '/subscriptions',
    run: async (p) => {
      await p.click(sel('run-mutate'));
      await p.waitForSelector(sel('result-ok'), { timeout: 25000 });
    },
  },
  {
    name: 'progress',
    path: '/progress',
    run: async (p) => {
      await p.click(sel('run-progress-short'));
      await p.waitForSelector(`${sel('progress-label')}, ${sel('result-ok')}`, { timeout: 30000 });
      await p.waitForSelector(sel('result-ok'), { timeout: 30000 });
    },
  },
  {
    name: 'cancellation',
    path: '/progress',
    run: async (p) => {
      await p.click(sel('run-progress'));
      await p.waitForTimeout(1500);
      await p.click(sel('cancel-progress'));
      // Abort → the call rejects (result-error) or the server returns a cancelled result (result-ok).
      await p.waitForSelector(`${sel('result-error')}, ${sel('result-ok')}`, { timeout: 20000 });
    },
  },
  {
    name: 'pagination',
    path: '/pagination',
    run: async (p) => {
      await p.click(sel('run-pagination'));
      await p.waitForSelector(sel('paged-items'), { timeout: 25000 });
      await p.click(sel('run-next-page'));
      await p.waitForSelector(sel('result-ok'), { timeout: 25000 });
    },
  },
  {
    name: 'caching',
    path: '/caching',
    run: async (p) => {
      await p.click(sel('run-caching'));
      await p.waitForSelector(sel('cache-hints'), { timeout: 25000 });
    },
  },
  {
    name: 'tracing',
    path: '/tracing',
    run: async (p) => {
      await p.click(sel('run-tracing'));
      await p.waitForSelector(sel('trace-roundtrip'), { timeout: 25000 });
    },
  },
  {
    name: 'apps',
    path: '/apps',
    run: async (p) => {
      await p.click(sel('run-app'));
      await p.waitForSelector(sel('app-frame'), { timeout: 25000 });
      // The app renders inside the sandboxed iframe.
      await p.waitForSelector(sel('result-ok'), { timeout: 25000 });
    },
  },
  {
    name: 'tasks',
    path: '/tasks',
    run: async (p) => {
      await p.click(sel('run-task'));
      await p.waitForSelector(sel('task-status'), { timeout: 20000 });
      // Augmented call → poll → result; the final tasks/result payload renders as result-ok.
      await p.waitForSelector(sel('result-ok'), { timeout: 30000 });
    },
  },
  {
    name: 'authorization',
    path: '/authorization',
    run: async (p) => {
      await p.click(sel('run-auth'));
      await p.waitForSelector(sel('auth-steps'), { timeout: 30000 });
      // The flow ends with the server-validated identity from an authorized tools/call.
      await p.waitForSelector(sel('auth-identity'), { timeout: 30000 });
    },
  },

  // ── Story-coverage pages (uncovered stories now demonstrated) ──
  // Status/JsonBlock pages: clicking renders a <pre> readout of the live status.
  {
    name: 'foundations',
    path: '/foundations',
    run: async (p) => {
      await p.click(sel('run-foundations'));
      await p.waitForSelector('pre', { timeout: 25000 });
    },
  },
  {
    name: 'stateless',
    path: '/stateless',
    run: async (p) => {
      await p.click(sel('run-stateless'));
      await p.waitForSelector('pre', { timeout: 25000 });
    },
  },
  {
    name: 'capabilities',
    path: '/capabilities',
    run: async (p) => {
      await p.click(sel('run-capabilities'));
      await p.waitForSelector('pre', { timeout: 25000 });
    },
  },
  {
    name: 'extensions',
    path: '/extensions',
    run: async (p) => {
      await p.click(sel('run-extensions'));
      await p.waitForSelector('pre', { timeout: 25000 });
    },
  },
  // ApiResult pages: clicking yields result-ok.
  {
    name: 'json-model',
    path: '/json-model',
    run: async (p) => {
      await p.click(sel('run-json-model'));
      await p.waitForSelector(sel('result-ok'), { timeout: 25000 });
    },
  },
  {
    name: 'jsonrpc',
    path: '/jsonrpc',
    run: async (p) => {
      await p.click(sel('run-jsonrpc'));
      await p.waitForSelector(sel('result-ok'), { timeout: 25000 });
    },
  },
  {
    name: 'meta',
    path: '/meta',
    run: async (p) => {
      await p.click(sel('run-meta'));
      await p.waitForSelector(sel('result-ok'), { timeout: 25000 });
    },
  },
  {
    name: 'transport',
    path: '/transport',
    run: async (p) => {
      await p.click(sel('run-transport'));
      await p.waitForSelector(sel('result-ok'), { timeout: 25000 });
    },
  },
  {
    name: 'mrtr',
    path: '/mrtr',
    run: async (p) => {
      await p.click(sel('run-mrtr'));
      await p.waitForSelector(sel('result-ok'), { timeout: 45000 });
    },
  },
  {
    name: 'content',
    path: '/content',
    run: async (p) => {
      await p.click(sel('run-content'));
      await p.waitForSelector(sel('content-gallery'), { timeout: 25000 });
    },
  },
  {
    name: 'lifecycle',
    path: '/lifecycle',
    run: async (p) => {
      await p.waitForSelector(sel('lifecycle-table'), { timeout: 15000 });
      await p.click(sel('run-lifecycle'));
      await p.waitForSelector(sel('result-ok'), { timeout: 25000 });
    },
  },
  {
    name: 'security',
    path: '/security',
    run: async (p) => {
      await p.waitForSelector(sel('security-checklist'), { timeout: 15000 });
      await p.click(sel('run-security'));
    },
  },
  {
    name: 'conformance',
    path: '/conformance',
    run: async (p) => {
      await p.waitForSelector(sel('conformance-matrix'), { timeout: 15000 });
      await p.click(sel('run-conformance'));
    },
  },
  {
    name: 'registries',
    path: '/registries',
    run: async (p) => {
      await p.click(sel('run-registries'));
      await p.waitForSelector(sel('registry-methods'), { timeout: 25000 });
    },
  },
];

const browser = await chromium.launch();
const results = [];
for (const c of checks) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

  let ok = true;
  let err = '';
  try {
    await page.goto(BASE + c.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await c.run(page);
  } catch (e) {
    ok = false;
    err = e.message.split('\n')[0];
  }
  await page.screenshot({ path: `${SHOT_DIR}/${c.name}.png`, fullPage: true }).catch(() => {});
  const realErrors = consoleErrors.filter((e) => !/favicon|ResizeObserver/.test(e));
  if (realErrors.length) {
    ok = false;
    err = (err ? err + ' | ' : '') + 'console: ' + realErrors.slice(0, 2).join(' ;; ');
  }
  results.push({ name: c.name, ok, err });
  console.log(`${ok ? '✅' : '❌'} ${c.name}${ok ? '' : ' — ' + err}`);
  await ctx.close();
}
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pages passed`);
process.exit(failed.length ? 1 : 0);
