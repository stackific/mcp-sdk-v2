/**
 * Tests for S30 — Elicitation I: Capability, Delivery & Modes (§20.1–§20.3).
 *
 * AC coverage:
 *  AC-30.1  (R-20.1-a)            — supports elicitation ⇒ declares `elicitation`; undeclared ⇒ unsupported
 *  AC-30.2  (R-20.1-f)            — capability value: optional `form`/`url` sub-flags, each an object
 *  AC-30.3  (R-20.1-b)            — declaring `elicitation` ⇒ at least one mode supported
 *  AC-30.4  (R-20.1-c)            — `"elicitation": {}` ≡ `{ form: {} }` (form only, no url)
 *  AC-30.5  (R-20.1-d)            — server does not send a mode the client does not support
 *  AC-30.6  (R-20.1-e)            — undeclared client ⇒ no `elicitation/create` input-required result
 *  AC-30.7  (R-20.2-a)            — delivered as `elicitation/create` inside an input_required result
 *  AC-30.8  (R-20.2-b)            — method present, exact case-sensitive `"elicitation/create"`
 *  AC-30.9  (R-20.2-c)            — params present (an ElicitRequestParams)
 *  AC-30.10 (R-20.3-a,b,c)        — form mode: optional `mode`; absent ⇒ form; present ⇒ `"form"`
 *  AC-30.11 (R-20.3-d)            — form mode: `message` present string
 *  AC-30.12 (R-20.3-e)            — form mode: `requestedSchema` present, `type` literal `"object"`
 *  AC-30.13 (R-20.3-f)            — `requestedSchema.properties` present, flat (non-nested) map
 *  AC-30.14 (R-20.3-g,h)          — `required` / `$schema` optional; well-typed when present
 *  AC-30.15 (R-20.3-i,j)          — url mode: `mode` literal `"url"`; `message` present string
 *  AC-30.16 (R-20.3-k,l)          — url mode: `elicitationId` present string, treated opaque
 *  AC-30.17 (R-20.3-m,n)          — url mode: `url` present, valid URI/URL
 */

import { describe, it, expect } from 'vitest';
import {
  ELICITATION_CREATE_METHOD,
  ELICITATION_MODE,
  type ElicitationMode,
  isElicitationMode,
  ElicitationCapabilityValueSchema,
  RequestedSchemaSchema,
  ElicitRequestFormParamsSchema,
  ElicitRequestURLParamsSchema,
  ElicitRequestParamsSchema,
  ElicitRequestSchema,
  isElicitRequest,
  isElicitationCreateRequest,
  resolveElicitationMode,
  validateRequestedSchema,
  isValidElicitationUrl,
  clientSupportsElicitation,
  supportedElicitationModes,
  clientSupportsElicitationMode,
  gateElicitationRequest,
  mayServerSendElicitation,
  buildFormElicitRequest,
  buildUrlElicitRequest,
} from '../../protocol/elicitation.js';
import {
  ElicitationInputRequestSchema,
  InputRequiredResultSchema,
  RESULT_TYPE,
} from '../../protocol/multi-round-trip.js';

// A reusable, well-formed flat form schema.
const flatSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'integer' },
  },
  required: ['name'],
};

describe('S30 — method discriminator & modes', () => {
  it('exposes the exact case-sensitive elicitation/create literal', () => {
    expect(ELICITATION_CREATE_METHOD).toBe('elicitation/create');
  });

  it('defines exactly the two modes form and url', () => {
    expect(ELICITATION_MODE.FORM).toBe('form');
    expect(ELICITATION_MODE.URL).toBe('url');
    expect(isElicitationMode('form')).toBe(true);
    expect(isElicitationMode('url')).toBe(true);
    expect(isElicitationMode('other')).toBe(false);
    expect(isElicitationMode(undefined)).toBe(false);
  });
});

// ── AC-30.1 (R-20.1-a) ───────────────────────────────────────────────────────
describe('AC-30.1 — declaration is required to support elicitation', () => {
  it('a client that declares elicitation supports it', () => {
    expect(clientSupportsElicitation({ elicitation: {} })).toBe(true);
    expect(clientSupportsElicitation({ elicitation: { form: {} } })).toBe(true);
  });

  it('a client that does not declare it is treated as not supporting it', () => {
    expect(clientSupportsElicitation({})).toBe(false);
    expect(clientSupportsElicitation({ sampling: {} })).toBe(false);
    // A non-object value is not a declaration.
    expect(clientSupportsElicitation({ elicitation: true as unknown as object })).toBe(false);
  });
});

// ── AC-30.2 (R-20.1-f) ───────────────────────────────────────────────────────
describe('AC-30.2 — capability value: optional form/url sub-flags, each an object', () => {
  it('accepts both sub-flags as empty objects', () => {
    expect(ElicitationCapabilityValueSchema.safeParse({ form: {}, url: {} }).success).toBe(true);
  });

  it('accepts an entirely empty capability value (both sub-flags absent)', () => {
    expect(ElicitationCapabilityValueSchema.safeParse({}).success).toBe(true);
  });

  it('accepts sub-flags carrying additional settings', () => {
    expect(
      ElicitationCapabilityValueSchema.safeParse({ form: { maxFields: 10 } }).success,
    ).toBe(true);
  });

  it('rejects a non-object sub-flag', () => {
    expect(ElicitationCapabilityValueSchema.safeParse({ form: true }).success).toBe(false);
    expect(ElicitationCapabilityValueSchema.safeParse({ url: 'x' }).success).toBe(false);
  });
});

// ── AC-30.3 (R-20.1-b) ───────────────────────────────────────────────────────
describe('AC-30.3 — declaring elicitation implies at least one supported mode', () => {
  it('empty declaration still yields form mode', () => {
    expect(supportedElicitationModes({ elicitation: {} })).toEqual(['form']);
    expect(supportedElicitationModes({ elicitation: {} }).length).toBeGreaterThanOrEqual(1);
  });

  it('explicit form+url declaration yields both', () => {
    expect(supportedElicitationModes({ elicitation: { form: {}, url: {} } })).toEqual([
      'form',
      'url',
    ]);
  });

  it('a client that does not declare elicitation supports no modes', () => {
    expect(supportedElicitationModes({})).toEqual([]);
  });
});

// ── AC-30.4 (R-20.1-c) ───────────────────────────────────────────────────────
describe('AC-30.4 — `elicitation: {}` is treated identically to `{ form: {} }`', () => {
  it('empty object supports form but not url', () => {
    const empty = { elicitation: {} };
    const explicit = { elicitation: { form: {} } };
    expect(supportedElicitationModes(empty)).toEqual(supportedElicitationModes(explicit));
    expect(clientSupportsElicitationMode(empty, 'form')).toBe(true);
    expect(clientSupportsElicitationMode(empty, 'url')).toBe(false);
    expect(clientSupportsElicitationMode(explicit, 'url')).toBe(false);
  });
});

// ── AC-30.5 (R-20.1-d) ───────────────────────────────────────────────────────
describe('AC-30.5 — server does not send an unsupported mode', () => {
  it('rejects url mode when only form is declared', () => {
    const caps = { elicitation: {} };
    expect(mayServerSendElicitation(caps, 'url')).toBe(false);
    const gate = gateElicitationRequest(caps, 'url');
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.rejection).toEqual({ reason: 'mode-not-supported', mode: 'url' });
  });

  it('permits url mode when elicitation.url is declared', () => {
    const caps = { elicitation: { url: {} } };
    expect(mayServerSendElicitation(caps, 'url')).toBe(true);
    expect(gateElicitationRequest(caps, 'url').ok).toBe(true);
  });

  it('permits form mode whenever elicitation is declared (default mode)', () => {
    expect(mayServerSendElicitation({ elicitation: {} })).toBe(true);
    expect(mayServerSendElicitation({ elicitation: {} }, 'form')).toBe(true);
  });
});

// ── AC-30.6 (R-20.1-e) ───────────────────────────────────────────────────────
describe('AC-30.6 — undeclared client gets no elicitation/create result', () => {
  it('gate rejects with capability-not-declared regardless of mode', () => {
    const caps = {};
    for (const mode of ['form', 'url'] as ElicitationMode[]) {
      const gate = gateElicitationRequest(caps, mode);
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.rejection).toEqual({ reason: 'capability-not-declared' });
    }
    expect(mayServerSendElicitation(caps)).toBe(false);
  });
});

// ── AC-30.7 (R-20.2-a) ───────────────────────────────────────────────────────
describe('AC-30.7 — delivered as an elicitation/create input request inside input_required', () => {
  it('an ElicitRequest is a valid member of an InputRequiredResult', () => {
    const elicit = buildFormElicitRequest({ message: 'Provide details', requestedSchema: flatSchema });
    const result = {
      resultType: RESULT_TYPE.INPUT_REQUIRED,
      inputRequests: { 'user-profile': elicit },
      requestState: 'opaque-token',
    };
    // The S17-owned envelope accepts the embedded elicitation/create request.
    expect(InputRequiredResultSchema.safeParse(result).success).toBe(true);
    // And it is recognized by the S17 elicitation input-request anchor.
    expect(ElicitationInputRequestSchema.safeParse(elicit).success).toBe(true);
  });

  it('our stricter ElicitRequestSchema also validates the embedded request', () => {
    const elicit = buildFormElicitRequest({ message: 'm', requestedSchema: flatSchema });
    expect(isElicitRequest(elicit)).toBe(true);
  });
});

// ── AC-30.8 (R-20.2-b) ───────────────────────────────────────────────────────
describe('AC-30.8 — method is the exact case-sensitive literal', () => {
  it('accepts the exact literal', () => {
    expect(isElicitationCreateRequest({ method: 'elicitation/create', params: {} })).toBe(true);
    const parsed = ElicitRequestSchema.safeParse({
      method: 'elicitation/create',
      params: { message: 'm', requestedSchema: flatSchema },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a differently-cased or wrong method', () => {
    expect(isElicitationCreateRequest({ method: 'Elicitation/Create', params: {} })).toBe(false);
    expect(isElicitationCreateRequest({ method: 'elicitation/Create' })).toBe(false);
    expect(
      ElicitRequestSchema.safeParse({
        method: 'elicitation/createX',
        params: { message: 'm', requestedSchema: flatSchema },
      }).success,
    ).toBe(false);
  });
});

// ── AC-30.9 (R-20.2-c) ───────────────────────────────────────────────────────
describe('AC-30.9 — params is required', () => {
  it('rejects an ElicitRequest with no params', () => {
    expect(ElicitRequestSchema.safeParse({ method: 'elicitation/create' }).success).toBe(false);
  });

  it('accepts an ElicitRequest with valid params', () => {
    expect(
      ElicitRequestSchema.safeParse({
        method: 'elicitation/create',
        params: { mode: 'url', message: 'm', elicitationId: 'id', url: 'https://e.com/a' },
      }).success,
    ).toBe(true);
  });
});

// ── AC-30.10 (R-20.3-a,b,c) ──────────────────────────────────────────────────
describe('AC-30.10 — form mode: optional `mode`; absent treated as form', () => {
  it('accepts explicit mode "form"', () => {
    expect(
      ElicitRequestFormParamsSchema.safeParse({
        mode: 'form',
        message: 'm',
        requestedSchema: flatSchema,
      }).success,
    ).toBe(true);
  });

  it('accepts absent mode and treats it as form', () => {
    const params = { message: 'm', requestedSchema: flatSchema };
    expect(ElicitRequestFormParamsSchema.safeParse(params).success).toBe(true);
    expect(resolveElicitationMode(params)).toBe('form');
  });

  it('a form params with an explicit non-"form" mode literal is not form params', () => {
    expect(
      ElicitRequestFormParamsSchema.safeParse({
        mode: 'url',
        message: 'm',
        requestedSchema: flatSchema,
      }).success,
    ).toBe(false);
  });

  it('resolveElicitationMode: form for absent or "form", url for "url", undefined otherwise', () => {
    expect(resolveElicitationMode({})).toBe('form');
    expect(resolveElicitationMode({ mode: 'form' })).toBe('form');
    expect(resolveElicitationMode({ mode: 'url' })).toBe('url');
    expect(resolveElicitationMode({ mode: 'bogus' })).toBeUndefined();
  });

  it('the union routes an absent-mode params to form', () => {
    const params = { message: 'm', requestedSchema: flatSchema };
    expect(ElicitRequestParamsSchema.safeParse(params).success).toBe(true);
  });
});

// ── AC-30.11 (R-20.3-d) ──────────────────────────────────────────────────────
describe('AC-30.11 — form mode: message is a required string', () => {
  it('rejects missing message', () => {
    expect(ElicitRequestFormParamsSchema.safeParse({ requestedSchema: flatSchema }).success).toBe(
      false,
    );
  });

  it('rejects a non-string message', () => {
    expect(
      ElicitRequestFormParamsSchema.safeParse({ message: 42, requestedSchema: flatSchema }).success,
    ).toBe(false);
  });
});

// ── AC-30.12 (R-20.3-e) ──────────────────────────────────────────────────────
describe('AC-30.12 — form mode: requestedSchema present, type literal "object"', () => {
  it('rejects missing requestedSchema', () => {
    expect(ElicitRequestFormParamsSchema.safeParse({ message: 'm' }).success).toBe(false);
  });

  it('rejects a requestedSchema whose type is not "object"', () => {
    expect(
      RequestedSchemaSchema.safeParse({ type: 'string', properties: {} }).success,
    ).toBe(false);
    const v = validateRequestedSchema({ type: 'array', properties: {} });
    expect(v.valid).toBe(false);
  });

  it('accepts a requestedSchema with type "object"', () => {
    expect(RequestedSchemaSchema.safeParse({ type: 'object', properties: {} }).success).toBe(true);
  });
});

// ── AC-30.13 (R-20.3-f) ──────────────────────────────────────────────────────
describe('AC-30.13 — requestedSchema.properties present and flat (non-nested)', () => {
  it('requires properties', () => {
    expect(RequestedSchemaSchema.safeParse({ type: 'object' }).success).toBe(false);
  });

  it('accepts a flat map of primitive property schemas', () => {
    const v = validateRequestedSchema({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'number' }, c: { type: 'boolean' } },
    });
    expect(v.valid).toBe(true);
  });

  it('rejects a nested object property', () => {
    const v = validateRequestedSchema({
      type: 'object',
      properties: { addr: { type: 'object', properties: { city: { type: 'string' } } } },
    });
    expect(v.valid).toBe(false);
    if (!v.valid) {
      expect(v.errors.some((e) => e.path.startsWith('properties.addr'))).toBe(true);
    }
  });

  it('rejects an array property and a $ref property', () => {
    expect(
      validateRequestedSchema({
        type: 'object',
        properties: { tags: { type: 'array', items: { type: 'string' } } },
      }).valid,
    ).toBe(false);
    expect(
      validateRequestedSchema({
        type: 'object',
        properties: { ref: { $ref: '#/$defs/x' } },
      }).valid,
    ).toBe(false);
  });
});

// ── AC-30.14 (R-20.3-g,h) ────────────────────────────────────────────────────
describe('AC-30.14 — required and $schema are optional, well-typed when present', () => {
  it('accepts a schema with neither required nor $schema', () => {
    expect(
      validateRequestedSchema({ type: 'object', properties: { x: { type: 'string' } } }).valid,
    ).toBe(true);
  });

  it('accepts required as an array of declared property names and $schema as a string', () => {
    const v = validateRequestedSchema(flatSchema);
    expect(v.valid).toBe(true);
  });

  it('rejects required that names an undeclared property', () => {
    const v = validateRequestedSchema({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name', 'ghost'],
    });
    expect(v.valid).toBe(false);
  });

  it('rejects a non-string-array required and a non-string $schema', () => {
    expect(
      RequestedSchemaSchema.safeParse({ type: 'object', properties: {}, required: [1] }).success,
    ).toBe(false);
    expect(
      RequestedSchemaSchema.safeParse({ type: 'object', properties: {}, $schema: 5 }).success,
    ).toBe(false);
  });
});

// ── AC-30.15 (R-20.3-i,j) ────────────────────────────────────────────────────
describe('AC-30.15 — url mode: mode literal "url", message required string', () => {
  it('rejects url params without mode or with a wrong mode', () => {
    expect(
      ElicitRequestURLParamsSchema.safeParse({
        message: 'm',
        elicitationId: 'id',
        url: 'https://e.com/a',
      }).success,
    ).toBe(false);
    expect(
      ElicitRequestURLParamsSchema.safeParse({
        mode: 'form',
        message: 'm',
        elicitationId: 'id',
        url: 'https://e.com/a',
      }).success,
    ).toBe(false);
  });

  it('requires a string message', () => {
    expect(
      ElicitRequestURLParamsSchema.safeParse({
        mode: 'url',
        elicitationId: 'id',
        url: 'https://e.com/a',
      }).success,
    ).toBe(false);
  });

  it('accepts a well-formed url params', () => {
    expect(
      ElicitRequestURLParamsSchema.safeParse({
        mode: 'url',
        message: 'Authorize payment',
        elicitationId: 'elic-1',
        url: 'https://pay.example.com/authorize?s=1',
      }).success,
    ).toBe(true);
  });
});

// ── AC-30.16 (R-20.3-k,l) ────────────────────────────────────────────────────
describe('AC-30.16 — url mode: elicitationId present string, treated opaque', () => {
  it('requires a non-empty elicitationId string', () => {
    expect(
      ElicitRequestURLParamsSchema.safeParse({
        mode: 'url',
        message: 'm',
        url: 'https://e.com/a',
      }).success,
    ).toBe(false);
    expect(
      ElicitRequestURLParamsSchema.safeParse({
        mode: 'url',
        message: 'm',
        elicitationId: '',
        url: 'https://e.com/a',
      }).success,
    ).toBe(false);
  });

  it('preserves the elicitationId verbatim (opaque — never parsed or modified)', () => {
    const id = 'elic-9f3c1a7e/~weird.id';
    const req = buildUrlElicitRequest({ message: 'm', elicitationId: id, url: 'https://e.com/a' });
    expect((req.params as { elicitationId: string }).elicitationId).toBe(id);
    const parsed = ElicitRequestURLParamsSchema.parse({
      mode: 'url',
      message: 'm',
      elicitationId: id,
      url: 'https://e.com/a',
    });
    expect(parsed.elicitationId).toBe(id);
  });
});

// ── AC-30.17 (R-20.3-m,n) ────────────────────────────────────────────────────
describe('AC-30.17 — url mode: url present and a valid URI/URL', () => {
  it('accepts valid absolute URLs', () => {
    expect(isValidElicitationUrl('https://pay.example.com/authorize?session=9f3c1a7e')).toBe(true);
    expect(isValidElicitationUrl('http://e.com')).toBe(true);
    expect(
      ElicitRequestURLParamsSchema.safeParse({
        mode: 'url',
        message: 'm',
        elicitationId: 'id',
        url: 'https://e.com/a',
      }).success,
    ).toBe(true);
  });

  it('rejects missing, empty, relative, or malformed URLs', () => {
    expect(isValidElicitationUrl(undefined)).toBe(false);
    expect(isValidElicitationUrl('')).toBe(false);
    expect(isValidElicitationUrl('/relative/path')).toBe(false);
    expect(isValidElicitationUrl('not a url')).toBe(false);
    expect(
      ElicitRequestURLParamsSchema.safeParse({
        mode: 'url',
        message: 'm',
        elicitationId: 'id',
        url: 'not-a-url',
      }).success,
    ).toBe(false);
  });

  it('builder throws on an invalid url', () => {
    expect(() =>
      buildUrlElicitRequest({ message: 'm', elicitationId: 'id', url: 'nope' }),
    ).toThrow(TypeError);
  });
});

// ── Builders & end-to-end shapes ─────────────────────────────────────────────
describe('S30 — builders produce spec-shaped requests', () => {
  it('buildFormElicitRequest omits mode by default and validates the schema', () => {
    const req = buildFormElicitRequest({ message: 'Provide details', requestedSchema: flatSchema });
    expect(req.method).toBe('elicitation/create');
    expect('mode' in req.params).toBe(false);
    expect(isElicitRequest(req)).toBe(true);
  });

  it('buildFormElicitRequest can include an explicit mode "form"', () => {
    const req = buildFormElicitRequest({
      message: 'm',
      requestedSchema: flatSchema,
      includeMode: true,
    });
    expect((req.params as { mode?: string }).mode).toBe('form');
  });

  it('buildFormElicitRequest throws on a nested schema', () => {
    expect(() =>
      buildFormElicitRequest({
        message: 'm',
        requestedSchema: { type: 'object', properties: { a: { type: 'object' } } },
      }),
    ).toThrow(TypeError);
  });

  it('buildUrlElicitRequest produces a valid url-mode request', () => {
    const req = buildUrlElicitRequest({
      message: 'Please complete payment authorization in your browser',
      elicitationId: 'elic-9f3c1a7e',
      url: 'https://pay.example.com/authorize?session=9f3c1a7e',
    });
    expect(isElicitRequest(req)).toBe(true);
    expect(resolveElicitationMode(req.params)).toBe('url');
  });
});
