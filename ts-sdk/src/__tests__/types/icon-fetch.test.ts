/**
 * Tests for the secure icon fetch (§14.2): cross-origin/scheme-change redirect
 * refusal (R-14.2-p, TV-20.12) and credential-free requests (R-14.2-q, TV-20.13).
 */
import { describe, it, expect } from 'vitest';
import { fetchIcon, IconValidationError } from '../../types/icon.js';

/** A valid 1x1 PNG header (magic bytes are sufficient for validateIconBytes). */
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

function pngResponse(): Response {
  return new Response(PNG_BYTES, { status: 200, headers: { 'content-type': 'image/png' } });
}

function redirectTo(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

describe('fetchIcon — redirect protection (R-14.2-p)', () => {
  it('refuses a cross-origin redirect (TV-20.12)', async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      if (url === 'https://example.com/icon.png') return redirectTo('https://evil.example/icon.png');
      return pngResponse();
    }) as unknown as typeof fetch;

    await expect(
      fetchIcon('https://example.com/icon.png', { fetch: fakeFetch }),
    ).rejects.toBeInstanceOf(IconValidationError);
    // It must NOT have fetched the cross-origin target.
    expect(calls).not.toContain('https://evil.example/icon.png');
  });

  it('refuses a scheme-change redirect (https → http)', async () => {
    const fakeFetch = (async () => redirectTo('http://example.com/icon.png')) as unknown as typeof fetch;
    await expect(
      fetchIcon('https://example.com/icon.png', { fetch: fakeFetch }),
    ).rejects.toThrow(/scheme change/i);
  });

  it('follows a same-origin redirect and returns the validated bytes', async () => {
    const fakeFetch = (async (url: string) => {
      if (url === 'https://example.com/icon.png') return redirectTo('https://example.com/real.png');
      return pngResponse();
    }) as unknown as typeof fetch;

    const result = await fetchIcon('https://example.com/icon.png', { fetch: fakeFetch });
    expect(result.mimeType).toBe('image/png');
    expect(result.finalUrl).toBe('https://example.com/real.png');
  });
});

describe('fetchIcon — credential-free request (R-14.2-q, TV-20.13)', () => {
  it('omits credentials and sends no Authorization/Cookie header', async () => {
    let seenInit: RequestInit | undefined;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      seenInit = init;
      return pngResponse();
    }) as unknown as typeof fetch;

    await fetchIcon('https://example.com/icon.png', { fetch: fakeFetch });
    expect(seenInit?.credentials).toBe('omit');
    const headers = (seenInit?.headers ?? {}) as Record<string, string>;
    const keys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain('authorization');
    expect(keys).not.toContain('cookie');
  });
});

describe('fetchIcon — scheme gating (R-14.2-o)', () => {
  it('rejects a non-https/data scheme without fetching', async () => {
    const fakeFetch = (async () => pngResponse()) as unknown as typeof fetch;
    await expect(fetchIcon('http://example.com/icon.png', { fetch: fakeFetch })).rejects.toBeInstanceOf(
      IconValidationError,
    );
  });
});
