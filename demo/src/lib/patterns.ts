/**
 * Maps a capability page (route) + the selected language stack to the public URL of its
 * implementation pattern doc (`docs/patterns/<lang>/<slug>.md`).
 *
 * The pattern docs live in the repo and render on GitHub; picking a language on the home page
 * (see languages.ts) changes which language's pattern a page links to — the doc for `python`
 * traces the same capability through the Python client + server, and so on. The base URL is
 * overridable via `VITE_PATTERNS_DOCS_URL` so a fork can point at its own published location.
 */
import { getLanguageId } from './languages';

const PATTERNS_BASE_URL =
  import.meta.env.VITE_PATTERNS_DOCS_URL ??
  'https://github.com/stackific/mcp-sdk/blob/main/docs/patterns';

/**
 * The sidebar routes that have a published pattern, mapped to their `.md` slug. Mirrors the
 * NAV in app-layout.tsx; the home route (`/`) documents Overview & Discovery.
 */
const ROUTE_TO_SLUG: Readonly<Record<string, string>> = {
  '/': 'overview',
  '/foundations': 'foundations',
  '/json-model': 'json-model',
  '/jsonrpc': 'jsonrpc',
  '/meta': 'meta',
  '/stateless': 'stateless',
  '/capabilities': 'capabilities',
  '/extensions': 'extensions',
  '/transport': 'transport',
  '/mrtr': 'mrtr',
  '/pagination': 'pagination',
  '/caching': 'caching',
  '/content': 'content',
  '/progress': 'progress',
  '/logging': 'logging',
  '/tracing': 'tracing',
  '/notifications': 'notifications',
  '/subscriptions': 'subscriptions',
  '/tools': 'tools',
  '/resources': 'resources',
  '/templates': 'templates',
  '/prompts': 'prompts',
  '/completion': 'completion',
  '/elicitation': 'elicitation',
  '/sampling': 'sampling',
  '/roots': 'roots',
  '/errors': 'errors',
  '/authorization': 'authorization',
  '/tasks': 'tasks',
  '/apps': 'apps',
  '/lifecycle': 'lifecycle',
  '/security': 'security',
  '/conformance': 'conformance',
  '/registries': 'registries',
};

/**
 * The pattern-doc URL for a route in the currently selected language, or `null` when the route
 * has no pattern (so callers render nothing rather than a broken link).
 */
export function patternDocUrl(pathname: string): string | null {
  const slug = ROUTE_TO_SLUG[pathname];
  if (!slug) return null;
  return `${PATTERNS_BASE_URL}/${getLanguageId()}/${slug}.md`;
}
