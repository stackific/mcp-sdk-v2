/**
 * Tests for S31 — Elicitation II: Restricted Form Schema, Results & Consent
 * (§20.4–§20.8).
 *
 * AC coverage:
 *  AC-31.1  (R-20.4-a)            — flat object of primitive props; nested/array-of-objects rejected
 *  AC-31.2  (R-20.4-b)            — schema usable to build/validate/guide, no protocol error either way
 *  AC-31.3  (R-20.4-c)            — `default` per field; extracted for client pre-population
 *  AC-31.4  (R-20.4-d)            — StringSchema.format restricted to the four literals
 *  AC-31.5  (R-20.4-e)            — NumberSchema.type restricted to number|integer
 *  AC-31.6  (R-20.4-f)            — LegacyTitledEnumSchema not adopted for new work; accepted from peer
 *  AC-31.7  (R-20.4-g)            — per-option labels ⇒ TitledSingleSelectEnumSchema
 *  AC-31.8  (R-20.5-a)            — action required, one of accept|decline|cancel
 *  AC-31.9  (R-20.5-b)            — content only on form-mode accept; url accept / decline / cancel omit it
 *  AC-31.10 (R-20.5-c)            — content values string|number|boolean|string[] and conform to schema
 *  AC-31.11 (R-20.5-d)            — accept: process form data; url accept = consent, not completion
 *  AC-31.12 (R-20.5-e)            — decline: decline-handling path
 *  AC-31.13 (R-20.5-f)            — cancel: dismissal-handling path
 *  AC-31.14 (R-20.5-g,h)         — no assume-success; defined branches incl. client failure
 *  AC-31.15 (R-20.5-i,j)         — client validates before send; server validates on receipt
 *  AC-31.16 (R-20.6-a)            — server may send elicitation-complete; method/params shape
 *  AC-31.17 (R-20.6-b,c)         — params.elicitationId equals original; only to initiating client
 *  AC-31.18 (R-20.6-d)            — client ignores unknown / already-completed id
 *  AC-31.19 (R-20.6-e,f)         — client may auto-continue; provides manual controls
 *  AC-31.20 (R-20.7-a,b,c)       — UI shows requesting server, decline/cancel any time, privacy
 *  AC-31.21 (R-20.7-d)            — form: review/modify before send
 *  AC-31.22 (R-20.7-e,f,g)       — present what/why, approval controls, decline any time
 *  AC-31.23 (R-20.7-h,i)         — sensitive ⇒ not form mode (url instead); contact data permitted
 *  AC-31.24 (R-20.7-j,k)         — bind to client+user identity; no unverified client identity
 *  AC-31.25 (R-20.7-l,m)         — url: verify opener identity == starter identity
 *  AC-31.26 (R-20.7-n,o)         — verify via authz subject, resilient to URL tampering
 *  AC-31.27 (R-20.7-p,q)         — url carries no sensitive info; not pre-authenticated
 *  AC-31.28 (R-20.7-r,s)         — no clickable URLs in form fields; HTTPS outside dev
 *  AC-31.29 (R-20.7-t,u)         — no auto-prefetch; no open without consent
 *  AC-31.30 (R-20.7-v,w)         — show full URL + domain; open without inspection
 *  AC-31.31 (R-20.7-x,y)         — highlight domain, warn Punycode; clickable only url field
 *  AC-31.32 (R-20.7-z,aa)        — not an authz mechanism; do not transmit credentials to client
 */

import { describe, it, expect } from 'vitest';
import {
  // primitives
  STRING_SCHEMA_FORMATS,
  StringSchemaFormatSchema,
  isStringSchemaFormat,
  StringSchemaSchema,
  NUMBER_SCHEMA_TYPES,
  NumberSchemaSchema,
  BooleanSchemaSchema,
  // enums
  UntitledSingleSelectEnumSchema,
  TitledSingleSelectEnumSchema,
  UntitledMultiSelectEnumSchema,
  TitledMultiSelectEnumSchema,
  LegacyTitledEnumSchema,
  EnumSchemaSchema,
  classifyEnumSchema,
  isLegacyTitledEnumSchema,
  // union + restricted form schema
  PrimitiveSchemaDefinitionSchema,
  classifyPrimitiveSchema,
  isPrimitiveSchemaDefinition,
  validateRestrictedFormSchema,
  isRestrictedFormSchema,
  extractDefaults,
  // results
  ELICIT_ACTION,
  isElicitAction,
  ElicitContentValueSchema,
  StrictElicitResultSchema,
  validateElicitContent,
  validateElicitResult,
  resolveElicitActionOutcome,
  buildAcceptResult,
  buildUrlAcceptResult,
  buildDeclineResult,
  buildCancelResult,
  // notification
  ELICITATION_COMPLETE_NOTIFICATION_METHOD,
  ElicitationCompleteNotificationSchema,
  isElicitationCompleteNotification,
  buildElicitationCompleteNotification,
  handleElicitationComplete,
  // consent / security
  findSensitiveFormFields,
  assertFormModeMayCollect,
  checkElicitationUrlSafety,
  buildUrlConsentPresentation,
  mayRenderUrlClickable,
  verifyElicitationUserBinding,
} from '../../protocol/elicitation-form.js';
import { ELICITATION_MODE } from '../../protocol/elicitation.js';
import { ElicitResultSchema } from '../../protocol/multi-round-trip.js';

// A representative form-mode requestedSchema reused across tests.
const sampleSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Your full name', maxLength: 120 },
    email: { type: 'string', format: 'email', description: 'Your email address' },
    age: { type: 'integer', minimum: 18, default: 18 },
    newsletter: { type: 'boolean', default: false },
    plan: {
      type: 'string',
      title: 'Plan',
      oneOf: [
        { const: 'free', title: 'Free' },
        { const: 'pro', title: 'Pro' },
      ],
      default: 'free',
    },
  },
  required: ['name', 'email'],
} as const;

describe('AC-31.1 (R-20.4-a) restricted flat object of primitive properties', () => {
  it('accepts a flat object whose properties are primitive schemas', () => {
    const result = validateRestrictedFormSchema(sampleSchema);
    expect(result.valid).toBe(true);
    expect(isRestrictedFormSchema(sampleSchema)).toBe(true);
  });

  it('rejects a nested object property', () => {
    const nested = {
      type: 'object',
      properties: {
        address: { type: 'object', properties: { city: { type: 'string' } } },
      },
    };
    const result = validateRestrictedFormSchema(nested);
    expect(result.valid).toBe(false);
    expect(isRestrictedFormSchema(nested)).toBe(false);
  });

  it('rejects an array-of-objects property (beyond the enum array forms)', () => {
    const arrOfObjects = {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object', properties: {} } },
      },
    };
    expect(validateRestrictedFormSchema(arrOfObjects).valid).toBe(false);
  });

  it('rejects a property carrying composition keywords ($ref / allOf)', () => {
    const composed = {
      type: 'object',
      properties: { x: { $ref: '#/$defs/Thing' } },
    };
    expect(validateRestrictedFormSchema(composed).valid).toBe(false);
  });
});

describe('AC-31.2 (R-20.4-b) schema is usable; validation is non-erroring either way', () => {
  it('a client may use it to generate/validate/guide — schema parses cleanly', () => {
    // Validating user input before sending is a permitted MAY; it succeeds here.
    const content = { name: 'Octocat', email: 'octocat@github.com', age: 30 };
    expect(validateElicitContent(content, sampleSchema).valid).toBe(true);
    // Not validating is equally fine — the schema itself is well-formed regardless.
    expect(validateRestrictedFormSchema(sampleSchema).valid).toBe(true);
  });
});

describe('AC-31.3 (R-20.4-c) per-field default extraction for pre-population', () => {
  it('extracts declared defaults across primitive kinds', () => {
    const defaults = extractDefaults(sampleSchema);
    expect(defaults).toEqual({ age: 18, newsletter: false, plan: 'free' });
  });

  it('every primitive schema permits an optional default', () => {
    expect(StringSchemaSchema.safeParse({ type: 'string', default: 'x' }).success).toBe(true);
    expect(NumberSchemaSchema.safeParse({ type: 'number', default: 1 }).success).toBe(true);
    expect(BooleanSchemaSchema.safeParse({ type: 'boolean', default: true }).success).toBe(true);
  });
});

describe('AC-31.4 (R-20.4-d) StringSchema.format restricted to four literals', () => {
  it('accepts each of the four permitted formats', () => {
    for (const f of STRING_SCHEMA_FORMATS) {
      expect(StringSchemaSchema.safeParse({ type: 'string', format: f }).success).toBe(true);
      expect(isStringSchemaFormat(f)).toBe(true);
      expect(StringSchemaFormatSchema.safeParse(f).success).toBe(true);
    }
    expect(STRING_SCHEMA_FORMATS).toEqual(['email', 'uri', 'date', 'date-time']);
  });

  it('rejects any other format value (e.g. "phone")', () => {
    expect(StringSchemaSchema.safeParse({ type: 'string', format: 'phone' }).success).toBe(false);
    expect(isStringSchemaFormat('phone')).toBe(false);
  });
});

describe('AC-31.5 (R-20.4-e) NumberSchema.type restricted to number|integer', () => {
  it('accepts "number" and "integer"', () => {
    expect(NUMBER_SCHEMA_TYPES).toEqual(['number', 'integer']);
    expect(NumberSchemaSchema.safeParse({ type: 'number' }).success).toBe(true);
    expect(NumberSchemaSchema.safeParse({ type: 'integer' }).success).toBe(true);
    expect(classifyPrimitiveSchema({ type: 'integer', minimum: 0 })).toBe('number');
  });

  it('rejects any other type', () => {
    expect(NumberSchemaSchema.safeParse({ type: 'bigint' }).success).toBe(false);
    expect(NumberSchemaSchema.safeParse({ type: 'string' }).success).toBe(false);
  });
});

describe('AC-31.6 (R-20.4-f) legacy enum not adopted for new work; accepted from peer', () => {
  const legacy = {
    type: 'string',
    enum: ['r', 'g', 'b'],
    enumNames: ['Red', 'Green', 'Blue'],
  };

  it('a legacy schema received from a peer still parses (interoperability)', () => {
    expect(LegacyTitledEnumSchema.safeParse(legacy).success).toBe(true);
    expect(EnumSchemaSchema.safeParse(legacy).success).toBe(true);
    expect(isLegacyTitledEnumSchema(legacy)).toBe(true);
    expect(classifyEnumSchema(legacy)).toBe('legacy-titled');
  });

  it('a new implementation using a titled single-select is NOT classified as legacy', () => {
    const modern = {
      type: 'string',
      oneOf: [
        { const: 'r', title: 'Red' },
        { const: 'g', title: 'Green' },
      ],
    };
    expect(isLegacyTitledEnumSchema(modern)).toBe(false);
    expect(classifyEnumSchema(modern)).toBe('titled-single-select');
  });
});

describe('AC-31.7 (R-20.4-g) per-option labels ⇒ TitledSingleSelectEnumSchema', () => {
  it('the titled single-select form carries oneOf {const,title}', () => {
    const titled = {
      type: 'string',
      oneOf: [
        { const: 'free', title: 'Free' },
        { const: 'pro', title: 'Pro' },
      ],
    };
    expect(TitledSingleSelectEnumSchema.safeParse(titled).success).toBe(true);
    // both required per option
    const missingTitle = { type: 'string', oneOf: [{ const: 'free' }] };
    expect(TitledSingleSelectEnumSchema.safeParse(missingTitle).success).toBe(false);
  });

  it('all five enum forms classify distinctly', () => {
    expect(classifyEnumSchema({ type: 'string', enum: ['a'] })).toBe('untitled-single-select');
    expect(
      classifyEnumSchema({ type: 'string', oneOf: [{ const: 'a', title: 'A' }] }),
    ).toBe('titled-single-select');
    expect(
      classifyEnumSchema({ type: 'array', items: { type: 'string', enum: ['a'] } }),
    ).toBe('untitled-multi-select');
    expect(
      classifyEnumSchema({ type: 'array', items: { anyOf: [{ const: 'a', title: 'A' }] } }),
    ).toBe('titled-multi-select');
    expect(UntitledSingleSelectEnumSchema.safeParse({ type: 'string', enum: ['a'] }).success).toBe(true);
    expect(
      UntitledMultiSelectEnumSchema.safeParse({ type: 'array', items: { type: 'string', enum: ['a'] } })
        .success,
    ).toBe(true);
    expect(
      TitledMultiSelectEnumSchema.safeParse({ type: 'array', items: { anyOf: [{ const: 'a', title: 'A' }] } })
        .success,
    ).toBe(true);
  });
});

describe('PrimitiveSchemaDefinition union classification', () => {
  it('classifies each primitive member structurally', () => {
    expect(classifyPrimitiveSchema({ type: 'string' })).toBe('string');
    expect(classifyPrimitiveSchema({ type: 'string', format: 'email' })).toBe('string');
    expect(classifyPrimitiveSchema({ type: 'number' })).toBe('number');
    expect(classifyPrimitiveSchema({ type: 'boolean' })).toBe('boolean');
    expect(classifyPrimitiveSchema({ type: 'string', enum: ['a', 'b'] })).toBe('enum');
    expect(classifyPrimitiveSchema({ type: 'object' })).toBeUndefined();
    expect(isPrimitiveSchemaDefinition({ type: 'boolean' })).toBe(true);
    expect(isPrimitiveSchemaDefinition({ type: 'object' })).toBe(false);
    expect(PrimitiveSchemaDefinitionSchema.safeParse({ type: 'number', maximum: 10 }).success).toBe(true);
  });
});

describe('AC-31.8 (R-20.5-a) action required and one of accept|decline|cancel', () => {
  it('accepts the three action literals', () => {
    for (const a of [ELICIT_ACTION.ACCEPT, ELICIT_ACTION.DECLINE, ELICIT_ACTION.CANCEL]) {
      expect(isElicitAction(a)).toBe(true);
      expect(StrictElicitResultSchema.safeParse({ action: a }).success).toBe(true);
    }
  });

  it('rejects a missing or unknown action', () => {
    expect(StrictElicitResultSchema.safeParse({}).success).toBe(false);
    expect(StrictElicitResultSchema.safeParse({ action: 'maybe' }).success).toBe(false);
    expect(isElicitAction('maybe')).toBe(false);
    expect(validateElicitResult({ action: 'maybe' }, ELICITATION_MODE.FORM).valid).toBe(false);
  });
});

describe('AC-31.9 (R-20.5-b) content presence rules by mode and action', () => {
  it('permits content on a form-mode accept', () => {
    const result = validateElicitResult(
      { action: 'accept', content: { name: 'A', email: 'a@b.co' } },
      ELICITATION_MODE.FORM,
      sampleSchema,
    );
    expect(result.valid).toBe(true);
  });

  it('treats a URL-mode accept carrying content as malformed', () => {
    const result = validateElicitResult(
      { action: 'accept', content: { x: 'y' } },
      ELICITATION_MODE.URL,
    );
    expect(result.valid).toBe(false);
  });

  it('rejects content on a decline or cancel', () => {
    expect(validateElicitResult({ action: 'decline', content: { x: 'y' } }, ELICITATION_MODE.FORM).valid).toBe(
      false,
    );
    expect(validateElicitResult({ action: 'cancel', content: { x: 'y' } }, ELICITATION_MODE.FORM).valid).toBe(
      false,
    );
  });

  it('a URL-mode accept without content is valid', () => {
    expect(validateElicitResult({ action: 'accept' }, ELICITATION_MODE.URL).valid).toBe(true);
  });
});

describe('AC-31.10 (R-20.5-c) content value typing and schema conformance', () => {
  it('accepts string|number|boolean|string[] value types', () => {
    for (const v of ['s', 1, true, ['a', 'b']]) {
      expect(ElicitContentValueSchema.safeParse(v).success).toBe(true);
    }
  });

  it('rejects a value of another type (object / null / mixed array)', () => {
    expect(ElicitContentValueSchema.safeParse({}).success).toBe(false);
    expect(ElicitContentValueSchema.safeParse(null).success).toBe(false);
    expect(ElicitContentValueSchema.safeParse([1, 2]).success).toBe(false);
  });

  it('conforms content against requestedSchema: known fields, types, constraints', () => {
    const ok = validateElicitContent(
      { name: 'Octocat', email: 'o@x.co', age: 30, newsletter: true, plan: 'pro' },
      sampleSchema,
    );
    expect(ok.valid).toBe(true);

    // integer field given a non-integer
    expect(validateElicitContent({ name: 'A', email: 'a@b.co', age: 30.5 }, sampleSchema).valid).toBe(false);
    // below minimum
    expect(validateElicitContent({ name: 'A', email: 'a@b.co', age: 5 }, sampleSchema).valid).toBe(false);
    // enum value not permitted
    expect(validateElicitContent({ name: 'A', email: 'a@b.co', plan: 'enterprise' }, sampleSchema).valid).toBe(
      false,
    );
    // missing required field
    expect(validateElicitContent({ name: 'A' }, sampleSchema).valid).toBe(false);
    // unknown field
    expect(validateElicitContent({ name: 'A', email: 'a@b.co', nope: 'x' }, sampleSchema).valid).toBe(false);
    // wrong type for a boolean field
    expect(
      validateElicitContent({ name: 'A', email: 'a@b.co', newsletter: 'yes' }, sampleSchema).valid,
    ).toBe(false);
  });

  it('validates multi-select arrays with item membership and min/maxItems', () => {
    const multiSchema = {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          minItems: 1,
          maxItems: 2,
          items: { type: 'string', enum: ['a', 'b', 'c'] },
        },
      },
    };
    expect(validateElicitContent({ tags: ['a', 'b'] }, multiSchema).valid).toBe(true);
    expect(validateElicitContent({ tags: [] }, multiSchema).valid).toBe(false); // < minItems
    expect(validateElicitContent({ tags: ['a', 'b', 'c'] }, multiSchema).valid).toBe(false); // > maxItems
    expect(validateElicitContent({ tags: ['z'] }, multiSchema).valid).toBe(false); // not a member
  });
});

describe('AC-31.11 (R-20.5-d) accept handling: form processes data, url is consent only', () => {
  it('form-mode accept ⇒ process-form-data with the content', () => {
    const outcome = resolveElicitActionOutcome(
      { action: 'accept', content: { name: 'A', email: 'a@b.co' } },
      ELICITATION_MODE.FORM,
      sampleSchema,
    );
    expect(outcome.handle).toBe('process-form-data');
    if (outcome.handle === 'process-form-data') {
      expect(outcome.content).toEqual({ name: 'A', email: 'a@b.co' });
    }
  });

  it('url-mode accept ⇒ await-url-completion (consent, not completion)', () => {
    const outcome = resolveElicitActionOutcome({ action: 'accept' }, ELICITATION_MODE.URL);
    expect(outcome.handle).toBe('await-url-completion');
  });
});

describe('AC-31.12 / AC-31.13 (R-20.5-e,f) decline and cancel handling paths', () => {
  it('decline ⇒ declined path', () => {
    expect(resolveElicitActionOutcome({ action: 'decline' }, ELICITATION_MODE.FORM).handle).toBe('declined');
    expect(buildDeclineResult()).toEqual({ action: 'decline' });
  });

  it('cancel ⇒ cancelled path', () => {
    expect(resolveElicitActionOutcome({ action: 'cancel' }, ELICITATION_MODE.URL).handle).toBe('cancelled');
    expect(buildCancelResult()).toEqual({ action: 'cancel' });
  });
});

describe('AC-31.14 (R-20.5-g,h) no assume-success; defined branch for client failure', () => {
  it('a malformed/non-conforming result is treated as a failure to process, never success', () => {
    // Client returned content that violates the schema → malformed, not accepted.
    const outcome = resolveElicitActionOutcome(
      { action: 'accept', content: { name: 'A', email: 'a@b.co', age: 'old' } },
      ELICITATION_MODE.FORM,
      sampleSchema,
    );
    expect(outcome.handle).toBe('malformed');
    if (outcome.handle === 'malformed') expect(outcome.errors.length).toBeGreaterThan(0);
  });

  it('every action maps to a distinct, defined branch', () => {
    const branches = new Set([
      resolveElicitActionOutcome({ action: 'accept', content: { name: 'A', email: 'a@b.co' } }, ELICITATION_MODE.FORM, sampleSchema).handle,
      resolveElicitActionOutcome({ action: 'accept' }, ELICITATION_MODE.URL).handle,
      resolveElicitActionOutcome({ action: 'decline' }, ELICITATION_MODE.FORM).handle,
      resolveElicitActionOutcome({ action: 'cancel' }, ELICITATION_MODE.FORM).handle,
      resolveElicitActionOutcome({ action: 'bogus' }, ELICITATION_MODE.FORM).handle,
    ]);
    expect(branches).toEqual(
      new Set(['process-form-data', 'await-url-completion', 'declined', 'cancelled', 'malformed']),
    );
  });
});

describe('AC-31.15 (R-20.5-i,j) client validates before send; server validates on receipt', () => {
  it('buildAcceptResult validates content before producing the result (client-side)', () => {
    const result = buildAcceptResult({
      content: { name: 'A', email: 'a@b.co', age: 20 },
      requestedSchema: sampleSchema,
    });
    expect(result.action).toBe('accept');
    // S17 ElicitResultSchema still accepts the built result.
    expect(ElicitResultSchema.safeParse(result).success).toBe(true);
    // Bad content throws rather than being sent.
    expect(() =>
      buildAcceptResult({ content: { name: 'A' }, requestedSchema: sampleSchema }),
    ).toThrow(TypeError);
  });

  it('a server validates the same content via validateElicitContent (server-side)', () => {
    expect(validateElicitContent({ name: 'A', email: 'a@b.co' }, sampleSchema).valid).toBe(true);
    expect(validateElicitContent({ email: 'a@b.co' }, sampleSchema).valid).toBe(false);
  });
});

describe('AC-31.16 (R-20.6-a) elicitation-complete notification shape', () => {
  it('builds a well-formed notification with the exact method and params', () => {
    expect(ELICITATION_COMPLETE_NOTIFICATION_METHOD).toBe('notifications/elicitation/complete');
    const n = buildElicitationCompleteNotification('id-123');
    expect(n.method).toBe(ELICITATION_COMPLETE_NOTIFICATION_METHOD);
    expect(n.jsonrpc).toBe('2.0');
    expect(n.params.elicitationId).toBe('id-123');
    expect(isElicitationCompleteNotification(n)).toBe(true);
    expect(ElicitationCompleteNotificationSchema.safeParse(n).success).toBe(true);
    // No id field (it is a notification).
    expect('id' in n).toBe(false);
  });

  it('rejects an empty elicitationId', () => {
    expect(() => buildElicitationCompleteNotification('')).toThrow(TypeError);
    expect(isElicitationCompleteNotification({ jsonrpc: '2.0', method: ELICITATION_COMPLETE_NOTIFICATION_METHOD, params: {} })).toBe(false);
  });
});

describe('AC-31.17 (R-20.6-b,c) elicitationId matches original; delivered to initiator only', () => {
  it('carries the original request elicitationId verbatim', () => {
    const original = '550e8400-e29b-41d4-a716-446655440000';
    const n = buildElicitationCompleteNotification(original);
    expect(n.params.elicitationId).toBe(original);
  });

  it('handler treats the notification as bound to a client-tracked id (initiator scope)', () => {
    // A client only tracks ids it initiated; an id from another client is unknown here.
    const n = buildElicitationCompleteNotification('foreign-id');
    expect(handleElicitationComplete(n, { 'my-id': 'pending' })).toEqual({
      action: 'ignore',
      reason: 'unknown-id',
    });
  });
});

describe('AC-31.18 (R-20.6-d) client ignores unknown / already-completed id', () => {
  it('ignores an unknown id', () => {
    const n = buildElicitationCompleteNotification('x');
    expect(handleElicitationComplete(n, {})).toEqual({ action: 'ignore', reason: 'unknown-id' });
  });

  it('ignores an already-completed id', () => {
    const n = buildElicitationCompleteNotification('x');
    expect(handleElicitationComplete(n, { x: 'completed' })).toEqual({
      action: 'ignore',
      reason: 'already-completed',
    });
  });

  it('ignores a malformed notification', () => {
    expect(handleElicitationComplete({ method: 'other' }, { x: 'pending' }).action).toBe('ignore');
  });
});

describe('AC-31.19 (R-20.6-e,f) client may auto-continue; manual controls remain', () => {
  it('a pending id ⇒ complete (client MAY auto-retry/update UI/continue)', () => {
    const n = buildElicitationCompleteNotification('x');
    expect(handleElicitationComplete(n, { x: 'pending' })).toEqual({
      action: 'complete',
      elicitationId: 'x',
    });
  });

  it('manual recovery is independent of the notification: cancel/decline always available', () => {
    // The client can always build a manual cancel/decline result without any notification.
    expect(buildCancelResult().action).toBe('cancel');
    expect(buildDeclineResult().action).toBe('decline');
  });
});

describe('AC-31.20 / AC-31.21 / AC-31.22 (R-20.7-a..g) user control affordances', () => {
  it('the three actions give the user decline/cancel at any time (review/approve/edit/decline/cancel)', () => {
    // The action vocabulary itself encodes user control: accept (approve), decline, cancel.
    expect(buildUrlAcceptResult()).toEqual({ action: 'accept' });
    expect(buildDeclineResult()).toEqual({ action: 'decline' });
    expect(buildCancelResult()).toEqual({ action: 'cancel' });
    // Editing before send is supported by re-validating modified content prior to accept.
    const edited = buildAcceptResult({ content: { name: 'Edited', email: 'e@x.co' }, requestedSchema: sampleSchema });
    expect(edited.content).toEqual({ name: 'Edited', email: 'e@x.co' });
  });

  it('consent presentation surfaces what server/URL is requesting (clarity of request)', () => {
    const p = buildUrlConsentPresentation('https://mcp.example.com/ui/connect');
    expect(p.host).toBe('mcp.example.com');
    expect(p.fullUrl).toContain('mcp.example.com');
  });
});

describe('AC-31.23 (R-20.7-h,i) sensitive info ⇒ url mode; contact data permitted in form', () => {
  it('flags sensitive credential fields in a form schema', () => {
    const sensitive = {
      type: 'object',
      properties: {
        password: { type: 'string' },
        api_key: { type: 'string', title: 'API Key' },
        token: { type: 'string' },
      },
    };
    const flagged = findSensitiveFormFields(sensitive);
    expect(flagged).toEqual(expect.arrayContaining(['password', 'api_key', 'token']));
    const check = assertFormModeMayCollect(sensitive);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.sensitiveFields.length).toBeGreaterThan(0);
  });

  it('does not flag general contact/profile fields (name, email, username)', () => {
    const contact = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        username: { type: 'string' },
      },
    };
    expect(findSensitiveFormFields(contact)).toEqual([]);
    expect(assertFormModeMayCollect(contact).ok).toBe(true);
  });
});

describe('AC-31.24 / AC-31.25 / AC-31.26 (R-20.7-j..o) identity binding & verification', () => {
  it('passes when the MCP-session subject matches the browser-session subject', () => {
    expect(verifyElicitationUserBinding('user-1', 'user-1')).toEqual({ ok: true });
  });

  it('rejects a subject mismatch (cross-user phishing)', () => {
    const r = verifyElicitationUserBinding('victim', 'attacker');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('subject-mismatch');
  });

  it('rejects when an authoritative subject is missing (no unverified identity)', () => {
    expect(verifyElicitationUserBinding(undefined, 'x').ok).toBe(false);
    expect(verifyElicitationUserBinding('x', undefined).ok).toBe(false);
    const r = verifyElicitationUserBinding(undefined, undefined);
    if (!r.ok) expect(r.reason).toBe('unverified-identity');
  });
});

describe('AC-31.27 / AC-31.28 (R-20.7-p,q,r,s) safe URL construction', () => {
  it('accepts a clean HTTPS URL with no sensitive params', () => {
    expect(checkElicitationUrlSafety('https://mcp.example.com/ui/set_api_key')).toEqual({ safe: true });
  });

  it('flags sensitive query parameters and embedded credentials', () => {
    const r1 = checkElicitationUrlSafety('https://x.example.com/cb?access_token=abc');
    expect(r1.safe).toBe(false);
    const r2 = checkElicitationUrlSafety('https://user:pass@x.example.com/');
    expect(r2.safe).toBe(false);
    if (!r2.safe) expect(r2.reasons.some((x) => x.reason === 'pre-authenticated')).toBe(true);
  });

  it('flags a non-HTTPS scheme outside development, permits it when allowInsecure', () => {
    expect(checkElicitationUrlSafety('http://localhost:3000/ui').safe).toBe(false);
    expect(checkElicitationUrlSafety('http://localhost:3000/ui', { allowInsecure: true })).toEqual({ safe: true });
  });

  it('no clickable URL in a form field; only the url field of a url-mode request is clickable', () => {
    expect(mayRenderUrlClickable('description', ELICITATION_MODE.FORM)).toBe(false);
    expect(mayRenderUrlClickable('url', ELICITATION_MODE.FORM)).toBe(false);
    expect(mayRenderUrlClickable('message', ELICITATION_MODE.URL)).toBe(false);
    expect(mayRenderUrlClickable('url', ELICITATION_MODE.URL)).toBe(true);
  });
});

describe('AC-31.29 / AC-31.30 / AC-31.31 (R-20.7-t..y) safe URL handling (client)', () => {
  it('consent presentation shows full URL and highlights the target host/domain', () => {
    const p = buildUrlConsentPresentation('https://login.mcp.example.com/oauth?x=1');
    expect(p.fullUrl).toBe('https://login.mcp.example.com/oauth?x=1');
    expect(p.host).toBe('login.mcp.example.com');
    expect(p.domain).toBe('example.com');
    expect(p.scheme).toBe('https');
    // Building the presentation does NOT fetch anything — it is a pure parse.
  });

  it('warns about Punycode / suspicious hosts', () => {
    const p = buildUrlConsentPresentation('https://xn--80ak6aa92e.com/path');
    expect(p.containsPunycode).toBe(true);
    expect(p.warnings.some((w) => /Punycode/i.test(w))).toBe(true);
  });

  it('warns about non-HTTPS and embedded credentials in the presented URL', () => {
    const p = buildUrlConsentPresentation('http://user:pass@evil.example.com/');
    expect(p.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects presenting an invalid URL', () => {
    expect(() => buildUrlConsentPresentation('not a url')).toThrow(TypeError);
  });
});

describe('AC-31.32 (R-20.7-z,aa) not an authorization mechanism', () => {
  it('a URL-mode accept never carries content/credentials back to the client', () => {
    // The URL-mode accept result is content-free by construction.
    expect(buildUrlAcceptResult()).toEqual({ action: 'accept' });
    // And a URL-mode accept WITH content is rejected as malformed (no credential channel to client).
    expect(validateElicitResult({ action: 'accept', content: { token: 'x' } }, ELICITATION_MODE.URL).valid).toBe(
      false,
    );
  });

  it('a pre-authenticated URL is flagged unsafe (cannot be used to impersonate)', () => {
    expect(checkElicitationUrlSafety('https://user:token@api.example.com/resource').safe).toBe(false);
  });
});
