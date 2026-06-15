/**
 * Tests for S26 — Resources I: capability, listing, templates & types (§17.1–§17.4).
 *
 * AC coverage:
 *  AC-26.1  (R-17.1-a, R-17.1-b)                         — `resources` key is an object; omitted when no resources
 *  AC-26.2  (R-17.1-b, R-17.1-c, R-17.1-e, R-17.1-f, R-17.1-g) — sub-flags boolean/optional; `{}` valid; any combo
 *  AC-26.3  (R-17.1-d, R-17.1-e)                         — listChanged ⇒ MAY emit list_changed; subscribe ⇒ updated
 *  AC-26.4  (R-17.1-h, R-17.1-j)                         — resources undeclared ⇒ requests not accepted / not issued
 *  AC-26.5  (R-17.1-i, R-17.1-k, R-17.1-l)               — notification emission gating by capability/sub-flag
 *  AC-26.6  (R-17.1-m, R-17.1-n)                         — list returns current set; MAY be empty / change
 *  AC-26.7  (R-17.1-o, R-17.1-p)                         — set independent of connection; MAY vary by authorization
 *  AC-26.8  (R-17.2-a, R-17.2-i)                         — params MAY carry cursor / _meta, both optional
 *  AC-26.9  (R-17.2-b, R-17.2-f, R-17.2-g, R-17.2-h)     — resources array; resultType=complete; ttlMs≥0; cacheScope enum
 *  AC-26.10 (R-17.2-c, R-17.2-d, R-17.2-e)               — nextCursor optional/opaque; absent ⇒ complete
 *  AC-26.11 (R-17.2-j)                                   — result valid regardless of pages previously fetched
 *  AC-26.12 (R-17.3-a, R-17.3-b, R-17.3-c)               — templates/list: cursor; resourceTemplates; caching fields
 *  AC-26.13 (R-17.4-a–e, g, j, k, l)                     — Resource: uri/name required; optionals; title precedence
 *  AC-26.14 (R-17.4-h, R-17.4-i)                         — size is raw byte count, optional
 *  AC-26.15 (R-17.4-m, R-17.4-n)                         — uriTemplate RFC6570; expands to a uri; variables
 *  AC-26.16 (R-17.4-o–u)                                 — template name required; optionals; no `size` field
 */

import { describe, it, expect } from 'vitest';
import {
  RESOURCES_LIST_METHOD,
  RESOURCES_TEMPLATES_LIST_METHOD,
  RESOURCES_LIST_CHANGED_METHOD,
  RESOURCES_UPDATED_METHOD,
  ResourcesServerCapabilitySchema,
  RESOURCE_GATED_METHODS,
  serverDeclaresResources,
  mayAcceptResourceRequest,
  clientMayIssueResourceRequest,
  mayEmitResourcesListChanged,
  mayEmitResourceUpdated,
  isResourceUri,
  ResourceUriSchema,
  isUriTemplate,
  uriTemplateVariables,
  UriTemplateSchema,
  ResourceSchema,
  resourceDisplayName,
  ResourceTemplateSchema,
  resourceTemplateHasNoSize,
  resourceTemplateDisplayName,
  ListResourcesRequestParamsSchema,
  ListResourcesRequestSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesRequestSchema,
  ListResourceTemplatesResultSchema,
  buildListResourcesResult,
  buildListResourceTemplatesResult,
  buildResourcesCapability,
  getResourcesCapability,
  type Resource,
  type ResourceTemplate,
} from '../../protocol/resources.js';
import { ServerCapabilitiesSchema } from '../../protocol/capability-negotiation.js';

// A minimal valid Resource used across tests.
const SAMPLE_RESOURCE: Resource = {
  uri: 'file:///project/README.md',
  name: 'readme',
  title: 'Project README',
  description: 'Top-level project documentation.',
  mimeType: 'text/markdown',
  size: 4096,
};

// ─── Method-name constants ─────────────────────────────────────────────────────

describe('method-name constants', () => {
  it('exposes the two paginated discovery method names', () => {
    expect(RESOURCES_LIST_METHOD).toBe('resources/list');
    expect(RESOURCES_TEMPLATES_LIST_METHOD).toBe('resources/templates/list');
  });

  it('reuses the S16 notification-name constants (do not redefine)', () => {
    expect(RESOURCES_LIST_CHANGED_METHOD).toBe('notifications/resources/list_changed');
    expect(RESOURCES_UPDATED_METHOD).toBe('notifications/resources/updated');
  });
});

// ─── AC-26.1 — `resources` key is an object; omitted when no resources ──────────

describe('resources capability declaration (AC-26.1 · R-17.1-a, R-17.1-b)', () => {
  it('accepts a `resources` value that is an object', () => {
    expect(ResourcesServerCapabilitySchema.safeParse({}).success).toBe(true);
    expect(ResourcesServerCapabilitySchema.safeParse({ listChanged: true }).success).toBe(true);
  });

  it('a server exposing no resources omits the key (ServerCapabilities {} is valid)', () => {
    const caps = ServerCapabilitiesSchema.parse({});
    expect(getResourcesCapability(caps)).toBeUndefined();
    expect(serverDeclaresResources(caps)).toBe(false);
  });

  it('a server exposing resources declares the key', () => {
    const caps = ServerCapabilitiesSchema.parse({ resources: {} });
    expect(getResourcesCapability(caps)).toEqual({});
    expect(serverDeclaresResources(caps)).toBe(true);
  });
});

// ─── AC-26.2 — sub-flags boolean/optional; `{}` valid; any combination ──────────

describe('resources sub-flags (AC-26.2 · R-17.1-b/c/e/f/g)', () => {
  it('listChanged and subscribe are each optional booleans', () => {
    expect(ResourcesServerCapabilitySchema.safeParse({ listChanged: 'yes' }).success).toBe(false);
    expect(ResourcesServerCapabilitySchema.safeParse({ subscribe: 1 }).success).toBe(false);
    expect(ResourcesServerCapabilitySchema.safeParse({ listChanged: true, subscribe: false }).success).toBe(true);
  });

  it('a server MAY declare either alone, both, or neither', () => {
    expect(buildResourcesCapability({})).toEqual({});
    expect(buildResourcesCapability({ listChanged: true })).toEqual({ listChanged: true });
    expect(buildResourcesCapability({ subscribe: true })).toEqual({ subscribe: true });
    expect(buildResourcesCapability({ listChanged: true, subscribe: true })).toEqual({
      listChanged: true,
      subscribe: true,
    });
  });

  it('buildResourcesCapability omits false/absent sub-flags (empty-object form)', () => {
    expect(buildResourcesCapability({ listChanged: false, subscribe: false })).toEqual({});
  });

  it('the empty object `{}` is a valid declaration', () => {
    expect(ResourcesServerCapabilitySchema.parse({})).toEqual({});
  });
});

// ─── AC-26.3 — listChanged ⇒ MAY emit list_changed; subscribe ⇒ updated ─────────

describe('sub-flag → notification (AC-26.3 · R-17.1-d, R-17.1-e)', () => {
  it('listChanged:true permits emitting notifications/resources/list_changed', () => {
    const caps = { resources: { listChanged: true } };
    expect(mayEmitResourcesListChanged(caps)).toBe(true);
  });

  it('subscribe:true permits per-resource notifications/resources/updated', () => {
    const caps = { resources: { subscribe: true } };
    expect(mayEmitResourceUpdated(caps)).toBe(true);
  });

  it('both sub-flags permit both notifications', () => {
    const caps = { resources: { listChanged: true, subscribe: true } };
    expect(mayEmitResourcesListChanged(caps)).toBe(true);
    expect(mayEmitResourceUpdated(caps)).toBe(true);
  });
});

// ─── AC-26.4 — resources undeclared ⇒ requests not accepted / not issued ────────

describe('gating: resources undeclared (AC-26.4 · R-17.1-h, R-17.1-j)', () => {
  const noCaps = {};

  it('the three gated methods are list, templates/list, read', () => {
    expect([...RESOURCE_GATED_METHODS]).toEqual([
      'resources/list',
      'resources/templates/list',
      'resources/read',
    ]);
  });

  it('a server does NOT accept the gated requests when resources is undeclared', () => {
    for (const m of RESOURCE_GATED_METHODS) {
      expect(mayAcceptResourceRequest(m, noCaps)).toBe(false);
    }
  });

  it('a conformant client does NOT issue them when resources is undeclared', () => {
    for (const m of RESOURCE_GATED_METHODS) {
      expect(clientMayIssueResourceRequest(m, noCaps)).toBe(false);
    }
  });

  it('once resources is declared, the gated requests become legal', () => {
    const caps = { resources: {} };
    for (const m of RESOURCE_GATED_METHODS) {
      expect(mayAcceptResourceRequest(m, caps)).toBe(true);
      expect(clientMayIssueResourceRequest(m, caps)).toBe(true);
    }
  });

  it('a non-resource method is never accepted by the resource gate', () => {
    expect(mayAcceptResourceRequest('tools/list', { resources: {} })).toBe(false);
  });
});

// ─── AC-26.5 — notification emission gating by capability/sub-flag ──────────────

describe('notification emission gating (AC-26.5 · R-17.1-i/k/l)', () => {
  it('no list_changed or updated unless resources is declared', () => {
    expect(mayEmitResourcesListChanged({})).toBe(false);
    expect(mayEmitResourceUpdated({})).toBe(false);
  });

  it('no list_changed unless listChanged is declared', () => {
    expect(mayEmitResourcesListChanged({ resources: {} })).toBe(false);
    expect(mayEmitResourcesListChanged({ resources: { subscribe: true } })).toBe(false);
    expect(mayEmitResourcesListChanged({ resources: { listChanged: true } })).toBe(true);
  });

  it('no updated unless subscribe is declared', () => {
    expect(mayEmitResourceUpdated({ resources: {} })).toBe(false);
    expect(mayEmitResourceUpdated({ resources: { listChanged: true } })).toBe(false);
    expect(mayEmitResourceUpdated({ resources: { subscribe: true } })).toBe(true);
  });

  it('declaring listChanged does not by itself permit updated, and vice versa', () => {
    expect(mayEmitResourceUpdated({ resources: { listChanged: true } })).toBe(false);
    expect(mayEmitResourcesListChanged({ resources: { subscribe: true } })).toBe(false);
  });
});

// ─── AC-26.6 — list returns current set; MAY be empty / change ─────────────────

describe('available-resource set (AC-26.6 · R-17.1-m, R-17.1-n)', () => {
  it('a result MAY carry an empty resources array', () => {
    const result = buildListResourcesResult([], { ttlMs: 0, cacheScope: 'public' });
    expect(result.resources).toEqual([]);
    expect(ListResourcesResultSchema.safeParse(result).success).toBe(true);
  });

  it('a result carries the currently available set', () => {
    const result = buildListResourcesResult([SAMPLE_RESOURCE], { ttlMs: 60000, cacheScope: 'private' });
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]!.uri).toBe('file:///project/README.md');
  });
});

// ─── AC-26.7 — set independent of connection; MAY vary by authorization ────────

describe('set stability vs authorization (AC-26.7 · R-17.1-o, R-17.1-p)', () => {
  // The builder is a pure function of its inputs — it has no connection/request
  // side state, so two calls with the same resources produce identical sets,
  // modeling the "MUST NOT vary per-connection" rule.
  it('the same inputs always yield the same set (no per-connection variance)', () => {
    const a = buildListResourcesResult([SAMPLE_RESOURCE], { ttlMs: 0, cacheScope: 'public' });
    const b = buildListResourcesResult([SAMPLE_RESOURCE], { ttlMs: 0, cacheScope: 'public' });
    expect(a.resources).toEqual(b.resources);
  });

  it('the set MAY differ by authorization (different scoped inputs ⇒ different sets)', () => {
    const scopedDocs: Resource = { uri: 'doc:///secret', name: 'secret' };
    const adminView = buildListResourcesResult([SAMPLE_RESOURCE, scopedDocs], { ttlMs: 0, cacheScope: 'private' });
    const userView = buildListResourcesResult([SAMPLE_RESOURCE], { ttlMs: 0, cacheScope: 'private' });
    expect(adminView.resources).toHaveLength(2);
    expect(userView.resources).toHaveLength(1);
  });
});

// ─── AC-26.8 — params MAY carry cursor / _meta, both optional ──────────────────

describe('resources/list request params (AC-26.8 · R-17.2-a, R-17.2-i)', () => {
  it('params may be entirely absent', () => {
    expect(ListResourcesRequestSchema.safeParse({ method: 'resources/list' }).success).toBe(true);
  });

  it('params MAY carry a cursor', () => {
    expect(
      ListResourcesRequestParamsSchema.safeParse({ cursor: 'eyJwYWdlIjoyfQ==' }).success,
    ).toBe(true);
  });

  it('params MAY carry _meta', () => {
    expect(
      ListResourcesRequestParamsSchema.safeParse({
        _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
      }).success,
    ).toBe(true);
  });

  it('an empty params object is valid (both fields optional)', () => {
    expect(ListResourcesRequestParamsSchema.safeParse({}).success).toBe(true);
  });
});

// ─── AC-26.9 — resources; resultType=complete; ttlMs≥0; cacheScope enum ────────

describe('ListResourcesResult required fields (AC-26.9 · R-17.2-b/f/g/h)', () => {
  it('a well-formed result parses', () => {
    const result = {
      resources: [SAMPLE_RESOURCE],
      resultType: 'complete',
      ttlMs: 60000,
      cacheScope: 'private',
    };
    expect(ListResourcesResultSchema.safeParse(result).success).toBe(true);
  });

  it('buildListResourcesResult sets resultType to "complete"', () => {
    const result = buildListResourcesResult([SAMPLE_RESOURCE], { ttlMs: 60000, cacheScope: 'private' });
    expect(result.resultType).toBe('complete');
  });

  it('rejects a missing resources array', () => {
    expect(
      ListResourcesResultSchema.safeParse({ resultType: 'complete', ttlMs: 0, cacheScope: 'public' }).success,
    ).toBe(false);
  });

  it('rejects a negative ttlMs', () => {
    expect(
      ListResourcesResultSchema.safeParse({
        resources: [],
        resultType: 'complete',
        ttlMs: -1,
        cacheScope: 'public',
      }).success,
    ).toBe(false);
  });

  it('rejects a non-integer ttlMs', () => {
    expect(
      ListResourcesResultSchema.safeParse({
        resources: [],
        resultType: 'complete',
        ttlMs: 1.5,
        cacheScope: 'public',
      }).success,
    ).toBe(false);
  });

  it('rejects a cacheScope outside the public/private enum', () => {
    expect(
      ListResourcesResultSchema.safeParse({
        resources: [],
        resultType: 'complete',
        ttlMs: 0,
        cacheScope: 'shared',
      }).success,
    ).toBe(false);
  });

  it('the builder throws on a negative ttlMs', () => {
    expect(() => buildListResourcesResult([], { ttlMs: -5, cacheScope: 'public' })).toThrow(RangeError);
  });

  it('accepts both public and private cacheScope', () => {
    for (const cacheScope of ['public', 'private'] as const) {
      const result = buildListResourcesResult([], { ttlMs: 0, cacheScope });
      expect(result.cacheScope).toBe(cacheScope);
    }
  });
});

// ─── AC-26.10 — nextCursor optional/opaque; absent ⇒ complete ──────────────────

describe('nextCursor handling (AC-26.10 · R-17.2-c/d/e)', () => {
  it('nextCursor is optional; absent means the listing is complete', () => {
    const result = buildListResourcesResult([SAMPLE_RESOURCE], { ttlMs: 0, cacheScope: 'public' });
    expect('nextCursor' in result).toBe(false);
    expect(ListResourcesResultSchema.safeParse(result).success).toBe(true);
  });

  it('a present nextCursor is carried verbatim and round-trips opaquely', () => {
    const cursor = 'eyJwYWdlIjoyfQ==';
    const result = buildListResourcesResult([SAMPLE_RESOURCE], { ttlMs: 0, cacheScope: 'public' }, { nextCursor: cursor });
    expect(result.nextCursor).toBe(cursor);
    // The client passes it back verbatim as the next request's cursor (no parsing).
    const nextReq = ListResourcesRequestParamsSchema.parse({ cursor: result.nextCursor });
    expect(nextReq.cursor).toBe(cursor);
  });

  it('the empty string "" is a present (not absent) nextCursor', () => {
    const result = buildListResourcesResult([], { ttlMs: 0, cacheScope: 'public' }, { nextCursor: '' });
    expect(result.nextCursor).toBe('');
    expect('nextCursor' in result).toBe(true);
  });
});

// ─── AC-26.11 — result valid regardless of pages previously fetched ────────────

describe('page independence (AC-26.11 · R-17.2-j)', () => {
  it('a first-page and a later-page result are both independently valid', () => {
    const firstPage = buildListResourcesResult([SAMPLE_RESOURCE], { ttlMs: 0, cacheScope: 'public' }, { nextCursor: '10' });
    const laterPage = buildListResourcesResult([{ uri: 'file:///b', name: 'b' }], { ttlMs: 0, cacheScope: 'public' });
    expect(ListResourcesResultSchema.safeParse(firstPage).success).toBe(true);
    expect(ListResourcesResultSchema.safeParse(laterPage).success).toBe(true);
  });

  it('a later page request carrying only a cursor is valid (no prior-page assumption)', () => {
    expect(ListResourcesRequestSchema.safeParse({ method: 'resources/list', params: { cursor: '20' } }).success).toBe(true);
  });
});

// ─── AC-26.12 — templates/list: cursor; resourceTemplates; caching fields ──────

const SAMPLE_TEMPLATE: ResourceTemplate = {
  uriTemplate: 'db://{table}/{id}',
  name: 'db-row',
  title: 'Database Row',
  description: 'A single row addressed by table and primary key.',
  mimeType: 'application/json',
};

describe('resources/templates/list (AC-26.12 · R-17.3-a/b/c)', () => {
  it('the request MAY carry a cursor', () => {
    expect(
      ListResourceTemplatesRequestSchema.safeParse({
        method: 'resources/templates/list',
        params: { cursor: 'eyJwYWdlIjoyfQ==' },
      }).success,
    ).toBe(true);
  });

  it('a result requires a resourceTemplates array (possibly empty)', () => {
    expect(
      ListResourceTemplatesResultSchema.safeParse({
        resourceTemplates: [],
        resultType: 'complete',
        ttlMs: 0,
        cacheScope: 'public',
      }).success,
    ).toBe(true);
    expect(
      ListResourceTemplatesResultSchema.safeParse({ resultType: 'complete', ttlMs: 0, cacheScope: 'public' }).success,
    ).toBe(false);
  });

  it('resultType, ttlMs, cacheScope behave exactly as in resources/list', () => {
    const result = buildListResourceTemplatesResult([SAMPLE_TEMPLATE], { ttlMs: 0, cacheScope: 'public' });
    expect(result.resultType).toBe('complete');
    expect(result.ttlMs).toBe(0);
    expect(result.cacheScope).toBe('public');
    expect(ListResourceTemplatesResultSchema.safeParse(result).success).toBe(true);
  });

  it('the templates builder throws on a negative ttlMs and supports nextCursor', () => {
    expect(() => buildListResourceTemplatesResult([], { ttlMs: -1, cacheScope: 'public' })).toThrow(RangeError);
    const result = buildListResourceTemplatesResult([SAMPLE_TEMPLATE], { ttlMs: 0, cacheScope: 'public' }, { nextCursor: 'c2' });
    expect(result.nextCursor).toBe('c2');
  });
});

// ─── AC-26.13 — Resource fields & title precedence ─────────────────────────────

describe('Resource type (AC-26.13 · R-17.4-a–e, g, j, k, l)', () => {
  it('uri and name are required; the rest are optional', () => {
    expect(ResourceSchema.safeParse({ uri: 'file:///x', name: 'x' }).success).toBe(true);
    expect(ResourceSchema.safeParse({ name: 'x' }).success).toBe(false); // missing uri
    expect(ResourceSchema.safeParse({ uri: 'file:///x' }).success).toBe(false); // missing name
  });

  it('uri may use any scheme (RFC3986)', () => {
    for (const uri of ['file:///a', 'https://h/p', 'db://users/42', 'urn:isbn:0451450523', 'custom-scheme:thing']) {
      expect(isResourceUri(uri)).toBe(true);
      expect(ResourceSchema.safeParse({ uri, name: 'n' }).success).toBe(true);
    }
  });

  it('rejects a uri without a scheme (relative reference)', () => {
    expect(isResourceUri('/project/README.md')).toBe(false);
    expect(isResourceUri('README.md')).toBe(false);
    expect(isResourceUri('')).toBe(false);
    expect(ResourceUriSchema.safeParse('not a uri').success).toBe(false);
  });

  it('carries the optional descriptor fields', () => {
    const full: Resource = {
      uri: 'file:///x',
      name: 'x',
      title: 'X',
      description: 'desc',
      mimeType: 'text/plain',
      size: 10,
      annotations: { audience: ['user'], priority: 0.5, lastModified: '2025-01-12T15:00:58Z' },
      icons: [{ src: 'https://example.com/icon.png' }],
      _meta: { foo: 'bar' },
    };
    expect(ResourceSchema.safeParse(full).success).toBe(true);
  });

  it('a client prefers title and falls back to name (R-17.4-e)', () => {
    expect(resourceDisplayName({ name: 'readme', title: 'Project README' })).toBe('Project README');
    expect(resourceDisplayName({ name: 'readme' })).toBe('readme');
    expect(resourceDisplayName({ name: 'readme', title: '' })).toBe('readme');
  });
});

// ─── AC-26.14 — size is raw byte count, optional ───────────────────────────────

describe('Resource.size (AC-26.14 · R-17.4-h, R-17.4-i)', () => {
  it('size is optional and is a number of bytes', () => {
    expect(ResourceSchema.safeParse({ uri: 'file:///x', name: 'x' }).success).toBe(true); // absent ok
    const parsed = ResourceSchema.parse({ uri: 'file:///x', name: 'x', size: 4096 });
    expect(parsed.size).toBe(4096);
  });

  it('rejects a non-numeric size', () => {
    expect(ResourceSchema.safeParse({ uri: 'file:///x', name: 'x', size: '4096' }).success).toBe(false);
  });
});

// ─── AC-26.15 — uriTemplate RFC6570; expands to a uri; variables ───────────────

describe('ResourceTemplate.uriTemplate (AC-26.15 · R-17.4-m, R-17.4-n)', () => {
  it('accepts well-formed RFC6570 templates', () => {
    for (const t of ['file:///{path}', 'db://{table}/{id}', 'https://api/{+base}/items{?q,page}', 'x://{var:3}', 'y://{list*}']) {
      expect(isUriTemplate(t)).toBe(true);
      expect(UriTemplateSchema.safeParse(t).success).toBe(true);
    }
  });

  it('accepts a literal-only template with no expressions', () => {
    expect(isUriTemplate('file:///fixed/path')).toBe(true);
  });

  it('rejects malformed templates (unbalanced/empty/illegal braces)', () => {
    for (const t of ['db://{table', 'db://table}', 'db://{}/x', 'db://{ }', 'db://{a{b}}', '']) {
      expect(isUriTemplate(t)).toBe(false);
    }
  });

  it('reports the variable names referenced by the template (for completion §19)', () => {
    expect(uriTemplateVariables('db://{table}/{id}')).toEqual(['table', 'id']);
    expect(uriTemplateVariables('https://api/{+base}/items{?q,page}')).toEqual(['base', 'q', 'page']);
    expect(uriTemplateVariables('x://{var:3}/{list*}')).toEqual(['var', 'list']);
    expect(uriTemplateVariables('file:///fixed')).toEqual([]);
  });

  it('expanding a template with concrete values yields a usable concrete uri', () => {
    // A client substitutes variables (here, manually) to form a resources/read uri.
    const expanded = 'db://{table}/{id}'.replace('{table}', 'users').replace('{id}', '42');
    expect(expanded).toBe('db://users/42');
    expect(isResourceUri(expanded)).toBe(true);
  });
});

// ─── AC-26.16 — template name required; optionals; no `size` field ─────────────

describe('ResourceTemplate type (AC-26.16 · R-17.4-o–u)', () => {
  it('uriTemplate and name are required; the rest optional', () => {
    expect(ResourceTemplateSchema.safeParse({ uriTemplate: 'x://{a}', name: 't' }).success).toBe(true);
    expect(ResourceTemplateSchema.safeParse({ uriTemplate: 'x://{a}' }).success).toBe(false); // missing name
    expect(ResourceTemplateSchema.safeParse({ name: 't' }).success).toBe(false); // missing uriTemplate
  });

  it('carries the optional descriptor fields', () => {
    const full: ResourceTemplate = {
      uriTemplate: 'db://{table}/{id}',
      name: 'db-row',
      title: 'Database Row',
      description: 'A single row.',
      mimeType: 'application/json',
      annotations: { priority: 1 },
      icons: [{ src: 'https://example.com/i.png' }],
      _meta: { k: 'v' },
    };
    expect(ResourceTemplateSchema.safeParse(full).success).toBe(true);
  });

  it('a template prefers title then falls back to name', () => {
    expect(resourceTemplateDisplayName({ name: 'db-row', title: 'Database Row' })).toBe('Database Row');
    expect(resourceTemplateDisplayName({ name: 'db-row' })).toBe('db-row');
  });

  it('a template has no `size` field (R-17.4-u)', () => {
    expect(resourceTemplateHasNoSize({ uriTemplate: 'x://{a}', name: 't' })).toBe(true);
    expect(resourceTemplateHasNoSize({ uriTemplate: 'x://{a}', name: 't', size: 1 })).toBe(false);
    // The schema does not declare a `size` field; Resource does.
    expect('size' in ResourceTemplateSchema.parse({ uriTemplate: 'x://{a}', name: 't' })).toBe(false);
  });
});

// ─── End-to-end discovery shapes ───────────────────────────────────────────────

describe('end-to-end wire examples', () => {
  it('matches the story §9.3 resources/list result example', () => {
    const result = buildListResourcesResult(
      [SAMPLE_RESOURCE],
      { ttlMs: 60000, cacheScope: 'private' },
      { nextCursor: 'eyJwYWdlIjoyfQ==' },
    );
    expect(ListResourcesResultSchema.safeParse(result).success).toBe(true);
    expect(result.nextCursor).toBe('eyJwYWdlIjoyfQ==');
  });

  it('matches the story §9.4 resources/templates/list result example', () => {
    const result = buildListResourceTemplatesResult([SAMPLE_TEMPLATE], { ttlMs: 0, cacheScope: 'public' });
    expect(ListResourceTemplatesResultSchema.safeParse(result).success).toBe(true);
  });
});
