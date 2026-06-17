/**
 * Language-stack registry + selection.
 *
 * The frontend is shared across every language stack; picking a language only
 * changes which MCP *client host* (backend) the SPA talks to. Each stack runs its
 * own client on a fixed port (declared once in the root Taskfile and mirrored here
 * as defaults), so switching languages is just repointing the REST + wire-debug
 * base URL. The TypeScript and Python stacks are fully wired (real MCP via their
 * own SDKs); C# is a runnable placeholder that demonstrates the switch.
 */

const env = import.meta.env;

export type LanguageId = 'typescript' | 'python' | 'csharp';

export interface LanguageStack {
  id: LanguageId;
  label: string;
  /** Short runtime/framework tagline shown on the selection card. */
  tagline: string;
  /** REST base URL of this stack's MCP client host (the backend the SPA drives). */
  clientUrl: string;
  /** 'ready' = fully implemented; 'preview' = runnable placeholder. */
  status: 'ready' | 'preview';
}

export const LANGUAGES: readonly LanguageStack[] = [
  {
    id: 'typescript',
    label: 'TypeScript',
    tagline: 'Hono + @stackific/mcp-sdk · Node',
    // Honour the legacy VITE_BACKEND_URL so existing TS-only setups keep working.
    clientUrl: env.VITE_TS_CLIENT_URL ?? env.VITE_BACKEND_URL ?? 'http://localhost:8002',
    status: 'ready',
  },
  {
    id: 'python',
    label: 'Python',
    tagline: 'FastAPI · uv · py-sdk',
    clientUrl: env.VITE_PY_CLIENT_URL ?? 'http://localhost:8102',
    status: 'ready',
  },
  {
    id: 'csharp',
    label: 'C#',
    tagline: 'Minimal API · .NET 10',
    clientUrl: env.VITE_CSHARP_CLIENT_URL ?? 'http://localhost:8202',
    status: 'ready',
  },
];

const STORAGE_KEY = 'mcp-language';
const DEFAULT_LANGUAGE: LanguageId = 'typescript';

/** The currently selected language id, read from localStorage (defaults to TypeScript). */
export function getLanguageId(): LanguageId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES.some((l) => l.id === saved)) return saved as LanguageId;
  } catch {
    // storage unavailable — fall back to the default
  }
  return DEFAULT_LANGUAGE;
}

/** The full stack descriptor for the current selection. */
export function getLanguage(): LanguageStack {
  const id = getLanguageId();
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0]!;
}

/**
 * Persists the selected language and reloads the page, so every module (api.ts,
 * debug.ts) re-initialises against the new client host. A reload is the simplest
 * correct way to swap the live SSE wire-debug connection and the REST base together.
 */
export function setLanguage(id: LanguageId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable — the selection can't persist across the reload below
  }
  window.location.reload();
}
