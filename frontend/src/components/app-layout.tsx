import { useEffect, useState } from 'react';

import { Link, Outlet } from '@tanstack/react-router';
import { Activity, Moon, Sun } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { useStatus } from '@/lib/debug';
import { getLanguage } from '@/lib/languages';
import { cn } from '@/lib/utils';

type Theme = 'dark' | 'light';

/** Applies the theme by toggling the `dark` class on <html> (Tailwind class strategy) + persists it. */
function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem('mcp-theme', theme);
  } catch {
    // storage unavailable — toggle still works for the session
  }
}

/** Dark/light theme toggle for the sidebar footer. */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('mcp-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // ignore
    }
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });
  useEffect(() => applyTheme(theme), [theme]);
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      data-testid="theme-toggle"
      onClick={() => setTheme(next)}
      className="shrink-0 rounded-md border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

interface NavItem {
  to: string;
  label: string;
  ch?: string;
  story?: string;
}

// Grouped by the spec's build-story Parts. Each item carries BOTH the book chapter(s) and the
// spec story id(s) it maps to (stories/S01–S46). See STORY-MAP.md.
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'I · Foundations',
    items: [
      { to: '/', label: 'Overview & Discovery', ch: 'Ch 9–11', story: 'S07–S09' },
      { to: '/foundations', label: 'Protocol Foundations', ch: 'Ch 1', story: 'S01' },
      { to: '/json-model', label: 'JSON Value Model', ch: 'Ch 2', story: 'S02' },
      { to: '/jsonrpc', label: 'JSON-RPC Framing', ch: 'Ch 3–4', story: 'S03–S04' },
      { to: '/meta', label: 'The _meta Envelope', ch: 'Ch 4', story: 'S05' },
      { to: '/stateless', label: 'Stateless Model', ch: 'Ch 4', story: 'S06' },
      { to: '/capabilities', label: 'Capabilities', ch: 'Ch 10', story: 'S10' },
      { to: '/extensions', label: 'Extensions Map', ch: 'Ch 11', story: 'S11·S38' },
    ],
  },
  {
    group: 'II · Transports',
    items: [{ to: '/transport', label: 'Transport & HTTP', ch: 'Ch 7–9', story: 'S12–S15' }],
  },
  {
    group: 'III · Interaction & utilities',
    items: [
      { to: '/mrtr', label: 'Multi-Round-Trip', ch: 'Ch 11', story: 'S17' },
      { to: '/pagination', label: 'Pagination', ch: 'Ch 30', story: 'S18' },
      { to: '/caching', label: 'Caching', ch: 'Ch 31', story: 'S19' },
      { to: '/content', label: 'Content Blocks', ch: 'Ch 14', story: 'S20–S21' },
      { to: '/progress', label: 'Progress & Cancel', ch: 'Ch 27–28', story: 'S22' },
      { to: '/logging', label: 'Logging', ch: 'Ch 29', story: 'S23' },
      { to: '/tracing', label: 'Tracing', ch: 'Ch 44', story: 'S23' },
      { to: '/notifications', label: 'Notifications', ch: 'Ch 24', story: 'S16' },
      { to: '/subscriptions', label: 'Subscriptions', ch: 'Ch 25–26', story: 'S16' },
    ],
  },
  {
    group: 'IV · Server features',
    items: [
      { to: '/tools', label: 'Tools', ch: 'Ch 13', story: 'S24–S25' },
      { to: '/resources', label: 'Resources', ch: 'Ch 14', story: 'S26–S27' },
      { to: '/templates', label: 'Resource Templates', ch: 'Ch 15', story: 'S26' },
      { to: '/prompts', label: 'Prompts', ch: 'Ch 16', story: 'S28' },
      { to: '/completion', label: 'Completion', ch: 'Ch 17', story: 'S29' },
    ],
  },
  {
    group: 'V · Client features (MRTR)',
    items: [
      { to: '/elicitation', label: 'Elicitation', ch: 'Ch 19–20', story: 'S30–S31' },
      { to: '/sampling', label: 'Sampling', ch: 'Ch 21', story: 'S33' },
      { to: '/roots', label: 'Roots', ch: 'Ch 22', story: 'S32' },
    ],
  },
  {
    group: 'VI · Errors & authorization',
    items: [
      { to: '/errors', label: 'Errors', ch: 'Ch 12', story: 'S34' },
      { to: '/authorization', label: 'Authorization', ch: 'Ch 40–41', story: 'S35–S37' },
    ],
  },
  {
    group: 'VII · Extensions',
    items: [
      { to: '/tasks', label: 'Tasks', ch: 'Ch 42', story: 'S39–S40' },
      { to: '/apps', label: 'MCP Apps (UI)', ch: 'Ch 43', story: 'S41–S42' },
    ],
  },
  {
    group: 'VIII · Governance',
    items: [
      { to: '/lifecycle', label: 'Feature Lifecycle', ch: 'Ch 27', story: 'S43' },
      { to: '/security', label: 'Security', ch: 'Ch 28', story: 'S44' },
      { to: '/conformance', label: 'Conformance', ch: 'Ch 29', story: 'S45' },
      { to: '/registries', label: 'Registries', ch: 'App. A–E', story: 'S46' },
    ],
  },
];

export function AppLayout() {
  const status = useStatus();
  const language = getLanguage();
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-200">
      <aside className="flex w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-900/40">
        <div className="border-b border-slate-800 px-4 py-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-400" />
            <span className="font-semibold text-slate-100">MCP V2 — Live Companion</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">A runnable companion to the MCP V2 RC book.</p>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-600">stack</span>
            <Badge variant="blue" data-testid="active-language">
              {language.label}
            </Badge>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-auto px-3 py-3">
          {NAV.map((section) => (
            <div key={section.group} className="mb-4">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {section.group}
              </div>
              {section.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === '/' }}
                  className="group flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800/60 [&.active]:bg-blue-600/15 [&.active]:text-blue-200"
                >
                  <span>{item.label}</span>
                  <span className="shrink-0 pl-2 text-right text-[9px] leading-tight text-slate-600 group-hover:text-slate-500">
                    {item.ch ? <span className="block">{item.ch}</span> : null}
                    {item.story ? (
                      <span className="block text-blue-400/50">{item.story}</span>
                    ) : null}
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="flex items-center justify-between gap-2 border-t border-slate-800 px-4 py-3 text-xs">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  status.connected ? 'bg-emerald-400' : 'bg-slate-600',
                )}
              />
              <span className="text-slate-400" data-testid="conn-status">
                {status.connected ? 'MCP client connected' : 'not connected'}
              </span>
            </div>
            {status.negotiatedVersion ? (
              <div className="mt-1 text-slate-500">
                protocol{' '}
                <span className="font-mono text-slate-300" data-testid="proto-version">
                  {status.negotiatedVersion}
                </span>
              </div>
            ) : null}
          </div>
          <ThemeToggle />
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-hidden p-6">
        <Outlet />
      </main>
    </div>
  );
}
