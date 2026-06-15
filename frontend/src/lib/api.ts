/**
 * Thin client for the backend, which hosts the MCP client. Every capability the SPA
 * exercises goes through here; the wire frames it produces arrive separately on the
 * debug SSE stream (see debug.ts).
 *
 * The base URL is resolved from the selected language stack (see languages.ts). The
 * selection is fixed for the lifetime of a page load — switching languages reloads
 * the page — so a module-level constant is correct here.
 */
import { getLanguage } from './languages';

export const BACKEND_URL = getLanguage().clientUrl;

export interface ApiOk<T> {
  ok: true;
  result: T;
}
export interface ApiErr {
  ok: false;
  error: { message: string; code?: number | string; data?: unknown };
}
export type ApiResult<T> = ApiOk<T> | ApiErr;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(BACKEND_URL + path);
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BACKEND_URL + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export interface BackendStatus {
  connected: boolean;
  negotiatedVersion?: string | null;
  serverInfo?: { name?: string; title?: string; version?: string } | null;
  serverCapabilities?: Record<string, unknown> | null;
  serverExtensions?: Record<string, unknown> | null;
  clientCapabilities?: Record<string, unknown> | null;
  roots?: { uri: string; name?: string }[];
  serverUrl?: string;
}

export const backend = {
  base: BACKEND_URL,
  health: () => getJson<{ status: string; sampling: string }>('/health'),
  info: () => getJson<Any>('/info'),
  status: () => getJson<BackendStatus>('/api/status'),
  connect: () => postJson<ApiResult<BackendStatus>>('/api/connect', {}),
  discover: () => getJson<ApiResult<Any>>('/api/discover'),
  listTools: () => getJson<ApiResult<Any>>('/api/tools'),
  callTool: (name: string, args: Record<string, unknown>) =>
    postJson<ApiResult<Any>>('/api/tools/call', { name, arguments: args }),
  callToolCancellable: (name: string, args: Record<string, unknown>, cancelId: string) =>
    postJson<ApiResult<Any>>('/api/tools/call-cancellable', { name, arguments: args, cancelId }),
  cancel: (cancelId: string) => postJson<{ ok: boolean }>('/api/cancel', { cancelId }),
  callToolTraced: (name: string, args: Record<string, unknown>, meta: Record<string, unknown>) =>
    postJson<ApiResult<Any>>('/api/tools/call-traced', { name, arguments: args, _meta: meta }),
  raw: (method: string, params: Record<string, unknown> = {}) =>
    postJson<ApiResult<Any>>('/api/raw', { method, params }),
  subscribe: (notifications: Record<string, unknown>) =>
    postJson<ApiResult<Any>>('/api/subscribe', { notifications }),
  createTask: (name: string, args: Record<string, unknown>, ttl?: number) =>
    postJson<ApiResult<Any>>('/api/tasks/create', { name, arguments: args, ttl }),
  getTask: (taskId: string) => postJson<ApiResult<Any>>('/api/tasks/get', { taskId }),
  runAuthFlow: () => postJson<ApiResult<Any>>('/api/authorize/run', {}),
  transportProbe: () => getJson<ApiResult<Any>>('/api/transport/probe'),
  ping: () => postJson<ApiResult<Any>>('/api/raw', { method: 'ping', params: {} }),
  listResources: () => getJson<ApiResult<Any>>('/api/resources'),
  listResourceTemplates: () => getJson<ApiResult<Any>>('/api/resource-templates'),
  readResource: (uri: string) => postJson<ApiResult<Any>>('/api/resources/read', { uri }),
  listPrompts: () => getJson<ApiResult<Any>>('/api/prompts'),
  getPrompt: (name: string, args: Record<string, string>) =>
    postJson<ApiResult<Any>>('/api/prompts/get', { name, arguments: args }),
  complete: (ref: unknown, argument: unknown, context?: unknown) =>
    postJson<ApiResult<Any>>('/api/complete', { ref, argument, context }),
  getRoots: () => getJson<{ roots: { uri: string; name?: string }[] }>('/api/roots'),
  setRoots: (roots: { uri: string; name?: string }[]) =>
    postJson<{ roots: Any[] }>('/api/roots', { roots }),
  resolveElicitation: (id: string, body: { action: string; content?: Record<string, unknown> }) =>
    postJson<{ ok: boolean }>(`/api/elicitation/${id}/resolve`, body),
};
