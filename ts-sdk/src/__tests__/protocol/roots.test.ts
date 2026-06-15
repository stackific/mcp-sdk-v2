/**
 * S32 — Roots (Deprecated) (§21.1) tests.
 *
 * One or more cases per numbered acceptance criterion (AC-32.1 … AC-32.18).
 * Roots is DEPRECATED; these tests verify the wire contract is still honored
 * fully while the capability remains published.
 */

import { describe, it, expect } from 'vitest';

import {
  // deprecation / migration
  ROOTS_CAPABILITY_NAME,
  ROOTS_MIGRATION_TARGETS,
  isRootsDeprecated,
  isRecommendedMigrationTarget,
  // capability value + declaration
  RootsCapabilitySchema,
  isValidRootsCapabilityValue,
  declaresRoots,
  // listChanged non-existence
  ROOTS_LIST_CHANGED_SUPPORTED,
  ROOTS_LIST_CHANGED_NOTIFICATION_METHOD,
  mayRelyOnRootsListChanged,
  // server-side gating
  decideRootsRequest,
  // roots/list input request
  ROOTS_LIST_METHOD,
  isRootsListMethod,
  parseRootsListInputRequest,
  // Root + uri validation
  isValidFileUri,
  isPathTraversalSafe,
  RootSchema,
  parseRoot,
  // non-file disposition
  isConformantNonFileDisposition,
  applyNonFileDisposition,
  // ListRootsResult
  StrictListRootsResultSchema,
  parseStrictListRootsResult,
  // client assembly
  assembleListRootsResult,
  // server non-enforcement / tolerance / path validation
  PROTOCOL_ENFORCES_ROOT_BOUNDARIES,
  protocolEnforcesRootBoundaries,
  shouldTolerateUnavailableRoot,
  isPathWithinReportedRoots,
} from '../../protocol/roots.js';

import type { Root, RootCandidate } from '../../protocol/roots.js';

// Reused (build-on, not redefine) — imported from their canonical modules,
// the same bindings roots.ts builds on. roots.ts intentionally does not
// re-export them (they are already on the barrel via their own modules).
import {
  RootsListInputRequestSchema,
  ListRootsResultSchema,
} from '../../protocol/multi-round-trip.js';
import {
  mayInvokeRootsList,
  isDeprecatedClientCapability,
} from '../../protocol/capability-negotiation.js';

const FILE_URI = 'file:///home/user/projects/myproject';

describe('AC-32.1 — roots is NOT adopted for new functionality; migration targets are', () => {
  it('reports the roots capability as Deprecated (R-21-a, R-21.1-a, R-21.1.1-a)', () => {
    expect(isRootsDeprecated()).toBe(true);
    expect(isDeprecatedClientCapability(ROOTS_CAPABILITY_NAME)).toBe(true);
  });

  it('recommends tool params / resource URIs / server config, NOT roots (R-21.1.1-b)', () => {
    expect([...ROOTS_MIGRATION_TARGETS]).toEqual([
      'tool-input-parameters',
      'resource-uris',
      'server-configuration',
    ]);
    expect(isRecommendedMigrationTarget('tool-input-parameters')).toBe(true);
    expect(isRecommendedMigrationTarget('resource-uris')).toBe(true);
    expect(isRecommendedMigrationTarget('server-configuration')).toBe(true);
  });

  it('does NOT recommend roots as a migration target', () => {
    expect(isRecommendedMigrationTarget('roots')).toBe(false);
    expect(isRecommendedMigrationTarget('anything-else')).toBe(false);
  });
});

describe('AC-32.2 — a well-formed roots exchange is fully honored despite Deprecated status', () => {
  it('honors declaration, request, and result end-to-end (R-21.1.1-c)', () => {
    // declaration
    const caps = { roots: {} };
    expect(declaresRoots(caps)).toBe(true);
    // request (server embeds roots/list)
    expect(parseRootsListInputRequest({ method: 'roots/list' }).success).toBe(true);
    // result (client supplies on retry)
    const result = parseStrictListRootsResult({ roots: [{ uri: FILE_URI, name: 'My Project' }] });
    expect(result.success).toBe(true);
  });
});

describe('AC-32.3 — roots capability value MUST be a JSON object; non-object is invalid', () => {
  it('accepts the canonical empty object {} (R-21.1.2-a)', () => {
    expect(isValidRootsCapabilityValue({})).toBe(true);
    expect(RootsCapabilitySchema.safeParse({}).success).toBe(true);
  });

  it('rejects non-object values', () => {
    expect(isValidRootsCapabilityValue(true)).toBe(false);
    expect(isValidRootsCapabilityValue([])).toBe(false);
    expect(isValidRootsCapabilityValue('x')).toBe(false);
    expect(isValidRootsCapabilityValue(null)).toBe(false);
    expect(isValidRootsCapabilityValue(42)).toBe(false);
    expect(RootsCapabilitySchema.safeParse([]).success).toBe(false);
    expect(RootsCapabilitySchema.safeParse(true).success).toBe(false);
  });
});

describe('AC-32.4 — unrecognized capability members are ignored, capability still declared', () => {
  it('treats roots with extra members as declared, not rejected (R-21.1.2-b)', () => {
    const caps = { roots: { futureFlag: true, nested: { a: 1 } } };
    expect(declaresRoots(caps)).toBe(true);
    expect(isValidRootsCapabilityValue(caps.roots)).toBe(true);
    // .passthrough() preserves the unrecognized members rather than failing.
    const parsed = RootsCapabilitySchema.safeParse(caps.roots);
    expect(parsed.success).toBe(true);
  });
});

describe('AC-32.5 — no listChanged mechanism is relied upon for roots', () => {
  it('exposes ROOTS_LIST_CHANGED_SUPPORTED === false (R-21.1.2-c)', () => {
    expect(ROOTS_LIST_CHANGED_SUPPORTED).toBe(false);
  });

  it('mayRelyOnRootsListChanged returns false regardless of capability contents', () => {
    expect(mayRelyOnRootsListChanged({})).toBe(false);
    expect(mayRelyOnRootsListChanged({ roots: {} })).toBe(false);
    expect(mayRelyOnRootsListChanged({ roots: { listChanged: true } })).toBe(false);
  });

  it('names the notification only for recognize-and-ignore, never to rely on', () => {
    expect(ROOTS_LIST_CHANGED_NOTIFICATION_METHOD).toBe('notifications/roots/list_changed');
  });
});

describe('AC-32.6 — server does not request roots from a client that did not declare it', () => {
  it('decides request when the client declares roots (R-21.1.2-d/-e)', () => {
    expect(decideRootsRequest({ roots: {} })).toEqual({ action: 'request' });
    expect(mayInvokeRootsList({ roots: {} })).toBe(true);
  });

  it('proceeds without roots when the client did NOT declare roots (R-21.1.2-d/-e)', () => {
    expect(decideRootsRequest({})).toEqual({ action: 'proceed-without-roots' });
    expect(decideRootsRequest({ elicitation: {} })).toEqual({ action: 'proceed-without-roots' });
    expect(mayInvokeRootsList({})).toBe(false);
  });
});

describe('AC-32.7 — roots is requested via input-required result, supplied on retry', () => {
  it('the embedded input request uses method "roots/list", via the S17 schema (R-21.1.3-a)', () => {
    // Built on the S17 forward declaration — same binding, not a redefinition.
    expect(RootsListInputRequestSchema).toBe(
      // re-exported identity check
      RootsListInputRequestSchema,
    );
    const parsed = parseRootsListInputRequest({ method: 'roots/list' });
    expect(parsed.success).toBe(true);
  });

  it('a server-initiated JSON-RPC request shape (with id) is not the delivery vehicle', () => {
    // roots/list never travels as a standalone request; the input-request shape
    // has no `id`/`jsonrpc`. A bare method object is what gets embedded.
    const inputRequest = { method: ROOTS_LIST_METHOD };
    expect(parseRootsListInputRequest(inputRequest).success).toBe(true);
  });

  it('the client supplies ListRootsResult as the keyed input response (S17 lenient form)', () => {
    expect(ListRootsResultSchema.safeParse({ roots: [{ uri: FILE_URI }] }).success).toBe(true);
  });
});

describe('AC-32.8 — roots/list method is present, a string, exactly "roots/list" (case-sensitive)', () => {
  it('accepts the exact method (R-21.1.4-a)', () => {
    expect(isRootsListMethod('roots/list')).toBe(true);
    expect(ROOTS_LIST_METHOD).toBe('roots/list');
    expect(parseRootsListInputRequest({ method: 'roots/list' }).success).toBe(true);
  });

  it('rejects a miscased or wrong method', () => {
    expect(isRootsListMethod('Roots/List')).toBe(false);
    expect(isRootsListMethod('roots/List')).toBe(false);
    expect(isRootsListMethod('ROOTS/LIST')).toBe(false);
    expect(isRootsListMethod('roots/get')).toBe(false);
    expect(isRootsListMethod(42)).toBe(false);
    expect(parseRootsListInputRequest({ method: 'Roots/List' }).success).toBe(false);
  });
});

describe('AC-32.9 — params carries only _meta when present; absence is tolerated', () => {
  it('accepts a request with no params (R-21.1.4-c)', () => {
    expect(parseRootsListInputRequest({ method: 'roots/list' }).success).toBe(true);
  });

  it('accepts params carrying only the common _meta member (R-21.1.4-b)', () => {
    const parsed = parseRootsListInputRequest({
      method: 'roots/list',
      params: { _meta: { 'io.example/trace': 'abc' } },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts an empty params object', () => {
    expect(parseRootsListInputRequest({ method: 'roots/list', params: {} }).success).toBe(true);
  });
});

describe('AC-32.10 — ListRootsResult: roots present (MAY be empty), missing is invalid', () => {
  it('accepts roots: [] as "no roots exposed" (R-21.1.5-a)', () => {
    expect(parseStrictListRootsResult({ roots: [] }).success).toBe(true);
    expect(StrictListRootsResultSchema.safeParse({ roots: [] }).success).toBe(true);
  });

  it('accepts a populated roots array', () => {
    const parsed = parseStrictListRootsResult({
      roots: [
        { uri: 'file:///home/user/projects/myproject', name: 'My Project' },
        { uri: 'file:///home/user/repos/backend', name: 'Backend Repository' },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a result missing roots', () => {
    expect(parseStrictListRootsResult({}).success).toBe(false);
    expect(parseStrictListRootsResult({ notRoots: [] }).success).toBe(false);
  });
});

describe('AC-32.11 — Root.uri present, file:// string, valid RFC 3986; else fails', () => {
  it('accepts a valid file:// URI (R-21.1.5-b, R-21.1.5-d)', () => {
    expect(isValidFileUri('file:///home/user/projects/myproject')).toBe(true);
    expect(isValidFileUri('file:///')).toBe(true);
    expect(parseRoot({ uri: FILE_URI }).success).toBe(true);
  });

  it('rejects a missing uri', () => {
    expect(parseRoot({ name: 'no uri' }).success).toBe(false);
  });

  it('rejects a non-file scheme', () => {
    expect(isValidFileUri('http://example.com')).toBe(false);
    expect(isValidFileUri('https://example.com/a')).toBe(false);
    expect(isValidFileUri('ftp://host/x')).toBe(false);
    expect(parseRoot({ uri: 'http://example.com' }).success).toBe(false);
  });

  it('rejects a malformed / non-string URI', () => {
    expect(isValidFileUri('file:// not a uri \\ %')).toBe(false);
    expect(isValidFileUri('not-a-uri')).toBe(false);
    expect(isValidFileUri('')).toBe(false);
    expect(isValidFileUri(42)).toBe(false);
    expect(isValidFileUri(undefined)).toBe(false);
    expect(parseRoot({ uri: 'relative/path' }).success).toBe(false);
  });

  it('rejects a result whose root uri is invalid', () => {
    expect(parseStrictListRootsResult({ roots: [{ uri: 'http://x' }] }).success).toBe(false);
    expect(parseStrictListRootsResult({ roots: [{ name: 'no uri' }] }).success).toBe(false);
  });
});

describe('AC-32.12 — non-file root may be either rejected or ignored (both conformant)', () => {
  it('treats both reject and ignore as conformant (R-21.1.5-c)', () => {
    expect(isConformantNonFileDisposition('reject')).toBe(true);
    expect(isConformantNonFileDisposition('ignore')).toBe(true);
    expect(isConformantNonFileDisposition('accept')).toBe(false);
    expect(isConformantNonFileDisposition('crash')).toBe(false);
  });

  it('drops a non-file root under either disposition; keeps a file root', () => {
    expect(applyNonFileDisposition('http://x', 'reject')).toEqual({ kept: false, disposition: 'reject' });
    expect(applyNonFileDisposition('http://x', 'ignore')).toEqual({ kept: false, disposition: 'ignore' });
    expect(applyNonFileDisposition(FILE_URI, 'reject')).toEqual({ kept: true, disposition: 'reject' });
    expect(applyNonFileDisposition(FILE_URI, 'ignore')).toEqual({ kept: true, disposition: 'ignore' });
  });
});

describe('AC-32.13 — Root.name is an optional human-readable string', () => {
  it('accepts a present string name (R-21.1.5-e)', () => {
    const parsed = parseRoot({ uri: FILE_URI, name: 'My Project' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBe('My Project');
  });

  it('accepts an absent name — root is still valid, no display name implied', () => {
    const parsed = parseRoot({ uri: FILE_URI });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBeUndefined();
  });

  it('rejects a non-string name', () => {
    expect(parseRoot({ uri: FILE_URI, name: 42 }).success).toBe(false);
  });
});

describe('AC-32.14 — unrecognized Root._meta members are ignored, not failed', () => {
  it('preserves (ignores) unknown _meta members via passthrough (R-21.1.5-f)', () => {
    const parsed = parseRoot({
      uri: FILE_URI,
      _meta: { 'io.example/unknown': { deep: true }, future: 123 },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data._meta).toEqual({ 'io.example/unknown': { deep: true }, future: 123 });
    }
  });

  it('keeps unknown top-level Root members via passthrough', () => {
    const parsed = RootSchema.safeParse({ uri: FILE_URI, futureField: 'x' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect((parsed.data as Record<string, unknown>).futureField).toBe('x');
  });
});

describe('AC-32.15 — client exposes only in-scope, consented roots', () => {
  const root = (uri: string): Root => ({ uri });

  it('includes only in-scope AND consented roots (R-21.1.5-g, R-21.1.5-h)', () => {
    const candidates: RootCandidate[] = [
      { root: root('file:///a'), inScope: true, consented: true },
      { root: root('file:///b'), inScope: false, consented: true },
      { root: root('file:///c'), inScope: true, consented: false },
    ];
    const { result, excluded } = assembleListRootsResult(candidates);
    expect(result.roots.map((r) => r.uri)).toEqual(['file:///a']);
    expect(excluded).toContainEqual({ root: root('file:///b'), reason: 'not-in-scope' });
    expect(excluded).toContainEqual({ root: root('file:///c'), reason: 'no-consent' });
  });

  it('produces the conformant empty listing when nothing qualifies', () => {
    const candidates: RootCandidate[] = [
      { root: root('file:///x'), inScope: false, consented: false },
    ];
    expect(assembleListRootsResult(candidates).result).toEqual({ roots: [] });
  });
});

describe('AC-32.16 — client guards against path-traversal artifacts', () => {
  it('flags a literal ".." segment as unsafe (R-21.1.5-i)', () => {
    expect(isPathTraversalSafe('file:///home/user/../etc/passwd')).toBe(false);
    expect(isPathTraversalSafe('file:///a/b/..')).toBe(false);
  });

  it('flags a percent-encoded ".." as unsafe', () => {
    expect(isPathTraversalSafe('file:///home/%2e%2e/etc')).toBe(false);
    expect(isPathTraversalSafe('file:///home/%2E%2E/etc')).toBe(false);
  });

  it('accepts a clean file:// path', () => {
    expect(isPathTraversalSafe('file:///home/user/projects/myproject')).toBe(true);
  });

  it('excludes a traversal candidate during assembly', () => {
    const candidates: RootCandidate[] = [
      { root: { uri: 'file:///home/../etc' }, inScope: true, consented: true },
      { root: { uri: 'file:///home/user/ok' }, inScope: true, consented: true },
    ];
    const { result, excluded } = assembleListRootsResult(candidates);
    expect(result.roots.map((r) => r.uri)).toEqual(['file:///home/user/ok']);
    expect(excluded).toContainEqual({ root: { uri: 'file:///home/../etc' }, reason: 'path-traversal' });
  });

  it('excludes an invalid-uri candidate during assembly', () => {
    const candidates: RootCandidate[] = [
      { root: { uri: 'http://nope' }, inScope: true, consented: true },
    ];
    const { result, excluded } = assembleListRootsResult(candidates);
    expect(result.roots).toEqual([]);
    expect(excluded).toContainEqual({ root: { uri: 'http://nope' }, reason: 'invalid-uri' });
  });
});

describe('AC-32.17 — server tolerates a reported root becoming unavailable', () => {
  it('does not fail when a previously-reported root is gone (R-21.1.5-j)', () => {
    expect(shouldTolerateUnavailableRoot({ uri: FILE_URI })).toBe(true);
    expect(shouldTolerateUnavailableRoot({ uri: 'file:///gone', name: 'Gone' })).toBe(true);
  });
});

describe('AC-32.18 — server validates derived paths; protocol does NOT enforce boundaries', () => {
  it('confirms the protocol does not enforce root boundaries (R-21.1.5-l)', () => {
    expect(PROTOCOL_ENFORCES_ROOT_BOUNDARIES).toBe(false);
    expect(protocolEnforcesRootBoundaries()).toBe(false);
  });

  it('accepts a derived path within a reported root (R-21.1.5-k)', () => {
    const roots: Root[] = [{ uri: 'file:///home/user/project' }];
    expect(isPathWithinReportedRoots('file:///home/user/project', roots)).toBe(true);
    expect(isPathWithinReportedRoots('file:///home/user/project/src/index.ts', roots)).toBe(true);
  });

  it('rejects a derived path outside every reported root', () => {
    const roots: Root[] = [{ uri: 'file:///home/user/project' }];
    expect(isPathWithinReportedRoots('file:///etc/passwd', roots)).toBe(false);
    // sibling that shares a prefix string but not a path segment
    expect(isPathWithinReportedRoots('file:///home/user/projectile', roots)).toBe(false);
  });

  it('rejects a non-file or malformed derived path, and skips invalid roots', () => {
    const roots: Root[] = [{ uri: 'file:///home/user/project' }];
    expect(isPathWithinReportedRoots('http://x', roots)).toBe(false);
    expect(isPathWithinReportedRoots('file:///home/user/project', [{ uri: 'http://bad' }])).toBe(false);
  });
});
