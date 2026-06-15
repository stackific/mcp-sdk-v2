/**
 * S30 — Elicitation I: Capability, Delivery & Modes (§20.1–§20.3).
 *
 * Elicitation is a server's request for structured user input, gathered and
 * returned through the client. It is an active (non-Deprecated) client
 * capability. Crucially, an elicitation request is NOT a server-initiated
 * JSON-RPC request: the server returns an `"input_required"` result carrying an
 * `elicitation/create` request (the §11 / S17 multi-round-trip mechanism), and
 * the client supplies the user's input by retrying the originating request.
 * (§20, §20.2)
 *
 * This module owns the FRONT half of elicitation:
 *   - the `elicitation` client-capability shape and its `form`/`url` sub-flags,
 *     and the declaration / gating rules (§20.1) — built on the `clientDeclares`
 *     / `mayUseUrlElicitation` predicates of S10 (capability-negotiation.ts);
 *   - the embedded `ElicitRequest` (method literal `"elicitation/create"` +
 *     `params`) — a stricter refinement of the S17-owned
 *     `ElicitationInputRequestSchema` (which accepts any `params` object);
 *   - the two parameter MODES (`ElicitRequestParams` discriminated by `mode`):
 *     form mode (`requestedSchema` describing the fields to collect — restricted
 *     to a flat object of primitive properties) and URL mode (a navigable URL,
 *     gated by `elicitation.url`).
 *
 * Out of scope (owned by S31, §20.4–§20.8): the full `PrimitiveSchemaDefinition`
 * value type behind `requestedSchema.properties`, the `ElicitResult`
 * accept/decline/cancel actions (already forward-declared as `ElicitResultSchema`
 * in S17), the §20.6 elicitation-complete notification, and consent rules. This
 * module references `PrimitiveSchemaDefinition` by name only and validates the
 * STRUCTURAL `requestedSchema` restrictions (flat object of primitive schemas).
 */

import { z } from 'zod';
import { clientDeclares, mayUseUrlElicitation } from './capability-negotiation.js';

// The S17-owned delivery/response anchors this module builds on — the
// `elicitation/create` input-request envelope (`ElicitationInputRequestSchema`)
// and the client's answer shape (`ElicitResultSchema`) — are NOT re-exported
// here: they already reach the protocol barrel through `multi-round-trip.js`,
// and re-exporting the same bindings would double-export them. (§20.2, §11 / S17)

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns `true` when `value` is a non-null, non-array object (a JSON object). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── Method discriminator (§20, §20.2) ─────────────────────────────────────────

/**
 * The exact, case-sensitive `method` literal that identifies an elicitation
 * input request within the multi-round-trip `InputRequest` union. (§20, §20.2,
 * R-20.2-b)
 */
export const ELICITATION_CREATE_METHOD = 'elicitation/create' as const;

// ─── Elicitation modes (§20.3) ─────────────────────────────────────────────────

/**
 * The two elicitation modes, selected by the `mode` discriminator in `params`.
 * (§20.3)
 *
 *   `"form"` — in-band structured collection; the collected data IS exposed to
 *              the client. It is the implicit baseline (a `params` with no
 *              `mode` is form mode). (R-20.3-a, R-20.3-c)
 *   `"url"`  — out-of-band navigation; data other than the URL is NOT exposed
 *              to the client (suited to authorization / payment flows), gated by
 *              the `elicitation.url` sub-flag. (R-20.3-i, R-20.1-d)
 */
export const ELICITATION_MODE = {
  FORM: 'form',
  URL: 'url',
} as const;

/** One of the two defined elicitation modes (`"form"` | `"url"`). (§20.3) */
export type ElicitationMode = (typeof ELICITATION_MODE)[keyof typeof ELICITATION_MODE];

/** Returns `true` when `value` is one of the two defined elicitation modes. */
export function isElicitationMode(value: unknown): value is ElicitationMode {
  return value === ELICITATION_MODE.FORM || value === ELICITATION_MODE.URL;
}

// ─── elicitation capability value (§20.1) ──────────────────────────────────────

/**
 * The value placed under `ClientCapabilities.elicitation`. An object with two
 * OPTIONAL sub-flags, `form` and `url`, each (when present) an object selecting
 * a supported mode; an empty sub-flag object `{}` denotes support with no extra
 * settings. The whole value is itself OPTIONAL within `ClientCapabilities`.
 * (§20.1, R-20.1-f)
 *
 * Structurally identical to the `ElicitationCapabilitySchema` embedded in S10's
 * `ClientCapabilitiesSchema`; named here so S30 callers can validate / build the
 * sub-object standalone. `.passthrough()` preserves forward-compatible additions.
 */
export const ElicitationCapabilityValueSchema = z
  .object({
    /** Present ⇒ form mode supported. `{}` = supported, no extra settings. (R-20.1-f) */
    form: z.record(z.unknown()).optional(),
    /** Present ⇒ url mode supported. `{}` = supported, no extra settings. (R-20.1-f) */
    url: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type ElicitationCapabilityValue = z.infer<typeof ElicitationCapabilityValueSchema>;

// ─── requestedSchema (form mode) (§20.3, §20.4) ────────────────────────────────

/**
 * The `requestedSchema` of a form-mode elicitation: a restricted JSON Schema
 * describing the flat set of fields to collect. (§20.3, R-20.3-e – R-20.3-h)
 *
 * Field rules:
 *   - `type` REQUIRED, MUST be the literal `"object"`. (R-20.3-e)
 *   - `properties` REQUIRED: a flat (non-nested) map from field name to a
 *     `PrimitiveSchemaDefinition` (the primitive value type itself is owned by
 *     S31 / §20.4; here each value is accepted as a JSON object and the flatness
 *     restriction is enforced structurally by {@link validateRequestedSchema}).
 *     (R-20.3-f)
 *   - `required` OPTIONAL `string[]`: names of properties that MUST be supplied.
 *     (R-20.3-g)
 *   - `$schema` OPTIONAL string: the JSON Schema dialect identifier. (R-20.3-h)
 *
 * `.passthrough()` preserves additional JSON Schema keywords on the object.
 */
export const RequestedSchemaSchema = z
  .object({
    /** OPTIONAL JSON Schema dialect identifier. (R-20.3-h) */
    $schema: z.string().optional(),
    /** REQUIRED; MUST be the literal `"object"`. (R-20.3-e) */
    type: z.literal('object'),
    /** REQUIRED flat map field name → PrimitiveSchemaDefinition (S31 / §20.4). (R-20.3-f) */
    properties: z.record(z.record(z.unknown())),
    /** OPTIONAL names of properties that MUST be supplied. (R-20.3-g) */
    required: z.array(z.string()).optional(),
  })
  .passthrough();

export type RequestedSchema = z.infer<typeof RequestedSchemaSchema>;

// ─── ElicitRequestParams — form mode (§20.3) ───────────────────────────────────

/**
 * Form-mode parameters: in-band structured collection against `requestedSchema`;
 * the collected data IS exposed to the client. (§20.3)
 *
 *   - `mode` OPTIONAL; if present MUST be the literal `"form"`. A server MAY omit
 *     it; a client MUST treat a `params` with no `mode` as form mode.
 *     (R-20.3-a, R-20.3-b, R-20.3-c)
 *   - `message` REQUIRED string presented to the user describing the request.
 *     (R-20.3-d)
 *   - `requestedSchema` REQUIRED {@link RequestedSchema}. (R-20.3-e)
 */
export const ElicitRequestFormParamsSchema = z
  .object({
    /** OPTIONAL; if present MUST be `"form"`. (R-20.3-a, R-20.3-b) */
    mode: z.literal(ELICITATION_MODE.FORM).optional(),
    /** REQUIRED human-readable description of what is requested. (R-20.3-d) */
    message: z.string(),
    /** REQUIRED restricted schema describing the fields to collect. (R-20.3-e) */
    requestedSchema: RequestedSchemaSchema,
  })
  .passthrough();

export type ElicitRequestFormParams = z.infer<typeof ElicitRequestFormParamsSchema>;

// ─── ElicitRequestParams — URL mode (§20.3) ────────────────────────────────────

/**
 * URL-mode parameters: out-of-band interaction by navigating to a URL; only the
 * URL is exposed to the client (suited to authorization / payment flows).
 * (§20.3)
 *
 *   - `mode` REQUIRED; MUST be the literal `"url"`. (R-20.3-i)
 *   - `message` REQUIRED string explaining why the interaction is needed.
 *     (R-20.3-j)
 *   - `elicitationId` REQUIRED opaque string identifying the elicitation within
 *     the server's context; the client MUST treat it as opaque. (R-20.3-k,
 *     R-20.3-l)
 *   - `url` REQUIRED string the user navigates to; MUST be a valid URI / URL.
 *     (R-20.3-m, R-20.3-n) — enforced with Zod's `url()` refinement.
 */
export const ElicitRequestURLParamsSchema = z
  .object({
    /** REQUIRED; MUST be `"url"`. (R-20.3-i) */
    mode: z.literal(ELICITATION_MODE.URL),
    /** REQUIRED explanation of why the interaction is needed. (R-20.3-j) */
    message: z.string(),
    /** REQUIRED opaque server-scoped correlation id. (R-20.3-k, R-20.3-l) */
    elicitationId: z.string().min(1),
    /** REQUIRED valid URI the user navigates to. (R-20.3-m, R-20.3-n) */
    url: z.string().url(),
  })
  .passthrough();

export type ElicitRequestURLParams = z.infer<typeof ElicitRequestURLParamsSchema>;

// ─── ElicitRequestParams (mode union) (§20.2, §20.3) ───────────────────────────

/**
 * The `params` of an `ElicitRequest`: one of two mode-specific shapes selected
 * by the `mode` field. (§20.2, §20.3)
 *
 * This is NOT a Zod `discriminatedUnion` because the form-mode discriminator is
 * OPTIONAL (a `params` with no `mode` is form mode, R-20.3-c) — a constraint
 * `discriminatedUnion` cannot express. Instead URL mode is tried first (it
 * requires `mode: "url"`) and anything else falls through to form mode, which
 * accepts both `mode: "form"` and an absent `mode`. (R-20.3-a, R-20.3-c)
 */
export const ElicitRequestParamsSchema = z.union([
  ElicitRequestURLParamsSchema,
  ElicitRequestFormParamsSchema,
]);

export type ElicitRequestParams = z.infer<typeof ElicitRequestParamsSchema>;

// ─── ElicitRequest (§20.2) ─────────────────────────────────────────────────────

/**
 * The request embedded as the `elicitation/create` member of the multi-round-trip
 * `InputRequest` union, describing one elicitation the server asks the client to
 * fulfill. (§20.2)
 *
 *   - `method` REQUIRED; the exact, case-sensitive literal `"elicitation/create"`.
 *     (R-20.2-b)
 *   - `params` REQUIRED {@link ElicitRequestParams}. (R-20.2-c)
 *
 * This is a STRICTER refinement of the S17-owned `ElicitationInputRequestSchema`
 * (which accepts any `params` object so S17 can carry elicitation before this
 * story pins its shape). Parsing through `ElicitRequestSchema` additionally
 * validates the mode-specific `params`. `.passthrough()` mirrors the S17 anchor.
 */
export const ElicitRequestSchema = z
  .object({
    /** REQUIRED exact literal discriminator. (R-20.2-b) */
    method: z.literal(ELICITATION_CREATE_METHOD),
    /** REQUIRED mode-specific parameters. (R-20.2-c) */
    params: ElicitRequestParamsSchema,
  })
  .passthrough();

export type ElicitRequest = z.infer<typeof ElicitRequestSchema>;

/** Returns `true` when `value` is a well-formed {@link ElicitRequest}. (§20.2) */
export function isElicitRequest(value: unknown): value is ElicitRequest {
  return ElicitRequestSchema.safeParse(value).success;
}

/**
 * Returns `true` when `value` carries the exact, case-sensitive
 * `"elicitation/create"` method literal — the §11 input-request discriminator
 * an `ElicitRequest` MUST present. (§20.2, R-20.2-b)
 *
 * This is a lightweight method-only check (it does not validate `params`); use
 * {@link isElicitRequest} for full structural validation.
 */
export function isElicitationCreateRequest(value: unknown): boolean {
  return isPlainObject(value) && value['method'] === ELICITATION_CREATE_METHOD;
}

// ─── Mode resolution (§20.3) ───────────────────────────────────────────────────

/**
 * Resolves the effective elicitation mode of a `params` object, applying the
 * backwards-compatibility rule that an absent `mode` means form mode.
 * (§20.3, R-20.3-b, R-20.3-c)
 *
 * Returns `"form"` when `mode` is absent or the literal `"form"`, `"url"` when
 * it is the literal `"url"`, and `undefined` for any other (malformed) value.
 *
 * @param params - An `ElicitRequestParams`-shaped object.
 */
export function resolveElicitationMode(params: unknown): ElicitationMode | undefined {
  if (!isPlainObject(params)) return undefined;
  const mode = params['mode'];
  // Form mode is the implicit baseline: absent mode ⇒ form. (R-20.3-c)
  if (mode === undefined || mode === ELICITATION_MODE.FORM) return ELICITATION_MODE.FORM;
  if (mode === ELICITATION_MODE.URL) return ELICITATION_MODE.URL;
  return undefined;
}

// ─── requestedSchema restriction validator (§20.3, §20.4) ──────────────────────

/** One failure reported by {@link validateRequestedSchema}. */
export interface RequestedSchemaError {
  /** A dotted path to the offending node (e.g. `properties.address`). */
  path: string;
  /** Human-readable detail. */
  detail: string;
}

/** Outcome of {@link validateRequestedSchema}. */
export type RequestedSchemaValidation =
  | { valid: true; schema: RequestedSchema }
  | { valid: false; errors: RequestedSchemaError[] };

/** The JSON Schema keywords that introduce nesting / non-primitive structure. */
const NON_FLAT_PROPERTY_KEYWORDS = new Set([
  'properties',
  'items',
  'prefixItems',
  'additionalProperties',
  'patternProperties',
  'allOf',
  'anyOf',
  'oneOf',
  '$ref',
]);

/**
 * Validates the STRUCTURAL restrictions on a form-mode `requestedSchema`:
 * `type` is the literal `"object"`, `properties` is a flat (non-nested) map, and
 * every `required` entry names a declared property. (§20.3, §20.4, R-20.3-e,
 * R-20.3-f, R-20.3-g)
 *
 * "Flat" means each property's schema describes a primitive — it MUST NOT itself
 * be an object/array container (no `properties`, `items`, `$ref`, composition
 * keywords, or `type: "object"`/`"array"`). The full `PrimitiveSchemaDefinition`
 * value model is owned by S31 (§20.4); this checks only the flatness the story
 * pins here, so a property schema is otherwise accepted as a JSON object.
 *
 * @param value - The candidate `requestedSchema` object.
 */
export function validateRequestedSchema(value: unknown): RequestedSchemaValidation {
  const parsed = RequestedSchemaSchema.safeParse(value);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((i) => ({
        path: i.path.join('.') || '<root>',
        detail: i.message,
      })),
    };
  }

  const schema = parsed.data;
  const errors: RequestedSchemaError[] = [];

  for (const [name, propSchema] of Object.entries(schema.properties)) {
    const propType = (propSchema as Record<string, unknown>)['type'];
    if (propType === 'object' || propType === 'array') {
      errors.push({
        path: `properties.${name}`,
        detail: `property schema must be primitive (flat); type "${String(propType)}" is not allowed (R-20.3-f)`,
      });
    }
    for (const keyword of Object.keys(propSchema)) {
      if (NON_FLAT_PROPERTY_KEYWORDS.has(keyword)) {
        errors.push({
          path: `properties.${name}.${keyword}`,
          detail: `nesting keyword "${keyword}" is not allowed in a flat requestedSchema (R-20.3-f)`,
        });
      }
    }
  }

  // Every `required` entry MUST name a declared property. (R-20.3-g)
  if (schema.required) {
    for (const req of schema.required) {
      if (!Object.prototype.hasOwnProperty.call(schema.properties, req)) {
        errors.push({
          path: `required`,
          detail: `required property "${req}" is not declared in properties (R-20.3-g)`,
        });
      }
    }
  }

  return errors.length === 0 ? { valid: true, schema } : { valid: false, errors };
}

// ─── URL validity (§20.3) ──────────────────────────────────────────────────────

/**
 * Returns `true` when `url` is a valid, absolute URI/URL per RFC 3986 — the
 * requirement on the url-mode `url` field. (§20.3, R-20.3-m, R-20.3-n)
 *
 * Uses the WHATWG `URL` parser (absolute URLs only); relative references and
 * malformed strings are rejected.
 */
export function isValidElicitationUrl(url: unknown): boolean {
  if (typeof url !== 'string' || url.length === 0) return false;
  try {
    // The single-argument `URL` constructor requires an absolute URL.
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ─── Capability declaration & mode support (§20.1) ─────────────────────────────

/**
 * Returns `true` when `clientCaps` declares the `elicitation` capability — the
 * MUST-declare-to-use rule. A client that does not declare it is treated as not
 * supporting elicitation. (§20.1, R-20.1-a)
 *
 * Delegates to S10's `clientDeclares` (presence-means-supported).
 *
 * @param clientCaps - The client's declared `ClientCapabilities`.
 */
export function clientSupportsElicitation(clientCaps: Record<string, unknown>): boolean {
  return clientDeclares(clientCaps, 'elicitation');
}

/**
 * Returns the set of elicitation modes a client supports, applying the
 * empty-object-equals-form-only equivalence: declaring `elicitation` always
 * implies `form` (the implicit baseline), and `url` is added only when the
 * `elicitation.url` sub-flag is present. (§20.1, R-20.1-c, R-20.1-f)
 *
 * Returns an empty array when `elicitation` is not declared at all. By
 * R-20.1-b, a client that declares `elicitation` therefore always supports at
 * least one mode (`form`).
 *
 * @param clientCaps - The client's declared `ClientCapabilities`.
 */
export function supportedElicitationModes(
  clientCaps: Record<string, unknown>,
): ElicitationMode[] {
  if (!clientDeclares(clientCaps, 'elicitation')) return [];
  // Implicit baseline: elicitation present ⇒ form supported (even `{}`). (R-20.1-c)
  const modes: ElicitationMode[] = [ELICITATION_MODE.FORM];
  // url only when the explicit sub-flag is present. (R-20.1-f, reuse S10 predicate)
  if (mayUseUrlElicitation(clientCaps)) modes.push(ELICITATION_MODE.URL);
  return modes;
}

/**
 * Returns `true` when the client declaring `clientCaps` supports `mode`, applying
 * the empty-object-equals-form-only equivalence. (§20.1, R-20.1-c, R-20.1-f)
 *
 * `form` is supported whenever `elicitation` is declared; `url` requires the
 * `elicitation.url` sub-flag.
 *
 * @param clientCaps - The client's declared `ClientCapabilities`.
 * @param mode       - The mode to test.
 */
export function clientSupportsElicitationMode(
  clientCaps: Record<string, unknown>,
  mode: ElicitationMode,
): boolean {
  return supportedElicitationModes(clientCaps).includes(mode);
}

// ─── Server-side gating (§20.1) ────────────────────────────────────────────────

/** Why a server may not emit an `elicitation/create` request, per §20.1 gating. */
export type ElicitationGateRejection =
  /** The client did not declare the `elicitation` capability. (R-20.1-e) */
  | { reason: 'capability-not-declared' }
  /** The client declared `elicitation` but not the requested `mode`. (R-20.1-d) */
  | { reason: 'mode-not-supported'; mode: ElicitationMode };

/** Outcome of {@link gateElicitationRequest}. */
export type ElicitationGateResult =
  | { ok: true }
  | { ok: false; rejection: ElicitationGateRejection };

/**
 * Decides whether a server MAY send an `elicitation/create` request of `mode` to
 * a client with the given declared capabilities. (§20.1, R-20.1-d, R-20.1-e)
 *
 *   - A server MUST NOT return an `elicitation/create` input-required result to a
 *     client that has not declared `elicitation` → `capability-not-declared`.
 *     (R-20.1-e)
 *   - A server MUST NOT send a request whose `mode` the client's declared
 *     sub-flags do not support (empty-object equivalence applied) →
 *     `mode-not-supported`. (R-20.1-d)
 *
 * Returns `{ ok: true }` only when both prohibitions are cleared.
 *
 * @param clientCaps - The client's declared `ClientCapabilities`.
 * @param mode       - The mode the server intends to use. Defaults to `"form"`,
 *   matching the absent-mode baseline of a form-mode request. (R-20.3-c)
 */
export function gateElicitationRequest(
  clientCaps: Record<string, unknown>,
  mode: ElicitationMode = ELICITATION_MODE.FORM,
): ElicitationGateResult {
  if (!clientDeclares(clientCaps, 'elicitation')) {
    return { ok: false, rejection: { reason: 'capability-not-declared' } };
  }
  if (!clientSupportsElicitationMode(clientCaps, mode)) {
    return { ok: false, rejection: { reason: 'mode-not-supported', mode } };
  }
  return { ok: true };
}

/**
 * Convenience predicate: `true` exactly when {@link gateElicitationRequest}
 * permits a server to send an `elicitation/create` request of `mode`. (§20.1,
 * R-20.1-d, R-20.1-e)
 */
export function mayServerSendElicitation(
  clientCaps: Record<string, unknown>,
  mode: ElicitationMode = ELICITATION_MODE.FORM,
): boolean {
  return gateElicitationRequest(clientCaps, mode).ok;
}

// ─── Builders (§20.2, §20.3) ───────────────────────────────────────────────────

/**
 * Builds a well-formed form-mode {@link ElicitRequest}. (§20.2, §20.3)
 *
 * The `mode` field is omitted by default (the backwards-compatible form-mode
 * encoding, R-20.3-b); pass `includeMode: true` to emit the explicit
 * `mode: "form"`. The `requestedSchema` is validated against the flat-object
 * restriction before the request is built.
 *
 * @throws {TypeError} When `requestedSchema` violates the restriction (§20.4).
 */
export function buildFormElicitRequest(opts: {
  message: string;
  requestedSchema: unknown;
  includeMode?: boolean;
}): ElicitRequest {
  const validation = validateRequestedSchema(opts.requestedSchema);
  if (!validation.valid) {
    const detail = validation.errors.map((e) => `${e.path}: ${e.detail}`).join('; ');
    throw new TypeError(`Invalid requestedSchema for form elicitation: ${detail}`);
  }
  const params: ElicitRequestFormParams = {
    message: opts.message,
    requestedSchema: validation.schema,
  };
  if (opts.includeMode) params.mode = ELICITATION_MODE.FORM;
  return { method: ELICITATION_CREATE_METHOD, params };
}

/**
 * Builds a well-formed url-mode {@link ElicitRequest}. (§20.2, §20.3)
 *
 * `mode: "url"` is REQUIRED and always emitted (R-20.3-i). The `url` is checked
 * for validity before the request is built. (R-20.3-n)
 *
 * @throws {TypeError} When `url` is not a valid absolute URI/URL (R-20.3-n) or
 *   `elicitationId` is empty (R-20.3-k).
 */
export function buildUrlElicitRequest(opts: {
  message: string;
  elicitationId: string;
  url: string;
}): ElicitRequest {
  if (!opts.elicitationId) {
    throw new TypeError('url-mode elicitation requires a non-empty elicitationId (R-20.3-k)');
  }
  if (!isValidElicitationUrl(opts.url)) {
    throw new TypeError(`url-mode elicitation requires a valid URL; got ${JSON.stringify(opts.url)} (R-20.3-n)`);
  }
  const params: ElicitRequestURLParams = {
    mode: ELICITATION_MODE.URL,
    message: opts.message,
    elicitationId: opts.elicitationId,
    url: opts.url,
  };
  return { method: ELICITATION_CREATE_METHOD, params };
}
