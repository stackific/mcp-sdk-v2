/**
 * S31 — Elicitation II: Restricted Form Schema, Results & Consent
 * (§20.4–§20.8).
 *
 * S30 (`elicitation.ts`) routed and modeled an elicitation: the `elicitation`
 * capability, the input-required delivery of an `elicitation/create` request, and
 * the `form`/`url` mode `params` shapes — including the structural `requestedSchema`
 * container (flat object, primitives-only, validated by `validateRequestedSchema`).
 * This module fills in the PAYLOAD AND OUTCOME surface those modes require:
 *
 *   - the `PrimitiveSchemaDefinition` value type behind `requestedSchema.properties`
 *     — the four primitive field schemas (`StringSchema`, `NumberSchema`,
 *     `BooleanSchema`) and the `EnumSchema` family (single/multi-select, titled or
 *     untitled, plus the Deprecated legacy `enumNames` form); (§20.4)
 *   - a stricter `requestedSchema` validator that checks each property against the
 *     primitive union (building on S30's structural flatness check); (§20.4)
 *   - a validator for the `content` a client returns on `accept` against that
 *     `requestedSchema`, and the `ElicitResult` action semantics
 *     (accept/decline/cancel, presence-of-content rules); (§20.5)
 *   - the `notifications/elicitation/complete` server→client notification that
 *     signals out-of-band URL-mode completion, with its send/ignore rules; (§20.6)
 *   - the consent / security predicates: sensitive-data form-mode prohibition,
 *     URL-mode identity-binding and anti-phishing checks, safe URL construction
 *     (server) and safe URL handling (client). (§20.7)
 *
 * This module REUSES S30's `RequestedSchemaSchema` / `validateRequestedSchema` and
 * the S17-forward-declared `ElicitResultSchema` (the accept/decline/cancel result),
 * narrowing and building on them with NEW names; it never redefines them. (§20.5)
 */

import { z } from 'zod';
import { RequestedSchemaSchema, ELICITATION_MODE } from './elicitation.js';
import type { RequestedSchema, ElicitationMode } from './elicitation.js';
import type { ElicitResult } from './multi-round-trip.js';

/** Returns `true` when `value` is a non-null, non-array object (a JSON object). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── StringSchema (§20.4) ──────────────────────────────────────────────────────

/**
 * The four permitted `StringSchema.format` literals. A `format`, when present,
 * MUST be exactly one of these; any other value (e.g. `"phone"`) is rejected.
 * (§20.4, R-20.4-d)
 */
export const STRING_SCHEMA_FORMATS = ['email', 'uri', 'date', 'date-time'] as const;

/** One of the four permitted `StringSchema.format` literals. (§20.4, R-20.4-d) */
export type StringSchemaFormat = (typeof STRING_SCHEMA_FORMATS)[number];

/** Zod enum over the four permitted `StringSchema.format` literals. (R-20.4-d) */
export const StringSchemaFormatSchema = z.enum(STRING_SCHEMA_FORMATS);

/** Returns `true` when `value` is one of the four permitted string formats. (R-20.4-d) */
export function isStringSchemaFormat(value: unknown): value is StringSchemaFormat {
  return (STRING_SCHEMA_FORMATS as readonly unknown[]).includes(value);
}

/**
 * A free-text field of a form-mode `requestedSchema`, optionally length-bounded
 * and format-hinted. (§20.4)
 *
 *   - `type` REQUIRED; MUST be the literal `"string"`.
 *   - `title` / `description` OPTIONAL display strings.
 *   - `minLength` / `maxLength` OPTIONAL numeric length bounds.
 *   - `format` OPTIONAL; when present MUST be one of `"email"`, `"uri"`, `"date"`,
 *     `"date-time"`. (R-20.4-d)
 *   - `default` OPTIONAL string pre-population value. (R-20.4-c)
 *
 * Note: this is the FREE-TEXT string schema — it carries no `enum`/`oneOf`, which
 * is what structurally distinguishes it from the string-typed enum members. The
 * presence of `enum`/`oneOf` selects an {@link EnumSchema} member instead.
 */
export const StringSchemaSchema = z
  .object({
    /** REQUIRED; MUST be exactly `"string"`. */
    type: z.literal('string'),
    /** OPTIONAL display label. */
    title: z.string().optional(),
    /** OPTIONAL descriptive text. */
    description: z.string().optional(),
    /** OPTIONAL minimum string length. */
    minLength: z.number().optional(),
    /** OPTIONAL maximum string length. */
    maxLength: z.number().optional(),
    /** OPTIONAL; one of the four permitted formats. (R-20.4-d) */
    format: StringSchemaFormatSchema.optional(),
    /** OPTIONAL default value. (R-20.4-c) */
    default: z.string().optional(),
  })
  .passthrough();

export type StringSchema = z.infer<typeof StringSchemaSchema>;

// ─── NumberSchema (§20.4) ──────────────────────────────────────────────────────

/** The two permitted `NumberSchema.type` literals. (§20.4, R-20.4-e) */
export const NUMBER_SCHEMA_TYPES = ['number', 'integer'] as const;

/** One of the two permitted `NumberSchema.type` literals. (§20.4, R-20.4-e) */
export type NumberSchemaType = (typeof NUMBER_SCHEMA_TYPES)[number];

/**
 * A numeric field of a form-mode `requestedSchema`, integer or real, optionally
 * bounded. (§20.4)
 *
 *   - `type` REQUIRED; MUST be `"number"` or `"integer"`. (R-20.4-e)
 *   - `title` / `description` OPTIONAL display strings.
 *   - `minimum` / `maximum` OPTIONAL inclusive bounds.
 *   - `default` OPTIONAL numeric pre-population value. (R-20.4-c)
 */
export const NumberSchemaSchema = z
  .object({
    /** REQUIRED; MUST be `"number"` or `"integer"`. (R-20.4-e) */
    type: z.enum(NUMBER_SCHEMA_TYPES),
    /** OPTIONAL display label. */
    title: z.string().optional(),
    /** OPTIONAL descriptive text. */
    description: z.string().optional(),
    /** OPTIONAL inclusive lower bound. */
    minimum: z.number().optional(),
    /** OPTIONAL inclusive upper bound. */
    maximum: z.number().optional(),
    /** OPTIONAL default value. (R-20.4-c) */
    default: z.number().optional(),
  })
  .passthrough();

export type NumberSchema = z.infer<typeof NumberSchemaSchema>;

// ─── BooleanSchema (§20.4) ─────────────────────────────────────────────────────

/**
 * A true/false field of a form-mode `requestedSchema`. (§20.4)
 *
 *   - `type` REQUIRED; MUST be the literal `"boolean"`.
 *   - `title` / `description` OPTIONAL display strings.
 *   - `default` OPTIONAL boolean pre-population value. (R-20.4-c)
 */
export const BooleanSchemaSchema = z
  .object({
    /** REQUIRED; MUST be exactly `"boolean"`. */
    type: z.literal('boolean'),
    /** OPTIONAL display label. */
    title: z.string().optional(),
    /** OPTIONAL descriptive text. */
    description: z.string().optional(),
    /** OPTIONAL default value. (R-20.4-c) */
    default: z.boolean().optional(),
  })
  .passthrough();

export type BooleanSchema = z.infer<typeof BooleanSchemaSchema>;

// ─── EnumSchema family (§20.4) ─────────────────────────────────────────────────

/**
 * One option of a titled enum: the wire `const` value plus its display `title`.
 * Both are REQUIRED. (§20.4)
 *
 * `const` is a reserved word in some contexts but a valid object key / Zod field;
 * it is quoted here for clarity.
 */
export const TitledEnumOptionSchema = z
  .object({
    /** REQUIRED; the enum value selected when this option is chosen. */
    const: z.string(),
    /** REQUIRED; the display label for this option. */
    title: z.string(),
  })
  .passthrough();

export type TitledEnumOption = z.infer<typeof TitledEnumOptionSchema>;

/**
 * A single choice from a list of string values, with no separate display labels.
 * (§20.4, `UntitledSingleSelectEnumSchema`)
 *
 *   - `type` REQUIRED; MUST be `"string"`.
 *   - `enum` REQUIRED `string[]`; the values to choose from.
 *   - `title` / `description` OPTIONAL; `default` OPTIONAL string. (R-20.4-c)
 */
export const UntitledSingleSelectEnumSchema = z
  .object({
    type: z.literal('string'),
    title: z.string().optional(),
    description: z.string().optional(),
    /** REQUIRED; the values to choose from. */
    enum: z.array(z.string()),
    default: z.string().optional(),
  })
  .passthrough();

export type UntitledSingleSelectEnum = z.infer<typeof UntitledSingleSelectEnumSchema>;

/**
 * A single choice where each option carries a separate display label.
 * (§20.4, `TitledSingleSelectEnumSchema`)
 *
 * SHOULD be used when per-option display labels are needed, in preference to the
 * Deprecated `enumNames` form. (R-20.4-g)
 *
 *   - `type` REQUIRED; MUST be `"string"`.
 *   - `oneOf` REQUIRED; one `{ const, title }` entry per selectable option.
 *   - `title` / `description` OPTIONAL; `default` OPTIONAL (a member of the
 *     option `const`s). (R-20.4-c)
 */
export const TitledSingleSelectEnumSchema = z
  .object({
    type: z.literal('string'),
    title: z.string().optional(),
    description: z.string().optional(),
    /** REQUIRED; one entry per selectable option. */
    oneOf: z.array(TitledEnumOptionSchema),
    default: z.string().optional(),
  })
  .passthrough();

export type TitledSingleSelectEnum = z.infer<typeof TitledSingleSelectEnumSchema>;

/** The `items` schema of an untitled multi-select enum: a string `enum`. (§20.4) */
export const UntitledMultiSelectItemsSchema = z
  .object({
    /** REQUIRED; MUST be `"string"`. */
    type: z.literal('string'),
    /** REQUIRED; the values to choose from. */
    enum: z.array(z.string()),
  })
  .passthrough();

/**
 * Selection of zero or more values from a list, with no separate display labels.
 * (§20.4, `UntitledMultiSelectEnumSchema`)
 *
 *   - `type` REQUIRED; MUST be the literal `"array"`.
 *   - `items` REQUIRED; `{ type: "string", enum: string[] }`.
 *   - `minItems` / `maxItems` OPTIONAL selection-count bounds.
 *   - `title` / `description` OPTIONAL; `default` OPTIONAL `string[]`. (R-20.4-c)
 */
export const UntitledMultiSelectEnumSchema = z
  .object({
    type: z.literal('array'),
    title: z.string().optional(),
    description: z.string().optional(),
    minItems: z.number().optional(),
    maxItems: z.number().optional(),
    /** REQUIRED; the item schema (a string enum). */
    items: UntitledMultiSelectItemsSchema,
    default: z.array(z.string()).optional(),
  })
  .passthrough();

export type UntitledMultiSelectEnum = z.infer<typeof UntitledMultiSelectEnumSchema>;

/** The `items` schema of a titled multi-select enum: an `anyOf` of options. (§20.4) */
export const TitledMultiSelectItemsSchema = z
  .object({
    /** REQUIRED; one `{ const, title }` entry per selectable option. */
    anyOf: z.array(TitledEnumOptionSchema),
  })
  .passthrough();

/**
 * Selection of zero or more values where each option carries a separate display
 * label. (§20.4, `TitledMultiSelectEnumSchema`)
 *
 *   - `type` REQUIRED; MUST be the literal `"array"`.
 *   - `items` REQUIRED; `{ anyOf: Array<{ const, title }> }`.
 *   - `minItems` / `maxItems` OPTIONAL selection-count bounds.
 *   - `title` / `description` OPTIONAL; `default` OPTIONAL `string[]`. (R-20.4-c)
 */
export const TitledMultiSelectEnumSchema = z
  .object({
    type: z.literal('array'),
    title: z.string().optional(),
    description: z.string().optional(),
    minItems: z.number().optional(),
    maxItems: z.number().optional(),
    /** REQUIRED; the item schema (an `anyOf` of titled options). */
    items: TitledMultiSelectItemsSchema,
    default: z.array(z.string()).optional(),
  })
  .passthrough();

export type TitledMultiSelectEnum = z.infer<typeof TitledMultiSelectEnumSchema>;

/**
 * Deprecated legacy titled enum: per-value display labels via a parallel
 * `enumNames` array, non-standard for JSON Schema 2020-12. Implementations
 * SHOULD NOT adopt it for new functionality; it remains defined only for
 * interoperability (a peer MAY still send it). Use
 * {@link TitledSingleSelectEnumSchema} for per-option labels in new work.
 * (§20.4, R-20.4-f, R-20.4-g)
 *
 *   - `type` REQUIRED; MUST be `"string"`.
 *   - `enum` REQUIRED `string[]`; the values to choose from.
 *   - `enumNames` OPTIONAL `string[]`; display names, positionally aligned.
 *   - `title` / `description` OPTIONAL; `default` OPTIONAL string. (R-20.4-c)
 *
 * @deprecated Use {@link TitledSingleSelectEnumSchema} for per-option labels
 *   in new functionality. (R-20.4-f, R-20.4-g)
 */
export const LegacyTitledEnumSchema = z
  .object({
    type: z.literal('string'),
    title: z.string().optional(),
    description: z.string().optional(),
    /** REQUIRED; the values to choose from. */
    enum: z.array(z.string()),
    /** OPTIONAL; display names positionally aligned with `enum`. */
    enumNames: z.array(z.string()).optional(),
    default: z.string().optional(),
  })
  .passthrough();

export type LegacyTitledEnum = z.infer<typeof LegacyTitledEnumSchema>;

/**
 * The `EnumSchema` union: a choice field in any of its five forms.
 * (§20.4)
 *
 * Members are tried most-specific first so a structurally ambiguous object is
 * matched to the form that uses its distinguishing keyword:
 *   - titled single-select (`oneOf`) and titled/untitled multi-select (`items`)
 *     before the string `enum` forms;
 *   - the legacy form (`enum` + optional `enumNames`) before the plain untitled
 *     single-select (`enum` only) — they overlap, but `LegacyTitledEnumSchema`
 *     is a strict superset, so an object with `enumNames` lands on it and one
 *     without still parses under either (the legacy schema accepts it too). The
 *     {@link classifyEnumSchema} helper reports the precise structural form.
 */
export const EnumSchemaSchema = z.union([
  TitledSingleSelectEnumSchema,
  UntitledMultiSelectEnumSchema,
  TitledMultiSelectEnumSchema,
  LegacyTitledEnumSchema,
  UntitledSingleSelectEnumSchema,
]);

export type EnumSchema = z.infer<typeof EnumSchemaSchema>;

/** The structural classification of an {@link EnumSchema}, by distinguishing keyword. */
export type EnumSchemaForm =
  | 'untitled-single-select'
  | 'titled-single-select'
  | 'untitled-multi-select'
  | 'titled-multi-select'
  | 'legacy-titled';

/**
 * Classifies an enum schema into one of its five structural forms by the
 * distinguishing keyword, or returns `undefined` when `value` is not a
 * well-formed enum schema. (§20.4)
 *
 * Classification order resolves overlaps:
 *   - `type: "array"` ⇒ multi-select; `items.anyOf` ⇒ titled, `items.enum` ⇒ untitled.
 *   - `type: "string"` with `oneOf` ⇒ titled single-select.
 *   - `type: "string"` with `enum` + `enumNames` ⇒ legacy titled.
 *   - `type: "string"` with `enum` (no `enumNames`) ⇒ untitled single-select.
 *
 * `enumNames` is the deciding marker for the Deprecated legacy form; an untitled
 * single-select carries `enum` without it. (R-20.4-f)
 */
export function classifyEnumSchema(value: unknown): EnumSchemaForm | undefined {
  if (!isPlainObject(value)) return undefined;
  const type = value['type'];
  if (type === 'array') {
    const items = value['items'];
    if (!isPlainObject(items)) return undefined;
    if (Array.isArray(items['anyOf'])) return 'titled-multi-select';
    if (Array.isArray(items['enum'])) return 'untitled-multi-select';
    return undefined;
  }
  if (type === 'string') {
    if (Array.isArray(value['oneOf'])) return 'titled-single-select';
    if (Array.isArray(value['enum'])) {
      return Array.isArray(value['enumNames']) ? 'legacy-titled' : 'untitled-single-select';
    }
  }
  return undefined;
}

/**
 * Returns `true` when `value` is the Deprecated {@link LegacyTitledEnumSchema}
 * form (a string `enum` carrying the non-standard `enumNames` parallel array).
 * Useful for a conformance check that new functionality does not adopt it, while
 * a legacy schema received from a peer is still accepted. (§20.4, R-20.4-f)
 */
export function isLegacyTitledEnumSchema(value: unknown): boolean {
  return classifyEnumSchema(value) === 'legacy-titled';
}

// ─── PrimitiveSchemaDefinition union (§20.4) ───────────────────────────────────

/**
 * The value type behind each `requestedSchema.properties` entry: the union of the
 * four primitive field schemas a form may use. (§20.4)
 *
 * ```ts
 * PrimitiveSchemaDefinition = StringSchema | NumberSchema | BooleanSchema | EnumSchema
 * ```
 *
 * Order matters: enum members (which carry `enum`/`oneOf`/`items`) are tried
 * before the bare {@link StringSchemaSchema} so a string-typed enum is not
 * mis-matched as a free-text string. {@link NumberSchemaSchema} and
 * {@link BooleanSchemaSchema} are unambiguous by `type`. Use
 * {@link classifyPrimitiveSchema} for the precise selected member.
 */
export const PrimitiveSchemaDefinitionSchema = z.union([
  NumberSchemaSchema,
  BooleanSchemaSchema,
  EnumSchemaSchema,
  StringSchemaSchema,
]);

export type PrimitiveSchemaDefinition = z.infer<typeof PrimitiveSchemaDefinitionSchema>;

/** The structural classification of a {@link PrimitiveSchemaDefinition}. */
export type PrimitiveSchemaKind = 'string' | 'number' | 'boolean' | 'enum';

/**
 * Classifies a property schema by the `PrimitiveSchemaDefinition` member it
 * selects, or returns `undefined` when it is not a valid primitive schema.
 * (§20.4)
 *
 * Selection is structural (per §20.4's table): `boolean` by `type`; `number` for
 * `"number"`/`"integer"`; `enum` for a string/array schema carrying
 * `enum`/`oneOf`/`items`; otherwise `string` for a plain `"string"`.
 */
export function classifyPrimitiveSchema(value: unknown): PrimitiveSchemaKind | undefined {
  if (!isPlainObject(value)) return undefined;
  const type = value['type'];
  if (type === 'boolean') {
    return BooleanSchemaSchema.safeParse(value).success ? 'boolean' : undefined;
  }
  if (type === 'number' || type === 'integer') {
    return NumberSchemaSchema.safeParse(value).success ? 'number' : undefined;
  }
  if (type === 'array') {
    return classifyEnumSchema(value) ? 'enum' : undefined;
  }
  if (type === 'string') {
    // A string schema carrying enum/oneOf is an enum member; otherwise free-text.
    if (Array.isArray(value['enum']) || Array.isArray(value['oneOf'])) {
      return classifyEnumSchema(value) ? 'enum' : undefined;
    }
    return StringSchemaSchema.safeParse(value).success ? 'string' : undefined;
  }
  return undefined;
}

/** Returns `true` when `value` is a valid {@link PrimitiveSchemaDefinition}. (§20.4) */
export function isPrimitiveSchemaDefinition(value: unknown): value is PrimitiveSchemaDefinition {
  return PrimitiveSchemaDefinitionSchema.safeParse(value).success;
}

// ─── Restricted form schema validation (§20.4) ─────────────────────────────────

/** One failure reported by {@link validateRestrictedFormSchema}. */
export interface RestrictedFormSchemaError {
  /** A dotted path to the offending node (e.g. `properties.age`). */
  path: string;
  /** Human-readable detail. */
  detail: string;
}

/** Outcome of {@link validateRestrictedFormSchema}. */
export type RestrictedFormSchemaValidation =
  | { valid: true; schema: RequestedSchema }
  | { valid: false; errors: RestrictedFormSchemaError[] };

/**
 * Validates a form-mode `requestedSchema` against the FULL restricted form schema:
 * the outer object shape (`type: "object"`, a `properties` map, optional
 * `required`/`$schema`) PLUS the §20.4 requirement that every property is a valid
 * {@link PrimitiveSchemaDefinition}. (§20.4, R-20.4-a)
 *
 * This is the §20.4 deepening of S30's §20.3 structural check, and it owns the
 * full flatness judgement here: the primitive union itself excludes nesting — a
 * nested object (`type: "object"`), a generic array-of-objects, a `$ref`, or a
 * composition keyword on a property fails to match any of the four members and is
 * rejected. Crucially, it ACCEPTS the enum array forms (`oneOf`/`anyOf`/`items`),
 * which are the deliberate exceptions §20.4 carves out — these are matched as
 * {@link EnumSchema} members rather than treated as forbidden nesting. (R-20.4-a)
 *
 * Every `required` entry must name a declared property.
 *
 * @param value - The candidate `requestedSchema` object.
 */
export function validateRestrictedFormSchema(value: unknown): RestrictedFormSchemaValidation {
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
  const errors: RestrictedFormSchemaError[] = [];

  for (const [name, propSchema] of Object.entries(schema.properties)) {
    const kind = classifyPrimitiveSchema(propSchema);
    if (kind === undefined) {
      errors.push({
        path: `properties.${name}`,
        detail:
          'property schema is not a valid PrimitiveSchemaDefinition ' +
          '(string | number | boolean | enum) (R-20.4-a)',
      });
    }
  }

  // Every `required` entry MUST name a declared property.
  if (schema.required) {
    for (const req of schema.required) {
      if (!Object.prototype.hasOwnProperty.call(schema.properties, req)) {
        errors.push({
          path: 'required',
          detail: `required property "${req}" is not declared in properties (R-20.4-a)`,
        });
      }
    }
  }

  return errors.length === 0 ? { valid: true, schema } : { valid: false, errors };
}

/** Returns `true` when `value` is a valid restricted form `requestedSchema`. (R-20.4-a) */
export function isRestrictedFormSchema(value: unknown): boolean {
  return validateRestrictedFormSchema(value).valid;
}

// ─── Default extraction (§20.4) ────────────────────────────────────────────────

/**
 * Extracts the per-field `default` values declared in a restricted form schema,
 * so a defaults-supporting client can pre-populate the corresponding fields.
 * (§20.4, R-20.4-c)
 *
 * Returns a map from field name to its declared `default`, including only the
 * fields that declare one. The value is returned as-is (string, number, boolean,
 * or `string[]` per the field's primitive type). A client that supports defaults
 * SHOULD use these to pre-populate; a client that does not MAY ignore them.
 *
 * @param requestedSchema - A form-mode `requestedSchema`.
 */
export function extractDefaults(
  requestedSchema: unknown,
): Record<string, string | number | boolean | string[]> {
  const out: Record<string, string | number | boolean | string[]> = {};
  if (!isPlainObject(requestedSchema)) return out;
  const properties = requestedSchema['properties'];
  if (!isPlainObject(properties)) return out;
  for (const [name, propSchema] of Object.entries(properties)) {
    if (!isPlainObject(propSchema)) continue;
    if (Object.prototype.hasOwnProperty.call(propSchema, 'default')) {
      out[name] = propSchema['default'] as string | number | boolean | string[];
    }
  }
  return out;
}

// ─── ElicitResult actions (§20.5) ──────────────────────────────────────────────

/**
 * The three `ElicitResult.action` literals — the user's intent, applicable to
 * both form and URL modes. (§20.5, R-20.5-a)
 *
 *   `"accept"`  — the user approved and submitted (form: `content` carries the
 *                 data; url: acceptance signals consent, NOT completion).
 *   `"decline"` — the user explicitly refused.
 *   `"cancel"`  — the user dismissed without choosing.
 */
export const ELICIT_ACTION = {
  ACCEPT: 'accept',
  DECLINE: 'decline',
  CANCEL: 'cancel',
} as const;

/** One of the three defined elicitation actions. (§20.5, R-20.5-a) */
export type ElicitAction = (typeof ELICIT_ACTION)[keyof typeof ELICIT_ACTION];

/** Returns `true` when `value` is one of the three defined actions. (R-20.5-a) */
export function isElicitAction(value: unknown): value is ElicitAction {
  return value === ELICIT_ACTION.ACCEPT || value === ELICIT_ACTION.DECLINE || value === ELICIT_ACTION.CANCEL;
}

/**
 * Schema for a single `content` value: a string, number, boolean, or array of
 * strings — the only value types a form-mode `content` map may carry.
 * (§20.5, R-20.5-c)
 */
export const ElicitContentValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export type ElicitContentValue = z.infer<typeof ElicitContentValueSchema>;

/**
 * Schema for the `ElicitResult.content` map: field name → permitted value type.
 * (§20.5, R-20.5-c)
 */
export const ElicitContentSchema = z.record(ElicitContentValueSchema);

export type ElicitContent = z.infer<typeof ElicitContentSchema>;

/**
 * A stricter `ElicitResult` schema that also enforces the §20.5 `content` value
 * typing (string | number | boolean | string[]) — the S17 `ElicitResultSchema`
 * accepts any `content` record so it can carry the result before this story pins
 * the value types. (§20.5, R-20.5-a, R-20.5-c)
 *
 * Parsing through this schema additionally rejects a `content` value of a
 * disallowed type (e.g. an object, `null`, or a mixed array). It does NOT, on its
 * own, enforce mode-correlation (content only on form-mode accept) or schema
 * conformance — use {@link validateElicitResult} for those.
 */
export const StrictElicitResultSchema = z
  .object({
    /** REQUIRED; exactly one of the three action literals. (R-20.5-a) */
    action: z.enum([ELICIT_ACTION.ACCEPT, ELICIT_ACTION.DECLINE, ELICIT_ACTION.CANCEL]),
    /** OPTIONAL; permitted-typed `content` map (form-mode accept only). (R-20.5-b, R-20.5-c) */
    content: ElicitContentSchema.optional(),
  })
  .passthrough();

export type StrictElicitResult = z.infer<typeof StrictElicitResultSchema>;

// ─── content ↔ requestedSchema conformance (§20.5) ─────────────────────────────

/** One failure reported by {@link validateElicitContent}. */
export interface ElicitContentError {
  /** The offending field name, or `<root>` for a top-level shape problem. */
  path: string;
  /** Human-readable detail. */
  detail: string;
}

/** Outcome of {@link validateElicitContent}. */
export type ElicitContentValidation =
  | { valid: true; content: ElicitContent }
  | { valid: false; errors: ElicitContentError[] };

/** Returns `true` when `value` matches the primitive `kind` of its field schema. */
function contentValueMatchesKind(
  value: unknown,
  kind: PrimitiveSchemaKind,
  propSchema: Record<string, unknown>,
): boolean {
  switch (kind) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      // integer schemas additionally require an integer value.
      if (typeof value !== 'number') return false;
      return propSchema['type'] === 'integer' ? Number.isInteger(value) : true;
    case 'boolean':
      return typeof value === 'boolean';
    case 'enum': {
      const form = classifyEnumSchema(propSchema);
      // Multi-select forms carry an array of strings; single-select a string.
      if (form === 'untitled-multi-select' || form === 'titled-multi-select') {
        return Array.isArray(value) && value.every((v) => typeof v === 'string');
      }
      return typeof value === 'string';
    }
    default:
      return false;
  }
}

/** Collects the permitted enum values for an enum field schema (for membership checks). */
function enumValuesOf(propSchema: Record<string, unknown>): Set<string> | undefined {
  const form = classifyEnumSchema(propSchema);
  if (form === 'untitled-single-select' || form === 'legacy-titled') {
    const e = propSchema['enum'];
    return Array.isArray(e) ? new Set(e.filter((v): v is string => typeof v === 'string')) : undefined;
  }
  if (form === 'titled-single-select') {
    const oneOf = propSchema['oneOf'];
    if (!Array.isArray(oneOf)) return undefined;
    return new Set(
      oneOf
        .map((o) => (isPlainObject(o) ? o['const'] : undefined))
        .filter((v): v is string => typeof v === 'string'),
    );
  }
  if (form === 'untitled-multi-select') {
    const items = propSchema['items'];
    const e = isPlainObject(items) ? items['enum'] : undefined;
    return Array.isArray(e) ? new Set(e.filter((v): v is string => typeof v === 'string')) : undefined;
  }
  if (form === 'titled-multi-select') {
    const items = propSchema['items'];
    const anyOf = isPlainObject(items) ? items['anyOf'] : undefined;
    if (!Array.isArray(anyOf)) return undefined;
    return new Set(
      anyOf
        .map((o) => (isPlainObject(o) ? o['const'] : undefined))
        .filter((v): v is string => typeof v === 'string'),
    );
  }
  return undefined;
}

/**
 * Validates an accepted form-mode `content` map against the `requestedSchema` it
 * answers, enforcing the §20.5 conformance rule: every value is a string, number,
 * boolean, or array of strings; every value matches the type/constraints of its
 * field; every `required` field is present; and no unknown field appears.
 * (§20.5, R-20.5-c)
 *
 * Checked per field, by the field's primitive kind:
 *   - `string`  — value is a string; honors `minLength`/`maxLength`; `format` is
 *     a hint and is not strictly enforced here.
 *   - `number`  — value is a number (and an integer when `type: "integer"`);
 *     honors `minimum`/`maximum`.
 *   - `boolean` — value is a boolean.
 *   - `enum`    — single-select: a string that is one of the permitted values;
 *     multi-select: an array of strings, each a permitted value, honoring
 *     `minItems`/`maxItems`.
 *
 * Both a client (before sending, R-20.5-i) and a server (on receipt, R-20.5-j)
 * SHOULD run this. `requestedSchema` itself is validated as a restricted form
 * schema first; an invalid schema yields a `<root>` error.
 *
 * @param content         - The `ElicitResult.content` map to validate.
 * @param requestedSchema - The `requestedSchema` the content answers.
 */
export function validateElicitContent(
  content: unknown,
  requestedSchema: unknown,
): ElicitContentValidation {
  const errors: ElicitContentError[] = [];

  const schemaValidation = validateRestrictedFormSchema(requestedSchema);
  if (!schemaValidation.valid) {
    return {
      valid: false,
      errors: [{ path: '<root>', detail: 'requestedSchema is not a valid restricted form schema (R-20.4-a)' }],
    };
  }

  const parsedContent = ElicitContentSchema.safeParse(content);
  if (!parsedContent.success) {
    return {
      valid: false,
      errors: parsedContent.error.issues.map((i) => ({
        path: i.path.join('.') || '<root>',
        detail: i.message,
      })),
    };
  }

  const map = parsedContent.data;
  const schema = schemaValidation.schema;
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  const required = new Set(schema.required ?? []);

  // No unknown fields.
  for (const key of Object.keys(map)) {
    if (!Object.prototype.hasOwnProperty.call(properties, key)) {
      errors.push({ path: key, detail: `field "${key}" is not declared in requestedSchema (R-20.5-c)` });
    }
  }

  // Every required field present.
  for (const req of required) {
    if (!Object.prototype.hasOwnProperty.call(map, req)) {
      errors.push({ path: req, detail: `required field "${req}" is missing (R-20.5-c)` });
    }
  }

  // Per-field type and constraint conformance.
  for (const [name, propSchema] of Object.entries(properties)) {
    if (!Object.prototype.hasOwnProperty.call(map, name)) continue;
    const value = map[name];
    const kind = classifyPrimitiveSchema(propSchema);
    if (kind === undefined) continue; // schema-level problem already excluded above

    if (!contentValueMatchesKind(value, kind, propSchema)) {
      errors.push({ path: name, detail: `value does not match the ${kind} field schema (R-20.5-c)` });
      continue;
    }

    // Constraint checks per kind.
    if (kind === 'string' && typeof value === 'string') {
      const min = propSchema['minLength'];
      const max = propSchema['maxLength'];
      if (typeof min === 'number' && value.length < min) {
        errors.push({ path: name, detail: `string shorter than minLength ${min} (R-20.5-c)` });
      }
      if (typeof max === 'number' && value.length > max) {
        errors.push({ path: name, detail: `string longer than maxLength ${max} (R-20.5-c)` });
      }
    } else if (kind === 'number' && typeof value === 'number') {
      const min = propSchema['minimum'];
      const max = propSchema['maximum'];
      if (typeof min === 'number' && value < min) {
        errors.push({ path: name, detail: `number below minimum ${min} (R-20.5-c)` });
      }
      if (typeof max === 'number' && value > max) {
        errors.push({ path: name, detail: `number above maximum ${max} (R-20.5-c)` });
      }
    } else if (kind === 'enum') {
      const allowed = enumValuesOf(propSchema);
      const values = Array.isArray(value) ? value : [value];
      if (allowed) {
        for (const v of values) {
          if (typeof v === 'string' && !allowed.has(v)) {
            errors.push({ path: name, detail: `value "${v}" is not one of the permitted enum values (R-20.5-c)` });
          }
        }
      }
      const form = classifyEnumSchema(propSchema);
      if ((form === 'untitled-multi-select' || form === 'titled-multi-select') && Array.isArray(value)) {
        const min = propSchema['minItems'];
        const max = propSchema['maxItems'];
        if (typeof min === 'number' && value.length < min) {
          errors.push({ path: name, detail: `fewer than minItems ${min} selections (R-20.5-c)` });
        }
        if (typeof max === 'number' && value.length > max) {
          errors.push({ path: name, detail: `more than maxItems ${max} selections (R-20.5-c)` });
        }
      }
    }
  }

  return errors.length === 0 ? { valid: true, content: map } : { valid: false, errors };
}

/** One failure reported by {@link validateElicitResult}. */
export interface ElicitResultError {
  /** A dotted path to the offending node. */
  path: string;
  /** Human-readable detail. */
  detail: string;
}

/** Outcome of {@link validateElicitResult}. */
export type ElicitResultValidation =
  | { valid: true; result: ElicitResult }
  | { valid: false; errors: ElicitResultError[] };

/**
 * Validates a returned `ElicitResult` against the §20.5 action/content rules for
 * the mode it answers. (§20.5, R-20.5-a, R-20.5-b, R-20.5-c)
 *
 * Enforced:
 *   - `action` is REQUIRED and exactly one of `"accept"` / `"decline"` /
 *     `"cancel"`. (R-20.5-a)
 *   - `content` is permitted ONLY when `action === "accept"` and the mode is
 *     `"form"`; a URL-mode accept, a decline, or a cancel carrying `content` is
 *     malformed. (R-20.5-b)
 *   - When `content` is present (form-mode accept), it conforms to
 *     `requestedSchema` per {@link validateElicitContent} — supply
 *     `requestedSchema` to enable this check. (R-20.5-c)
 *
 * @param result          - The `ElicitResult` returned by the client.
 * @param mode            - The mode of the originating request (`"form"` | `"url"`).
 * @param requestedSchema - The form-mode `requestedSchema` (used only to check
 *   `content` conformance on a form-mode accept).
 */
export function validateElicitResult(
  result: unknown,
  mode: ElicitationMode,
  requestedSchema?: unknown,
): ElicitResultValidation {
  const parsed = StrictElicitResultSchema.safeParse(result);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((i) => ({
        path: i.path.join('.') || '<root>',
        detail: i.message,
      })),
    };
  }

  const value = parsed.data;
  const errors: ElicitResultError[] = [];
  const hasContent = value.content !== undefined;

  if (hasContent) {
    if (value.action !== ELICIT_ACTION.ACCEPT) {
      errors.push({
        path: 'content',
        detail: `content is only permitted on an "accept" action; got "${value.action}" (R-20.5-b)`,
      });
    } else if (mode === ELICITATION_MODE.URL) {
      errors.push({
        path: 'content',
        detail: 'content MUST be omitted for a URL-mode response (R-20.5-b)',
      });
    } else if (requestedSchema !== undefined) {
      const contentValidation = validateElicitContent(value.content, requestedSchema);
      if (!contentValidation.valid) {
        for (const e of contentValidation.errors) {
          errors.push({ path: `content.${e.path}`, detail: e.detail });
        }
      }
    }
  }

  return errors.length === 0
    ? { valid: true, result: value as ElicitResult }
    : { valid: false, errors };
}

// ─── Server action handling (§20.5) ────────────────────────────────────────────

/** A structured directive for how a server should react to an `ElicitResult`. */
export type ElicitActionOutcome =
  /** form-mode accept with conforming `content`; the server SHOULD process it. (R-20.5-d) */
  | { handle: 'process-form-data'; content: ElicitContent }
  /** url-mode accept: consent given, NOT completion; await §20.6 notification. (R-20.5-d) */
  | { handle: 'await-url-completion' }
  /** explicit decline; the server SHOULD offer alternatives. (R-20.5-e) */
  | { handle: 'declined' }
  /** dismissal; the server SHOULD prompt again later. (R-20.5-f) */
  | { handle: 'cancelled' }
  /** the result was malformed for its mode; treat as a failure to process. (R-20.5-g, R-20.5-h) */
  | { handle: 'malformed'; errors: ElicitResultError[] };

/**
 * Maps a returned `ElicitResult` to the server's handling directive, encoding the
 * §20.5 rule that a server MUST NOT assume success and MUST handle decline,
 * cancel, and a client failure to process. (§20.5, R-20.5-d – R-20.5-h)
 *
 * The returned `handle` gives the server an explicit branch for every action:
 * `process-form-data` (form accept), `await-url-completion` (url accept — consent
 * not completion), `declined`, `cancelled`, and `malformed` (the client's answer
 * did not conform — treated as a failure to process, never as success).
 *
 * @param result          - The `ElicitResult` returned by the client.
 * @param mode            - The mode of the originating request.
 * @param requestedSchema - The form-mode `requestedSchema` (for content checks).
 */
export function resolveElicitActionOutcome(
  result: unknown,
  mode: ElicitationMode,
  requestedSchema?: unknown,
): ElicitActionOutcome {
  const validation = validateElicitResult(result, mode, requestedSchema);
  if (!validation.valid) {
    return { handle: 'malformed', errors: validation.errors };
  }
  const { action, content } = validation.result;
  if (action === ELICIT_ACTION.DECLINE) return { handle: 'declined' };
  if (action === ELICIT_ACTION.CANCEL) return { handle: 'cancelled' };
  // accept:
  if (mode === ELICITATION_MODE.URL) return { handle: 'await-url-completion' };
  return { handle: 'process-form-data', content: (content ?? {}) as ElicitContent };
}

// ─── Builders for ElicitResult (§20.5) ─────────────────────────────────────────

/**
 * Builds a form-mode `accept` {@link ElicitResult} carrying validated `content`.
 * (§20.5, R-20.5-c, R-20.5-i)
 *
 * Validates `content` against `requestedSchema` before building (the client-side
 * pre-send check), so a malformed submission is rejected rather than sent.
 *
 * @throws {TypeError} When `content` does not conform to `requestedSchema`.
 */
export function buildAcceptResult(opts: {
  content: ElicitContent;
  requestedSchema: unknown;
}): ElicitResult {
  const validation = validateElicitContent(opts.content, opts.requestedSchema);
  if (!validation.valid) {
    const detail = validation.errors.map((e) => `${e.path}: ${e.detail}`).join('; ');
    throw new TypeError(`Invalid elicitation content: ${detail}`);
  }
  return { action: ELICIT_ACTION.ACCEPT, content: validation.content };
}

/**
 * Builds a URL-mode `accept` {@link ElicitResult} — consent to the out-of-band
 * interaction, carrying NO `content`. (§20.5, R-20.5-b)
 */
export function buildUrlAcceptResult(): ElicitResult {
  return { action: ELICIT_ACTION.ACCEPT };
}

/** Builds a `decline` {@link ElicitResult} (no `content`). (§20.5) */
export function buildDeclineResult(): ElicitResult {
  return { action: ELICIT_ACTION.DECLINE };
}

/** Builds a `cancel` {@link ElicitResult} (no `content`). (§20.5) */
export function buildCancelResult(): ElicitResult {
  return { action: ELICIT_ACTION.CANCEL };
}

// ─── Elicitation-complete notification (§20.6) ─────────────────────────────────

/**
 * The exact method literal of the URL-mode out-of-band completion notification.
 * (§20.6, R-20.6-a)
 */
export const ELICITATION_COMPLETE_NOTIFICATION_METHOD =
  'notifications/elicitation/complete' as const;

/**
 * The `params` of an {@link ElicitationCompleteNotification}: the
 * `elicitationId` that completed. (§20.6, R-20.6-b)
 */
export const ElicitationCompleteNotificationParamsSchema = z
  .object({
    /** REQUIRED; matches the original `elicitation/create` request's id. (R-20.6-b) */
    elicitationId: z.string().min(1),
    /** OPTIONAL notification metadata. */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type ElicitationCompleteNotificationParams = z.infer<
  typeof ElicitationCompleteNotificationParamsSchema
>;

/**
 * The full `notifications/elicitation/complete` JSON-RPC notification: a
 * server→client signal that a URL-mode out-of-band interaction has finished.
 * A notification has no `id` and no response. (§20.6, R-20.6-a, R-20.6-b)
 */
export const ElicitationCompleteNotificationSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    method: z.literal(ELICITATION_COMPLETE_NOTIFICATION_METHOD),
    params: ElicitationCompleteNotificationParamsSchema,
  })
  .passthrough();

export type ElicitationCompleteNotification = z.infer<
  typeof ElicitationCompleteNotificationSchema
>;

/** Returns `true` when `value` is a well-formed elicitation-complete notification. */
export function isElicitationCompleteNotification(
  value: unknown,
): value is ElicitationCompleteNotification {
  return ElicitationCompleteNotificationSchema.safeParse(value).success;
}

/**
 * Builds a `notifications/elicitation/complete` notification for `elicitationId`.
 * (§20.6, R-20.6-a, R-20.6-b)
 *
 * The caller (the server) MUST send the returned notification only to the client
 * that initiated the elicitation (R-20.6-c) — a transport-level concern this
 * builder cannot enforce; it ensures the `elicitationId` is carried verbatim.
 *
 * @throws {TypeError} When `elicitationId` is empty (R-20.6-b).
 */
export function buildElicitationCompleteNotification(
  elicitationId: string,
): ElicitationCompleteNotification {
  if (typeof elicitationId !== 'string' || elicitationId.length === 0) {
    throw new TypeError('elicitation-complete notification requires a non-empty elicitationId (R-20.6-b)');
  }
  return {
    jsonrpc: '2.0',
    method: ELICITATION_COMPLETE_NOTIFICATION_METHOD,
    params: { elicitationId },
  };
}

/** The state of an elicitation as tracked by a client awaiting URL-mode completion. */
export type ElicitationLifecycleState = 'pending' | 'completed';

/**
 * Outcome of {@link handleElicitationComplete}: what a client should do with a
 * received completion notification given the state it has tracked.
 */
export type ElicitationCompleteHandling =
  /** Unknown or already-completed id ⇒ MUST ignore, take no action. (R-20.6-d) */
  | { action: 'ignore'; reason: 'unknown-id' | 'already-completed' }
  /** A pending id just completed ⇒ MAY auto-retry / update UI / continue. (R-20.6-e) */
  | { action: 'complete'; elicitationId: string };

/**
 * Decides how a client should react to an incoming elicitation-complete
 * notification, enforcing the §20.6 ignore rule. (§20.6, R-20.6-d, R-20.6-e)
 *
 * A client MUST ignore a notification whose `elicitationId` is unknown or already
 * completed (R-20.6-d); for a still-pending id it MAY proceed to auto-retry,
 * update its UI, or otherwise continue (R-20.6-e). Independently of the
 * notification, a client SHOULD provide manual retry/cancel controls in case it
 * never arrives (R-20.6-f) — a UI concern outside this pure decision.
 *
 * @param notification - The received notification (validated here).
 * @param known        - Map of `elicitationId` → tracked lifecycle state for the
 *   in-flight URL-mode elicitations this client initiated.
 */
export function handleElicitationComplete(
  notification: unknown,
  known: Record<string, ElicitationLifecycleState>,
): ElicitationCompleteHandling {
  const parsed = ElicitationCompleteNotificationSchema.safeParse(notification);
  if (!parsed.success) {
    return { action: 'ignore', reason: 'unknown-id' };
  }
  const id = parsed.data.params.elicitationId;
  const state = known[id];
  if (state === undefined) return { action: 'ignore', reason: 'unknown-id' };
  if (state === 'completed') return { action: 'ignore', reason: 'already-completed' };
  return { action: 'complete', elicitationId: id };
}

// ─── Sensitive information & form-vs-URL mode (§20.7) ───────────────────────────

/**
 * Heuristic markers for sensitive credential fields a server MUST NOT request via
 * form mode (passwords, API keys, access tokens, payment credentials). Matched
 * against a lower-cased field name / `title` / `description`. (§20.7, R-20.7-h)
 *
 * This is a best-effort guard, not an exhaustive list; servers remain responsible
 * for routing sensitive interactions to URL mode. (R-20.7-i)
 */
export const SENSITIVE_FIELD_MARKERS = [
  'password',
  'passwd',
  'secret',
  'api key',
  'apikey',
  'api-key',
  'access token',
  'access_token',
  'accesstoken',
  'token',
  'credential',
  'private key',
  'card number',
  'cardnumber',
  'cvv',
  'cvc',
  'ssn',
  'payment',
] as const;

/**
 * Returns `true` when `text` contains a marker suggesting sensitive credential
 * data. Used to flag fields that should not be collected via form mode.
 * (§20.7, R-20.7-h)
 */
function looksSensitive(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  const hay = text.toLowerCase();
  return SENSITIVE_FIELD_MARKERS.some((m) => hay.includes(m));
}

/**
 * Inspects a form-mode `requestedSchema` for fields that appear to request
 * sensitive credential data, which a server MUST NOT collect via form mode (and
 * MUST instead route through URL mode). (§20.7, R-20.7-h, R-20.7-i)
 *
 * Returns the list of field names whose name / `title` / `description` matches a
 * sensitive marker. An empty list means no sensitive fields were detected — note
 * that general contact/profile data (name, email, username) is NOT categorically
 * prohibited in form mode and is not flagged. (R-20.7-i)
 *
 * @param requestedSchema - A form-mode `requestedSchema`.
 */
export function findSensitiveFormFields(requestedSchema: unknown): string[] {
  const flagged: string[] = [];
  if (!isPlainObject(requestedSchema)) return flagged;
  const properties = requestedSchema['properties'];
  if (!isPlainObject(properties)) return flagged;
  for (const [name, propSchema] of Object.entries(properties)) {
    const fields = [name];
    if (isPlainObject(propSchema)) {
      fields.push(String(propSchema['title'] ?? ''), String(propSchema['description'] ?? ''));
      // `format: "email"` is contact data, never categorically sensitive.
    }
    if (fields.some((f) => looksSensitive(f))) flagged.push(name);
  }
  return flagged;
}

/** Outcome of {@link assertFormModeMayCollect}. */
export type SensitiveFieldCheck =
  | { ok: true }
  | { ok: false; sensitiveFields: string[] };

/**
 * Asserts that a form-mode `requestedSchema` does not request sensitive
 * credential data — the §20.7 prohibition. (§20.7, R-20.7-h, R-20.7-i)
 *
 * Returns `{ ok: true }` when no sensitive fields are detected, or
 * `{ ok: false, sensitiveFields }` naming the offending fields; the server MUST
 * then use URL mode for those interactions instead. (R-20.7-i)
 */
export function assertFormModeMayCollect(requestedSchema: unknown): SensitiveFieldCheck {
  const sensitiveFields = findSensitiveFormFields(requestedSchema);
  return sensitiveFields.length === 0 ? { ok: true } : { ok: false, sensitiveFields };
}

// ─── Safe URL construction & handling (§20.7) ──────────────────────────────────

/** One reason an elicitation URL is unsafe, per the §20.7 server construction rules. */
export type UnsafeUrlReason =
  /** Not a valid absolute URL. */
  | { reason: 'invalid-url' }
  /** Carries apparent end-user PII / credentials in the URL. (R-20.7-p) */
  | { reason: 'contains-sensitive-info'; detail: string }
  /** Appears pre-authenticated to a protected resource. (R-20.7-q) */
  | { reason: 'pre-authenticated'; detail: string }
  /** Uses a non-HTTPS scheme outside development. (R-20.7-s) */
  | { reason: 'insecure-scheme'; detail: string };

/** Outcome of {@link checkElicitationUrlSafety}. */
export type ElicitationUrlSafety =
  | { safe: true }
  | { safe: false; reasons: UnsafeUrlReason[] };

/** Query/credential markers that suggest sensitive info or pre-authentication in a URL. */
const URL_SENSITIVE_PARAM_MARKERS = [
  'password',
  'secret',
  'token',
  'access_token',
  'api_key',
  'apikey',
  'auth',
  'authorization',
  'session',
  'sessionid',
  'credential',
  'ssn',
  'card',
];

/**
 * Checks a server-constructed elicitation URL against the §20.7 safe-construction
 * rules: it MUST NOT carry sensitive end-user info, MUST NOT be pre-authenticated
 * to a protected resource, and SHOULD use HTTPS outside development.
 * (§20.7, R-20.7-p, R-20.7-q, R-20.7-s)
 *
 * Heuristics flag credential/PII-looking query parameters and embedded userinfo
 * (`user:pass@host`), and (outside `allowInsecure`) any non-`https:` scheme. This
 * is a guard to catch obvious mistakes, not a guarantee of safety.
 *
 * @param url     - The elicitation URL the server intends to send.
 * @param options - `allowInsecure: true` permits non-HTTPS (development only).
 */
export function checkElicitationUrlSafety(
  url: unknown,
  options: { allowInsecure?: boolean } = {},
): ElicitationUrlSafety {
  if (typeof url !== 'string' || url.length === 0) {
    return { safe: false, reasons: [{ reason: 'invalid-url' }] };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reasons: [{ reason: 'invalid-url' }] };
  }

  const reasons: UnsafeUrlReason[] = [];

  // Embedded credentials (`user:pass@host`) ⇒ pre-authenticated / sensitive.
  if (parsed.username !== '' || parsed.password !== '') {
    reasons.push({
      reason: 'pre-authenticated',
      detail: 'URL embeds userinfo credentials (user:pass@host) (R-20.7-q)',
    });
  }

  // Credential/PII-looking query parameters.
  const flaggedParams: string[] = [];
  for (const [key] of parsed.searchParams) {
    if (URL_SENSITIVE_PARAM_MARKERS.some((m) => key.toLowerCase().includes(m))) {
      flaggedParams.push(key);
    }
  }
  if (flaggedParams.length > 0) {
    reasons.push({
      reason: 'contains-sensitive-info',
      detail: `query parameters look sensitive: ${flaggedParams.join(', ')} (R-20.7-p, R-20.7-q)`,
    });
  }

  // HTTPS outside development.
  if (!options.allowInsecure && parsed.protocol !== 'https:') {
    reasons.push({
      reason: 'insecure-scheme',
      detail: `scheme "${parsed.protocol}" is not https (R-20.7-s)`,
    });
  }

  return reasons.length === 0 ? { safe: true } : { safe: false, reasons };
}

/** What a client must surface to the user before consenting to open a URL. (§20.7) */
export interface UrlConsentPresentation {
  /** The full URL shown verbatim for examination. (R-20.7-v) */
  fullUrl: string;
  /** The host to highlight (mitigates subdomain spoofing). (R-20.7-v, R-20.7-x) */
  host: string;
  /** The registrable-ish domain portion highlighted to the user. (R-20.7-x) */
  domain: string;
  /** The URL scheme. */
  scheme: string;
  /** `true` when the host contains Punycode (`xn--`) — warn the user. (R-20.7-x) */
  containsPunycode: boolean;
  /** Warnings to display about ambiguous/suspicious aspects of the URL. (R-20.7-x) */
  warnings: string[];
}

/**
 * Builds the consent-presentation data a client MUST show before opening a
 * URL-mode elicitation URL: the full URL and a clearly-highlighted target host,
 * plus warnings about Punycode / ambiguous URIs. (§20.7, R-20.7-v, R-20.7-x)
 *
 * This produces the data a UI binds to; it does NOT open the URL or prefetch it
 * (a client MUST NOT prefetch — R-20.7-t — and MUST NOT open without consent —
 * R-20.7-u). The host is exposed separately so the UI can highlight it to defend
 * against subdomain spoofing, and a Punycode host raises a warning.
 *
 * @throws {TypeError} When `url` is not a valid absolute URL.
 */
export function buildUrlConsentPresentation(url: string): UrlConsentPresentation {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(`Cannot present an invalid elicitation URL for consent: ${JSON.stringify(url)}`);
  }
  const host = parsed.hostname;
  const labels = host.split('.');
  const domain = labels.length >= 2 ? labels.slice(-2).join('.') : host;
  const containsPunycode = host.toLowerCase().split('.').some((label) => label.startsWith('xn--'));

  const warnings: string[] = [];
  if (containsPunycode) {
    warnings.push('Host contains Punycode (xn--); the displayed name may differ from the real domain.');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    warnings.push('URL embeds credentials in its userinfo; treat with suspicion.');
  }
  if (parsed.protocol !== 'https:') {
    warnings.push(`URL uses a non-HTTPS scheme (${parsed.protocol}).`);
  }

  return {
    fullUrl: parsed.href,
    host,
    domain,
    scheme: parsed.protocol.replace(/:$/, ''),
    containsPunycode,
    warnings,
  };
}

/**
 * Returns `true` when a URL MAY be rendered as a clickable link for the given
 * field, enforcing the §20.7 rule that ONLY the `url` field of a URL-mode request
 * is clickable; no other field of any elicitation request may be. (§20.7,
 * R-20.7-r, R-20.7-y)
 *
 * @param fieldName - The field the URL would be rendered in.
 * @param mode      - The mode of the elicitation request.
 */
export function mayRenderUrlClickable(fieldName: string, mode: ElicitationMode): boolean {
  return mode === ELICITATION_MODE.URL && fieldName === 'url';
}

// ─── Server-side identity binding & verification (§20.7) ───────────────────────

/** Outcome of {@link verifyElicitationUserBinding}. */
export type ElicitationUserBindingResult =
  | { ok: true }
  /** The two sessions resolve to different subjects ⇒ reject. (R-20.7-m) */
  | { ok: false; reason: 'subject-mismatch'; expected: string; actual: string }
  /** A subject was missing or client-provided-only ⇒ cannot verify. (R-20.7-j, R-20.7-k) */
  | { ok: false; reason: 'unverified-identity'; detail: string };

/**
 * Verifies, for a URL-mode elicitation, that the user who opened the URL is the
 * same user who started the elicitation — the §20.7 cross-user anti-phishing
 * check. (§20.7, R-20.7-j – R-20.7-o)
 *
 * The server MUST compare server-side-verified subjects (e.g. the authoritative
 * `sub` of the MCP session vs the `sub` of the browser session that opened the
 * URL), NOT any identity carried in the URL (R-20.7-n, R-20.7-o); both inputs
 * here are expected to be authoritative subjects the caller resolved through its
 * authorization server. A missing/empty subject yields `unverified-identity`
 * (R-20.7-k); differing subjects yield `subject-mismatch` (R-20.7-m).
 *
 * @param mcpSessionSubject     - Authoritative `sub` of the MCP session that
 *   started the elicitation.
 * @param browserSessionSubject - Authoritative `sub` of the browser session that
 *   opened the elicitation URL.
 */
export function verifyElicitationUserBinding(
  mcpSessionSubject: string | undefined,
  browserSessionSubject: string | undefined,
): ElicitationUserBindingResult {
  if (!mcpSessionSubject) {
    return {
      ok: false,
      reason: 'unverified-identity',
      detail: 'missing server-verified MCP-session subject (R-20.7-j, R-20.7-k)',
    };
  }
  if (!browserSessionSubject) {
    return {
      ok: false,
      reason: 'unverified-identity',
      detail: 'missing server-verified browser-session subject (R-20.7-l)',
    };
  }
  if (mcpSessionSubject !== browserSessionSubject) {
    return {
      ok: false,
      reason: 'subject-mismatch',
      expected: mcpSessionSubject,
      actual: browserSessionSubject,
    };
  }
  return { ok: true };
}
