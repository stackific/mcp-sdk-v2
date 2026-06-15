/**
 * Tests for S27 — Resources II: reading, not-found, subscriptions & URI schemes
 * (§17.5–§17.9).
 *
 * AC coverage:
 *  AC-27.1  (R-17.5-a,b,d,f)        — read params: uri required + URI format; retry fields optional
 *  AC-27.2  (R-17.5-c)             — uri from list OR template expansion accepted
 *  AC-27.3  (R-17.5-e,g,h,x)       — retry: every inputRequests key answered; requestState echoed verbatim
 *  AC-27.4  (R-17.5-i,q,r)         — result: contents array, resultType "complete", ttlMs≥0 + cacheScope
 *  AC-27.5  (R-17.5-j,p)           — directory: multiple entries; entry uri MAY differ
 *  AC-27.6  (R-17.5-k,l,s,t)       — text entry: uri + text required
 *  AC-27.7  (R-17.5-k,m,n,o,u,v)   — blob entry: uri + base64 blob; no text field
 *  AC-27.8  (R-17.5-w)             — input_required read variant
 *  AC-27.9  (R-17.5-y)             — https uri MAY be fetched directly
 *  AC-27.10 (R-17.5-z,aa, R-17.6-a,b) — not-found → -32602 + data.uri; never empty contents
 *  AC-27.11 (R-17.6-c)             — legacy -32002 accepted as not-found
 *  AC-27.12 (R-17.6-d)             — internal failure → -32603
 *  AC-27.13 (R-17.7-a)             — no subscribe/unsubscribe request method
 *  AC-27.14 (R-17.7-b,c,d)         — list_changed delivered on resourcesListChanged filter
 *  AC-27.15 (R-17.7-e)             — list_changed NOT delivered without the filter
 *  AC-27.16 (R-17.7-f,g,h,i,k)     — updated notification: uri (MAY be sub-resource); client re-reads
 *  AC-27.17 (R-17.7-j)             — no updated for unsubscribed resource
 *  AC-27.18 (R-17.9-a,e,f)         — scheme registry non-exhaustive; custom scheme RFC3986
 *  AC-27.19 (R-17.9-b,c)           — https only for direct fetch; else other scheme
 *  AC-27.20 (R-17.9-d)             — file:// non-regular file MAY use inode/directory
 */

import { describe, it, expect } from 'vitest';
import {
  RESOURCES_READ_METHOD,
  RESOURCE_NOT_FOUND_CODE,
  LEGACY_RESOURCE_NOT_FOUND_CODE,
  RESOURCE_READ_INTERNAL_ERROR_CODE,
  isResourceNotFoundCode,
  buildResourceNotFoundError,
  buildResourceReadInternalError,
  ReadResourceRequestParamsSchema,
  ReadResourceRequestSchema,
  mayReadResource,
  buildReadResourceRequestParams,
  buildReadResourceRetryParams,
  ReadResourceResultSchema,
  InputRequiredReadResultSchema,
  isInputRequiredReadResult,
  buildReadResourceResult,
  ResourceListChangedNotificationSchema,
  ResourceUpdatedNotificationSchema,
  buildResourceListChangedNotification,
  buildResourceUpdatedNotification,
  mayNotifyResourceUpdated,
  mayNotifyResourcesListChanged,
  RESOURCE_SUBSCRIBE_REQUEST_METHODS,
  isResourceSubscribeRequestMethod,
  WELL_KNOWN_URI_SCHEMES,
  INODE_DIRECTORY_MIME_TYPE,
  uriScheme,
  isCustomUriScheme,
  isHttpsResourceUri,
  mayFetchDirectly,
  recommendedUriScheme,
  shouldUseHttpsScheme,
} from '../../protocol/resources-read.js';
import { RESULT_TYPE } from '../../jsonrpc/payload.js';
import { INVALID_PARAMS_CODE } from '../../protocol/meta.js';
import { buildResourcesCapability } from '../../protocol/resources.js';
import type { SubscriptionFilter } from '../../protocol/streaming.js';

const TEXT_URI = 'file:///project/src/main.rs';
const HTTPS_URI = 'https://example.com/doc.txt';

// A valid base64 PNG blob (from the story wire example).
const PNG_BLOB =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('method name & capability gating', () => {
  it('fixes the resources/read method name', () => {
    expect(RESOURCES_READ_METHOD).toBe('resources/read');
  });

  it('mayReadResource gates on the resources capability (S26 reuse)', () => {
    expect(mayReadResource({ resources: buildResourcesCapability() })).toBe(true);
    expect(mayReadResource({})).toBe(false);
  });
});

// ─── AC-27.1 ─────────────────────────────────────────────────────────────────
describe('AC-27.1 — read params (R-17.5-a,b,d,f)', () => {
  it('accepts a minimal params object with only uri', () => {
    const parsed = ReadResourceRequestParamsSchema.safeParse({ uri: TEXT_URI });
    expect(parsed.success).toBe(true);
  });

  it('rejects params missing uri', () => {
    expect(ReadResourceRequestParamsSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a uri that is not in URI format (no scheme)', () => {
    expect(ReadResourceRequestParamsSchema.safeParse({ uri: 'not a uri' }).success).toBe(false);
    expect(ReadResourceRequestParamsSchema.safeParse({ uri: '/relative/path' }).success).toBe(false);
  });

  it('accepts the OPTIONAL inputResponses, requestState and _meta fields', () => {
    const parsed = ReadResourceRequestParamsSchema.safeParse({
      uri: TEXT_URI,
      inputResponses: { askName: { action: 'accept' } },
      requestState: 'opaque-token',
      _meta: { 'vendor/x': 1 },
    });
    expect(parsed.success).toBe(true);
  });

  it('the full request envelope requires the method literal and params', () => {
    expect(
      ReadResourceRequestSchema.safeParse({
        method: 'resources/read',
        params: { uri: TEXT_URI },
      }).success,
    ).toBe(true);
    expect(
      ReadResourceRequestSchema.safeParse({ method: 'resources/list', params: { uri: TEXT_URI } })
        .success,
    ).toBe(false);
  });

  it('buildReadResourceRequestParams omits retry fields on a first attempt', () => {
    expect(buildReadResourceRequestParams(TEXT_URI)).toEqual({ uri: TEXT_URI });
  });

  it('buildReadResourceRequestParams throws on a non-URI uri', () => {
    expect(() => buildReadResourceRequestParams('not a uri')).toThrow(TypeError);
  });
});

// ─── AC-27.2 ─────────────────────────────────────────────────────────────────
describe('AC-27.2 — uri from list or template expansion (R-17.5-c)', () => {
  it('accepts a concrete list uri and an expanded-template uri alike', () => {
    const fromList = 'file:///project/notes/readme.txt';
    const fromTemplate = 'db://customers/42'; // result of expanding db://customers/{id}
    expect(ReadResourceRequestParamsSchema.safeParse({ uri: fromList }).success).toBe(true);
    expect(ReadResourceRequestParamsSchema.safeParse({ uri: fromTemplate }).success).toBe(true);
  });
});

// ─── AC-27.3 ─────────────────────────────────────────────────────────────────
describe('AC-27.3 — retry params (R-17.5-e,g,h,x)', () => {
  it('answers every inputRequests key and echoes requestState byte-for-byte', () => {
    const inputRequests = { askName: { method: 'elicitation/create' }, askAge: { method: 'elicitation/create' } };
    const inputResponses = { askName: { action: 'accept' }, askAge: { action: 'accept' } };
    const state = 'STATE::{opaque}::do-not-touch';
    const params = buildReadResourceRetryParams(TEXT_URI, inputRequests, inputResponses, state);
    expect(params.uri).toBe(TEXT_URI);
    expect(params.inputResponses).toEqual(inputResponses);
    expect(params.requestState).toBe(state); // verbatim, unmodified
  });

  it('throws when an inputRequests key is left unanswered', () => {
    expect(() =>
      buildReadResourceRetryParams(
        TEXT_URI,
        { askName: {}, askAge: {} },
        { askName: { action: 'accept' } },
      ),
    ).toThrow(/missing: askAge/);
  });

  it('omits requestState when the server never supplied one', () => {
    const params = buildReadResourceRetryParams(TEXT_URI, {}, {});
    expect(params.requestState).toBeUndefined();
  });
});

// ─── AC-27.4 ─────────────────────────────────────────────────────────────────
describe('AC-27.4 — ReadResourceResult shape (R-17.5-i,q,r)', () => {
  const result = {
    resultType: 'complete',
    contents: [{ uri: TEXT_URI, mimeType: 'text/x-rust', text: 'fn main() {}' }],
    ttlMs: 60000,
    cacheScope: 'private',
  };

  it('accepts a complete result with contents, ttlMs≥0 and cacheScope', () => {
    expect(ReadResourceResultSchema.safeParse(result).success).toBe(true);
  });

  it('rejects a non-"complete" resultType', () => {
    expect(
      ReadResourceResultSchema.safeParse({ ...result, resultType: 'input_required' }).success,
    ).toBe(false);
  });

  it('requires the caching fields', () => {
    const { ttlMs, ...noTtl } = result;
    void ttlMs;
    expect(ReadResourceResultSchema.safeParse(noTtl).success).toBe(false);
    expect(ReadResourceResultSchema.safeParse({ ...result, cacheScope: 'shared' }).success).toBe(false);
  });

  it('rejects a negative ttlMs', () => {
    expect(ReadResourceResultSchema.safeParse({ ...result, ttlMs: -1 }).success).toBe(false);
  });

  it('buildReadResourceResult produces a valid complete result', () => {
    const built = buildReadResourceResult(
      [{ uri: TEXT_URI, text: 'fn main() {}' }],
      { ttlMs: 0, cacheScope: 'private' },
    );
    expect(built.resultType).toBe(RESULT_TYPE.COMPLETE);
    expect(ReadResourceResultSchema.safeParse(built).success).toBe(true);
  });

  it('buildReadResourceResult throws on a negative ttlMs', () => {
    expect(() =>
      buildReadResourceResult([{ uri: TEXT_URI, text: 'x' }], { ttlMs: -5, cacheScope: 'public' }),
    ).toThrow(RangeError);
  });
});

// ─── AC-27.5 ─────────────────────────────────────────────────────────────────
describe('AC-27.5 — directory: multiple entries, differing uri (R-17.5-j,p)', () => {
  it('accepts multiple entries whose uri differs from the requested container', () => {
    const result = buildReadResourceResult(
      [
        { uri: 'file:///project/notes/readme.txt', mimeType: 'text/plain', text: 'see logo.png' },
        { uri: 'file:///project/notes/logo.png', mimeType: 'image/png', blob: PNG_BLOB },
      ],
      { ttlMs: 0, cacheScope: 'private' },
    );
    expect(result.contents).toHaveLength(2);
    expect(result.contents[0]!.uri).not.toBe('file:///project/notes'); // sub-resource uri differs
    expect(ReadResourceResultSchema.safeParse(result).success).toBe(true);
  });
});

// ─── AC-27.6 ─────────────────────────────────────────────────────────────────
describe('AC-27.6 — text content entry (R-17.5-k,l,s,t)', () => {
  it('accepts a text entry with required uri and text', () => {
    const result = { resultType: 'complete', ttlMs: 0, cacheScope: 'private', contents: [{ uri: TEXT_URI, text: 'hi' }] };
    expect(ReadResourceResultSchema.safeParse(result).success).toBe(true);
  });

  it('rejects a text entry missing uri or text', () => {
    const base = { resultType: 'complete', ttlMs: 0, cacheScope: 'private' };
    expect(ReadResourceResultSchema.safeParse({ ...base, contents: [{ text: 'hi' }] }).success).toBe(false);
    expect(ReadResourceResultSchema.safeParse({ ...base, contents: [{ uri: TEXT_URI }] }).success).toBe(false);
  });
});

// ─── AC-27.7 ─────────────────────────────────────────────────────────────────
describe('AC-27.7 — binary content entry (R-17.5-k,m,n,o,u,v)', () => {
  const base = { resultType: 'complete', ttlMs: 0, cacheScope: 'private' };

  it('accepts a blob entry with required uri and base64 blob, no text', () => {
    const result = { ...base, contents: [{ uri: 'file:///logo.png', mimeType: 'image/png', blob: PNG_BLOB }] };
    expect(ReadResourceResultSchema.safeParse(result).success).toBe(true);
  });

  it('rejects an entry carrying BOTH text and blob (R-17.5-n)', () => {
    const result = { ...base, contents: [{ uri: 'file:///x', text: 'x', blob: PNG_BLOB }] };
    expect(ReadResourceResultSchema.safeParse(result).success).toBe(false);
  });

  it('rejects a blob that is not valid base64 (R-17.5-o)', () => {
    const result = { ...base, contents: [{ uri: 'file:///x', blob: 'not base64 !!!' }] };
    expect(ReadResourceResultSchema.safeParse(result).success).toBe(false);
  });

  it('rejects a blob entry missing uri', () => {
    const result = { ...base, contents: [{ blob: PNG_BLOB }] };
    expect(ReadResourceResultSchema.safeParse(result).success).toBe(false);
  });
});

// ─── AC-27.8 ─────────────────────────────────────────────────────────────────
describe('AC-27.8 — input_required read variant (R-17.5-w)', () => {
  it('recognizes the input_required variant', () => {
    const reply = { resultType: 'input_required', requestState: 'tok' };
    expect(InputRequiredReadResultSchema.safeParse(reply).success).toBe(true);
    expect(isInputRequiredReadResult(reply)).toBe(true);
  });

  it('distinguishes a complete read result from the input_required variant', () => {
    const done = buildReadResourceResult([{ uri: TEXT_URI, text: 'x' }], { ttlMs: 0, cacheScope: 'private' });
    expect(isInputRequiredReadResult(done)).toBe(false);
    // a complete result MUST NOT validate as the input_required variant
    expect(InputRequiredReadResultSchema.safeParse(done).success).toBe(false);
  });
});

// ─── AC-27.9 ─────────────────────────────────────────────────────────────────
describe('AC-27.9 — direct https fetch (R-17.5-y)', () => {
  it('an https uri MAY be fetched directly', () => {
    expect(isHttpsResourceUri(HTTPS_URI)).toBe(true);
    expect(mayFetchDirectly(HTTPS_URI)).toBe(true);
  });

  it('a non-https uri may NOT be fetched directly', () => {
    expect(mayFetchDirectly(TEXT_URI)).toBe(false);
    expect(mayFetchDirectly('git://repo/x')).toBe(false);
  });
});

// ─── AC-27.10 ────────────────────────────────────────────────────────────────
describe('AC-27.10 — not-found error (R-17.5-z,aa, R-17.6-a,b)', () => {
  it('builds a -32602 error with the offending uri in data', () => {
    const err = buildResourceNotFoundError('file:///nonexistent.txt');
    expect(err.code).toBe(-32602);
    expect(err.code).toBe(INVALID_PARAMS_CODE);
    expect(RESOURCE_NOT_FOUND_CODE).toBe(INVALID_PARAMS_CODE);
    expect(err.data.uri).toBe('file:///nonexistent.txt');
    expect(typeof err.message).toBe('string');
  });

  it('a server MUST NOT signal non-existence with an empty contents array', () => {
    expect(() => buildReadResourceResult([], { ttlMs: 0, cacheScope: 'private' })).toThrow(RangeError);
  });
});

// ─── AC-27.11 ────────────────────────────────────────────────────────────────
describe('AC-27.11 — legacy -32002 acceptance (R-17.6-c)', () => {
  it('treats both -32602 and legacy -32002 as resource-not-found', () => {
    expect(LEGACY_RESOURCE_NOT_FOUND_CODE).toBe(-32002);
    expect(isResourceNotFoundCode(-32602)).toBe(true);
    expect(isResourceNotFoundCode(-32002)).toBe(true);
    expect(isResourceNotFoundCode(-32603)).toBe(false);
  });
});

// ─── AC-27.12 ────────────────────────────────────────────────────────────────
describe('AC-27.12 — internal error (R-17.6-d)', () => {
  it('uses -32603 for failures unrelated to uri validity', () => {
    expect(RESOURCE_READ_INTERNAL_ERROR_CODE).toBe(-32603);
    const err = buildResourceReadInternalError();
    expect(err.code).toBe(-32603);
  });
});

// ─── AC-27.13 ────────────────────────────────────────────────────────────────
describe('AC-27.13 — no subscribe/unsubscribe method (R-17.7-a)', () => {
  it('exposes no per-resource subscribe/unsubscribe request method', () => {
    expect(RESOURCE_SUBSCRIBE_REQUEST_METHODS).toEqual([]);
    expect(isResourceSubscribeRequestMethod('resources/subscribe')).toBe(false);
    expect(isResourceSubscribeRequestMethod('resources/unsubscribe')).toBe(false);
  });
});

// ─── AC-27.14 ────────────────────────────────────────────────────────────────
describe('AC-27.14 — list_changed delivered on filter opt-in (R-17.7-b,c,d)', () => {
  it('delivers list_changed only when resourcesListChanged is set', () => {
    const filter: SubscriptionFilter = { resourcesListChanged: true };
    expect(mayNotifyResourcesListChanged(filter)).toBe(true);
  });

  it('builds a valid list_changed notification (no required params)', () => {
    const note = buildResourceListChangedNotification();
    expect(note.method).toBe('notifications/resources/list_changed');
    expect(ResourceListChangedNotificationSchema.safeParse(note).success).toBe(true);
    const withMeta = buildResourceListChangedNotification({ _meta: { 'vendor/x': 1 } });
    expect(ResourceListChangedNotificationSchema.safeParse(withMeta).success).toBe(true);
  });
});

// ─── AC-27.15 ────────────────────────────────────────────────────────────────
describe('AC-27.15 — list_changed withheld without the filter (R-17.7-e)', () => {
  it('does NOT deliver list_changed when the filter did not request it', () => {
    expect(mayNotifyResourcesListChanged({})).toBe(false);
    expect(mayNotifyResourcesListChanged({ resourcesListChanged: false })).toBe(false);
  });
});

// ─── AC-27.16 ────────────────────────────────────────────────────────────────
describe('AC-27.16 — updated notification (R-17.7-f,g,h,i,k)', () => {
  it('builds a valid updated notification with required uri and subscription id', () => {
    const note = buildResourceUpdatedNotification(TEXT_URI, '4');
    expect(note.method).toBe('notifications/resources/updated');
    expect(note.params.uri).toBe(TEXT_URI);
    expect(note.params._meta['io.modelcontextprotocol/subscriptionId']).toBe('4');
    expect(ResourceUpdatedNotificationSchema.safeParse(note).success).toBe(true);
  });

  it('may deliver an update for a subscribed uri (exact match)', () => {
    const filter: SubscriptionFilter = { resourceSubscriptions: [TEXT_URI] };
    expect(mayNotifyResourceUpdated(TEXT_URI, filter)).toBe(true);
  });

  it('the updated uri MAY be a sub-resource of a subscribed container (R-17.7-h)', () => {
    const filter: SubscriptionFilter = { resourceSubscriptions: ['file:///project/src'] };
    expect(mayNotifyResourceUpdated('file:///project/src/main.rs', filter)).toBe(true);
  });
});

// ─── AC-27.17 ────────────────────────────────────────────────────────────────
describe('AC-27.17 — no update for unsubscribed resource (R-17.7-j)', () => {
  it('does NOT deliver an update for a resource the client did not subscribe to', () => {
    const filter: SubscriptionFilter = { resourceSubscriptions: ['file:///project/src'] };
    expect(mayNotifyResourceUpdated('file:///other/file.txt', filter)).toBe(false);
    expect(mayNotifyResourceUpdated(TEXT_URI, {})).toBe(false); // no subscriptions at all
  });
});

// ─── AC-27.18 ────────────────────────────────────────────────────────────────
describe('AC-27.18 — scheme registry non-exhaustive; custom RFC3986 (R-17.9-a,e,f)', () => {
  it('lists the well-known schemes', () => {
    expect([...WELL_KNOWN_URI_SCHEMES]).toEqual(['https', 'file', 'git']);
  });

  it('extracts a (lower-cased) scheme from a URI', () => {
    expect(uriScheme('FILE:///x')).toBe('file');
    expect(uriScheme('custom-app.v2://x')).toBe('custom-app.v2');
    expect(uriScheme('not a uri')).toBeUndefined();
  });

  it('recognizes a custom scheme that conforms to RFC3986', () => {
    expect(isCustomUriScheme('myapp://thing/1')).toBe(true);
    expect(isCustomUriScheme('file:///x')).toBe(false); // well-known, not custom
    expect(isCustomUriScheme('git://repo/x')).toBe(false);
    expect(isCustomUriScheme('relative/ref')).toBe(false); // not RFC3986 (no scheme)
  });
});

// ─── AC-27.19 ────────────────────────────────────────────────────────────────
describe('AC-27.19 — scheme selection guidance (R-17.9-b,c)', () => {
  it('recommends https only when the client can fetch directly', () => {
    expect(shouldUseHttpsScheme(true)).toBe(true);
    expect(shouldUseHttpsScheme(false)).toBe(false);
    expect(recommendedUriScheme(true).scheme).toBe('https');
    expect(recommendedUriScheme(false).scheme).toBe('non-https');
  });
});

// ─── AC-27.20 ────────────────────────────────────────────────────────────────
describe('AC-27.20 — file:// non-regular file MIME (R-17.9-d)', () => {
  it('offers the inode/directory XDG type for non-regular files', () => {
    expect(INODE_DIRECTORY_MIME_TYPE).toBe('inode/directory');
    // A directory resource entry MAY carry this MIME type.
    const result = buildReadResourceResult(
      [{ uri: 'file:///project/notes', mimeType: INODE_DIRECTORY_MIME_TYPE, text: '' }],
      { ttlMs: 0, cacheScope: 'private' },
    );
    expect(result.contents[0]!.mimeType).toBe('inode/directory');
  });
});
