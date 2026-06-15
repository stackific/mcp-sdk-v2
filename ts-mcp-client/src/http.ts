/**
 * A thin, locally-typed wrapper over the global `fetch`. Importing `@hono/node-server`
 * (in index.ts) ambient-narrows the global `Response` type across the whole backend
 * compilation, dropping members like `status`/`headers`/`json`. This wrapper pins the
 * shape we actually use so the OAuth flow and the transport probe type-check cleanly.
 */
export interface HttpResponse {
  status: number;
  statusText: string;
  headers: { get(k: string): string | null; forEach(cb: (v: string, k: string) => void): void };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function httpFetch(url: string | URL, init?: any): Promise<HttpResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fetch as any)(url, init) as Promise<HttpResponse>;
}
