/** Reads an env var safely on Node and on edge runtimes (where `process` may be absent). */
function env(key: string): string | undefined {
  return typeof process !== 'undefined' ? process.env?.[key] : undefined;
}

// Load backend/.env (if present) before reading any configuration (Node only; a
// no-op on edge runtimes, which inject configuration through bindings instead).
if (typeof process !== 'undefined' && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(new URL('../.env', import.meta.url).pathname);
  } catch {
    // No .env file — fall back to the ambient environment.
  }
}

export const PORT = Number(env('BACKEND_PORT') ?? 8002);
// The app is MCP-server-agnostic: these point at any compliant server (see MCP_SERVER_REQUIREMENTS.md).
export const MCP_SERVER_URL = env('MCP_SERVER_URL') ?? 'http://localhost:8001/mcp';
export const AUTH_SERVER_URL = env('AUTH_SERVER_URL') ?? 'http://localhost:8003';
export const FRONTEND_URL = env('FRONTEND_URL') ?? 'http://localhost:8000';

export const DEEPSEEK_API_KEY = env('DEEPSEEK_API_KEY') ?? '';
export const DEEPSEEK_BASE_URL = env('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com/anthropic';
export const DEEPSEEK_MODEL = env('DEEPSEEK_MODEL') ?? 'deepseek-chat';
export const HAS_KEY = DEEPSEEK_API_KEY.length > 0;
