/**
 * S17 — Multi-Round-Trip Requests (§11).
 *
 * Defines the single protocol-wide mechanism by which a server solicits
 * additional input from a client while processing a client request:
 *
 *   1. Server replies with an `"input_required"` result carrying `inputRequests`
 *      (what it needs) and an opaque `requestState` token (continuation handle).
 *   2. Client fulfills each input request locally and retries the SAME method
 *      with the same original arguments PLUS `inputResponses` and the verbatim
 *      `requestState`. The retry is a new JSON-RPC request (new `id`).
 *   3. Steps repeat until a `"complete"` result or an error.
 *
 * The server MUST NOT open an independent JSON-RPC request to obtain input;
 * all solicitation is expressed on the response channel. (R-11.1-a, R-11.1-b)
 *
 * Participating methods: `tools/call`, `prompts/get`, `resources/read`. (§11.6)
 *
 * Input-request kinds (discriminated by `method`):
 *   `"elicitation/create"`   → defined in §20 (S30/S31)
 *   `"roots/list"`           → defined in §21 (S32, deprecated)
 *   `"sampling/createMessage"` → defined in §21 (S33, deprecated)
 *
 * The `params` shapes for each kind and the full `InputResponse` counterparts
 * are forward-declared here as passthrough schemas pending those stories.
 */

import { z } from 'zod';
import { RESULT_TYPE } from '../jsonrpc/payload.js';
import { MISSING_CLIENT_CAPABILITY_CODE, INVALID_PARAMS_CODE } from './meta.js';

export { RESULT_TYPE } from '../jsonrpc/payload.js';

/** Returns `true` when `value` is a non-null, non-array object (a JSON object). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── Recognized input-request kinds ──────────────────────────────────────────

/** The three recognized `InputRequest.method` values. (§11.2, R-11.2-k) */
export const RECOGNIZED_INPUT_REQUEST_METHODS = new Set([
  'elicitation/create',
  'roots/list',
  'sampling/createMessage',
] as const);

export type RecognizedInputRequestMethod =
  (typeof RECOGNIZED_INPUT_REQUEST_METHODS extends Set<infer T> ? T : never);

/** Returns `true` when `method` is one of the three recognized input-request kinds. */
export function isRecognizedInputRequestMethod(method: string): method is RecognizedInputRequestMethod {
  return RECOGNIZED_INPUT_REQUEST_METHODS.has(method as never);
}

// ─── InputRequest (discriminated union) ──────────────────────────────────────

/**
 * An `"elicitation/create"` input request. (§11.2, §20 / S30-S31)
 * The full `params` shape (`ElicitRequestParams`) is defined in S30/S31;
 * here it is accepted as any JSON object.
 */
export const ElicitationInputRequestSchema = z
  .object({
    method: z.literal('elicitation/create'),
    params: z.record(z.unknown()),
  })
  .passthrough();

export type ElicitationInputRequest = z.infer<typeof ElicitationInputRequestSchema>;

/**
 * A `"roots/list"` input request. (§11.2, §21 / S32, Deprecated)
 * `params` is optional (may carry only `{ _meta: object }`).
 */
export const RootsListInputRequestSchema = z
  .object({
    method: z.literal('roots/list'),
    params: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type RootsListInputRequest = z.infer<typeof RootsListInputRequestSchema>;

/**
 * A `"sampling/createMessage"` input request. (§11.2, §21 / S33, Deprecated)
 * The full `params` shape (`CreateMessageRequestParams`) is defined in S33.
 */
export const SamplingInputRequestSchema = z
  .object({
    method: z.literal('sampling/createMessage'),
    params: z.record(z.unknown()),
  })
  .passthrough();

export type SamplingInputRequest = z.infer<typeof SamplingInputRequestSchema>;

/**
 * A single input request: a discriminated union over `method`. (§11.2)
 *
 * A client MUST treat an `InputRequest` whose `method` is none of the three
 * recognized values as an unrecognized kind and treat the enclosing
 * `InputRequiredResult` as an error. (R-11.2-k, R-11.2-l)
 */
export const InputRequestSchema = z.discriminatedUnion('method', [
  ElicitationInputRequestSchema,
  RootsListInputRequestSchema,
  SamplingInputRequestSchema,
]);

export type InputRequest = z.infer<typeof InputRequestSchema>;

// ─── InputRequiredResult ──────────────────────────────────────────────────────

/**
 * The result the server sends when it needs client input before it can
 * finish processing a request. (§11.2)
 *
 * `resultType` is REQUIRED and MUST equal `"input_required"`. (R-11.2-a)
 *
 * At least one of `inputRequests` or `requestState` MUST be present.
 * A result lacking both is malformed. (R-11.2-b, R-11.2-c)
 *
 * `inputRequests` maps server-chosen non-empty string keys to individual
 * `InputRequest` objects. Keys MUST be unique. (R-11.2-d, R-11.2-e)
 *
 * `requestState` is an opaque continuation token. When present, the client
 * MUST echo it verbatim on the retry. (R-11.3-c)
 */
export const InputRequiredResultSchema = z
  .object({
    /** REQUIRED discriminator; MUST equal `"input_required"`. (R-11.2-a) */
    resultType: z.literal(RESULT_TYPE.INPUT_REQUIRED),
    /** OPTIONAL. Non-empty map of things the server needs the client to fulfill. */
    inputRequests: z.record(InputRequestSchema).optional(),
    /** OPTIONAL. Opaque continuation token; MUST be echoed verbatim on retry. (R-11.3-c) */
    requestState: z.string().optional(),
    /** OPTIONAL. Result metadata. */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    if (val.inputRequests === undefined && val.requestState === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'At least one of `inputRequests` or `requestState` MUST be present (R-11.2-b)',
      });
    }
  });

export type InputRequiredResult = z.infer<typeof InputRequiredResultSchema>;

/** Returns `true` when `result` is a well-formed `InputRequiredResult`. */
export function isInputRequiredResult(result: unknown): result is InputRequiredResult {
  return InputRequiredResultSchema.safeParse(result).success;
}

/**
 * Builds an `InputRequiredResult` a server returns to solicit client input (§11.2).
 * At least one of `inputRequests`/`requestState` MUST be present (R-11.2-b) — pass
 * both for the normal solicitation case; `requestState` alone is a load-shedding
 * signal (§11.5).
 */
export function buildInputRequiredResult(
  inputRequests?: Record<string, InputRequest>,
  requestState?: string,
): InputRequiredResult {
  return {
    resultType: RESULT_TYPE.INPUT_REQUIRED,
    ...(inputRequests ? { inputRequests } : {}),
    ...(requestState !== undefined ? { requestState } : {}),
  } as InputRequiredResult;
}

// ─── Load-shedding detection ─────────────────────────────────────────────────

/**
 * Returns `true` when `result` is a load-shedding signal: `resultType` is
 * `"input_required"`, `inputRequests` is absent or empty, and `requestState`
 * is present. (§11.5, R-11.5-l)
 *
 * A client MUST NOT treat this as an error; it MAY retry immediately echoing
 * `requestState`, applying backoff on repeated non-progress. (R-11.5-m – R-11.5-p)
 */
export function isLoadSheddingResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;
  if (r['resultType'] !== RESULT_TYPE.INPUT_REQUIRED) return false;
  const inputRequests = r['inputRequests'];
  const hasInputRequests =
    inputRequests !== undefined &&
    inputRequests !== null &&
    typeof inputRequests === 'object' &&
    !Array.isArray(inputRequests) &&
    Object.keys(inputRequests as object).length > 0;
  return !hasInputRequests && typeof r['requestState'] === 'string';
}

// ─── InputResponseRequestParams ───────────────────────────────────────────────

/**
 * The extra params any client-initiated retry request MAY carry to fulfill an
 * `InputRequiredResult`. (§11.4, R-11.4-a, R-11.4-b)
 *
 * `_meta` (REQUIRED on request params, from S04 / RequestParamsSchema).
 * `inputResponses` (OPTIONAL): responses keyed identically to `inputRequests`.
 * `requestState` (OPTIONAL): the opaque continuation token echoed verbatim.
 *
 * The client MUST NOT attach `inputResponses`/`requestState` from one exchange
 * to any other request (R-11.4-i).
 */
export const InputResponseRequestParamsSchema = z
  .object({
    /** REQUIRED per-request metadata (§4 / S05). */
    _meta: z.record(z.unknown()),
    /** OPTIONAL. Client's responses keyed by the server's `inputRequests` keys. */
    inputResponses: z.record(z.unknown()).optional(),
    /** OPTIONAL. Opaque `requestState` echoed verbatim from the `InputRequiredResult`. */
    requestState: z.string().optional(),
  })
  .passthrough();

export type InputResponseRequestParams = z.infer<typeof InputResponseRequestParamsSchema>;

// ─── Result-type discrimination ───────────────────────────────────────────────

/**
 * Outcome of `discriminateResultType` — what a client should do after receiving
 * a result. (§11.5, R-11.5-c, R-11.5-d, R-11.5-e, R-11.5-f, R-11.6-c)
 */
export type ResultDiscrimination =
  | { action: 'complete' }
  | { action: 'input_required'; result: InputRequiredResult }
  | { action: 'error'; reason: string; resultType: string | undefined };

/**
 * Branches on the `resultType` of a received result per the normative
 * client-side rules of §11.5.
 *
 * - `"complete"` or absent `resultType` → `{ action: "complete" }`. (R-11.5-c, R-11.5-f)
 * - `"input_required"` with a valid `InputRequiredResult` → `{ action: "input_required", result }`.
 * - Any unrecognized `resultType` → `{ action: "error" }`. (R-11.5-d, R-11.5-e)
 * - Malformed `InputRequiredResult` → `{ action: "error" }`.
 */
export function discriminateResultType(
  result: unknown,
  clientCapabilities?: Record<string, unknown>,
): ResultDiscrimination {
  if (!result || typeof result !== 'object') {
    return { action: 'error', reason: 'result is not an object', resultType: undefined };
  }
  const r = result as Record<string, unknown>;
  const raw = r['resultType'];

  // Absent resultType → treat as "complete" (R-11.5-f)
  if (raw === undefined || raw === null) {
    return { action: 'complete' };
  }

  if (typeof raw !== 'string') {
    return { action: 'error', reason: '`resultType` must be a string', resultType: undefined };
  }

  if (raw === RESULT_TYPE.COMPLETE) {
    return { action: 'complete' };
  }

  if (raw === RESULT_TYPE.INPUT_REQUIRED) {
    const parsed = InputRequiredResultSchema.safeParse(result);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => i.message).join('; ');
      return {
        action: 'error',
        reason: `Malformed InputRequiredResult: ${detail}`,
        resultType: RESULT_TYPE.INPUT_REQUIRED,
      };
    }
    // R-11.5-a / R-11.5-k: a client MUST verify each input-request kind against
    // its own declared capabilities and MUST treat an undeclared kind as an error
    // rather than fulfilling it. When the caller supplies its declared
    // capabilities, gate every requested kind against them.
    if (clientCapabilities !== undefined) {
      for (const [key, request] of Object.entries(parsed.data.inputRequests ?? {})) {
        if (!clientSupportsInputRequestKind(request.method, clientCapabilities)) {
          return {
            action: 'error',
            reason: `Undeclared input-request kind "${request.method}" under key "${key}"; the client did not declare support for it (R-11.5-k)`,
            resultType: RESULT_TYPE.INPUT_REQUIRED,
          };
        }
      }
    }
    return { action: 'input_required', result: parsed.data };
  }

  // Unrecognized resultType — MUST treat as error; MUST NOT read other members. (R-11.5-d, R-11.5-e)
  return {
    action: 'error',
    reason: `Unrecognized resultType "${raw}"; MUST NOT read other result members`,
    resultType: raw,
  };
}

// ─── Capability-gating error builder ─────────────────────────────────────────

/**
 * Builds the JSON-RPC error payload for a missing-required-client-capability
 * rejection when a server cannot complete without an unsupported input-request
 * kind. (R-11.5-i, R-11.5-j)
 *
 * The `code` is `-32003`; on the HTTP transport the response status MUST be
 * `400 Bad Request`.
 *
 * @param requiredCapabilities - A `ClientCapabilities`-shaped map (capability
 *   name → settings object) naming the unsupported capabilities.
 */
export function buildMissingCapabilityForMrtrError(
  requiredCapabilities: Record<string, unknown>,
): {
  code: typeof MISSING_CLIENT_CAPABILITY_CODE;
  message: string;
  data: { requiredCapabilities: Record<string, unknown> };
} {
  return {
    code: MISSING_CLIENT_CAPABILITY_CODE,
    message: 'Missing required client capability for multi-round-trip request',
    data: { requiredCapabilities },
  };
}

// ─── inputResponses key validation ───────────────────────────────────────────

/**
 * Validates that every key in `inputResponses` was present in `inputRequests`.
 * Returns `false` (and fills `unknownKeys`) when any key in `inputResponses`
 * is not in `inputRequests`.
 *
 * (R-11.2-h, R-11.4-c, R-11.4-d)
 *
 * @param inputRequests  - Keys from the server's `InputRequiredResult`.
 * @param inputResponses - Keys from the client's retry params.
 */
export function validateInputResponseKeys(
  inputRequests: Record<string, unknown>,
  inputResponses: Record<string, unknown>,
): { valid: boolean; unknownKeys: string[] } {
  const allowedKeys = new Set(Object.keys(inputRequests));
  const unknownKeys = Object.keys(inputResponses).filter((k) => !allowedKeys.has(k));
  return { valid: unknownKeys.length === 0, unknownKeys };
}

// ─── Forward-declared InputResponse schemas ───────────────────────────────────

/**
 * `ElicitResult` — client response to an `"elicitation/create"` input request.
 * Full shape is defined in §20 (S30/S31); the S17-owned constraint is the
 * `action` discriminator. (R-11.4-e)
 */
export const ElicitResultSchema = z
  .object({
    action: z.enum(['accept', 'decline', 'cancel']),
    content: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type ElicitResult = z.infer<typeof ElicitResultSchema>;

/**
 * `ListRootsResult` — client response to a `"roots/list"` input request.
 * Full shape is defined in §21 (S32, deprecated); the S17-owned constraint
 * is the `roots` array. (R-11.4-e)
 */
export const ListRootsResultSchema = z
  .object({
    roots: z.array(
      z
        .object({
          uri: z.string(),
          name: z.string().optional(),
          _meta: z.record(z.unknown()).optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type ListRootsResult = z.infer<typeof ListRootsResultSchema>;

/**
 * `CreateMessageResult` — client response to a `"sampling/createMessage"` input
 * request. Full shape is defined in §21 (S33, deprecated); the S17-owned
 * required fields are `role`, `content`, and `model`. (R-11.4-e)
 */
export const CreateMessageResultSchema = z
  .object({
    role: z.string(),
    content: z.unknown(),
    model: z.string(),
  })
  .passthrough();

export type CreateMessageResult = z.infer<typeof CreateMessageResultSchema>;

/**
 * Map from input-request `method` to the expected `InputResponse` schema for
 * that kind. Used by `validateInputResponseKinds` to enforce kind-correlation.
 * (R-11.4-e, R-11.4-f)
 */
export const INPUT_RESPONSE_SCHEMA_BY_METHOD: Readonly<Record<string, z.ZodType<unknown>>> = {
  'elicitation/create': ElicitResultSchema,
  'roots/list': ListRootsResultSchema,
  'sampling/createMessage': CreateMessageResultSchema,
};

/** One kind-correlation failure reported by `validateInputResponseKinds`. */
export interface InputResponseKindError {
  /** The `inputResponses` key whose value failed validation. */
  key: string;
  /** The `InputRequest.method` the server sent under this key. */
  expectedMethod: string;
  /** Human-readable Zod error detail. */
  detail: string;
}

/** Outcome of `validateInputResponseKinds`. */
export type InputResponseKindValidationResult =
  | { valid: true }
  | { valid: false; errors: InputResponseKindError[] };

/**
 * Validates that each value in `inputResponses` conforms to the expected
 * `InputResponse` shape for the `InputRequest` kind sent under the same key.
 *
 * Kind correlation table (R-11.4-e):
 *   `"elicitation/create"`     → `ElicitResult`        (`action` required)
 *   `"roots/list"`             → `ListRootsResult`     (`roots` array required)
 *   `"sampling/createMessage"` → `CreateMessageResult` (`role`, `content`, `model` required)
 *
 * A client MUST NOT answer with a mismatched kind. (R-11.4-f) Validation here
 * allows servers to reject such responses with a JSON-RPC error (R-11.5-s).
 *
 * @param inputRequests  - The server's `inputRequests` from the `InputRequiredResult`.
 * @param inputResponses - The client's `inputResponses` from the retry params.
 */
export function validateInputResponseKinds(
  inputRequests: Record<string, InputRequest>,
  inputResponses: Record<string, unknown>,
): InputResponseKindValidationResult {
  // Precondition hardening: a non-object `inputResponses` carries no checkable
  // kind-correlations, so there is nothing to reject here (any structural
  // malformity is caught by the schema / key-presence checks). Never throw.
  if (!isPlainObject(inputResponses)) {
    return { valid: true };
  }
  const requests: Record<string, InputRequest> = isPlainObject(inputRequests) ? inputRequests : {};

  const errors: InputResponseKindError[] = [];

  for (const [key, response] of Object.entries(inputResponses)) {
    const request = requests[key];
    if (!request) continue; // key mismatch — caught by validateInputResponseKeys

    const schema = INPUT_RESPONSE_SCHEMA_BY_METHOD[request.method];
    if (!schema) continue; // unrecognized method — caught by isRecognizedInputRequestMethod

    const parsed = schema.safeParse(response);
    if (!parsed.success) {
      errors.push({
        key,
        expectedMethod: request.method,
        detail: parsed.error.issues
          .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
          .join('; '),
      });
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ─── Malformed-result error builder ──────────────────────────────────────────

/**
 * Error code for a malformed or invalid-params error. Reused here per §22.
 */
export { INVALID_PARAMS_CODE };

/**
 * The JSON-RPC error payload for an `InputRequiredResult` that is missing both
 * `inputRequests` and `requestState`. (R-11.2-c)
 */
export const MALFORMED_INPUT_REQUIRED_RESULT_ERROR = {
  code: INVALID_PARAMS_CODE,
  message: 'Malformed InputRequiredResult: at least one of inputRequests or requestState must be present',
} as const;

/**
 * Builds the JSON-RPC error payload for a protocol-malformed retry request.
 * (R-11.5-s)
 *
 * A server MUST return a JSON-RPC error (not another `InputRequiredResult`)
 * when the retry's `inputResponses` is malformed at the protocol level —
 * for example, a response value that does not match the declared `InputResponse`
 * shape for its key.
 *
 * Error code is `-32602` (Invalid params, §22).
 */
export function buildMalformedRetryError(detail: string): {
  code: typeof INVALID_PARAMS_CODE;
  message: string;
} {
  return {
    code: INVALID_PARAMS_CODE,
    message: `Malformed retry params: ${detail}`,
  };
}

/**
 * Validates the server-side retry params and returns a JSON-RPC error payload
 * when `inputResponses` are malformed at the protocol level. (R-11.5-s)
 *
 * Returns `{ ok: true }` when all response shapes pass kind-correlation.
 * Returns `{ ok: false, error }` when any response is mismatched; the server
 * MUST return this error payload, not another `InputRequiredResult`.
 *
 * @param inputRequests  - The server's original `inputRequests` map.
 * @param inputResponses - The client's retry `inputResponses`.
 */
export function validateRetryParams(
  inputRequests: Record<string, InputRequest>,
  inputResponses: Record<string, unknown>,
): { ok: true } | { ok: false; error: ReturnType<typeof buildMalformedRetryError> } {
  const result = validateInputResponseKinds(inputRequests, inputResponses);
  if (!result.valid) {
    const detail = result.errors
      .map((e) => `key "${e.key}" (expected ${e.expectedMethod} response): ${e.detail}`)
      .join('; ');
    return { ok: false, error: buildMalformedRetryError(detail) };
  }
  return { ok: true };
}

// ─── Participating methods ────────────────────────────────────────────────────

/**
 * The three methods that MAY return `"input_required"` results. (§11.6, R-11.6-a)
 *
 * A client MUST be prepared to receive `"input_required"` from any of these.
 * (R-11.6-b)
 */
export const MRTR_PARTICIPATING_METHODS = new Set([
  'tools/call',
  'prompts/get',
  'resources/read',
] as const);

/** Returns `true` when `method` is one of the three MRTR-participating methods. */
export function isMrtrParticipatingMethod(method: string): boolean {
  return MRTR_PARTICIPATING_METHODS.has(method as never);
}

// ─── Capability gating for input-request kinds (§11.2, §11.5) ───────────────────

/** Maps each recognized input-request kind to the client capability it requires. (§11.2, §6) */
export const INPUT_REQUEST_KIND_CAPABILITY: Readonly<
  Record<RecognizedInputRequestMethod, string>
> = {
  'elicitation/create': 'elicitation',
  'roots/list': 'roots',
  'sampling/createMessage': 'sampling',
};

/**
 * Returns the client-capability name an input-request `method` requires, or
 * `undefined` for an unrecognized method. (§11.2, R-11.2-j)
 */
export function requiredClientCapabilityForInputRequest(method: string): string | undefined {
  return isRecognizedInputRequestMethod(method) ? INPUT_REQUEST_KIND_CAPABILITY[method] : undefined;
}

/** Presence-means-supported capability check (§6.1): the key is declared with any value. */
function capabilityDeclared(clientCapabilities: Record<string, unknown>, name: string): boolean {
  return isPlainObject(clientCapabilities) && clientCapabilities[name] !== undefined;
}

/**
 * Returns `true` when the client declared support for the capability an
 * input-request `method` requires. Used BOTH server-side — to decide whether the
 * server MAY emit a kind (R-11.2-j / R-11.5-g) — and client-side — to verify a
 * kind before fulfilling it (R-11.5-a). An unrecognized method is never supported.
 *
 * @param method            - The input-request method (e.g. `"elicitation/create"`).
 * @param clientCapabilities - The client's declared capabilities.
 */
export function clientSupportsInputRequestKind(
  method: string,
  clientCapabilities: Record<string, unknown>,
): boolean {
  const capability = requiredClientCapabilityForInputRequest(method);
  return capability !== undefined && capabilityDeclared(clientCapabilities, capability);
}

/**
 * Server-side gate: returns `true` when the server MAY emit an input-request of
 * `method` given the client's declared capabilities. A server MUST NOT emit a
 * kind the client has not declared — withhold it and return
 * {@link buildMissingCapabilityForMrtrError} instead. (§11.2 line 2406, §11.5
 * line 2511; R-11.2-j, R-11.5-g)
 */
export function mayEmitInputRequestKind(
  method: string,
  clientCapabilities: Record<string, unknown>,
): boolean {
  return clientSupportsInputRequestKind(method, clientCapabilities);
}

// ─── Duplicate-key detection for inputRequests (§11.2, R-11.2-e/f/g) ─────────────

/** The JSON-RPC error for an `InputRequiredResult` whose JSON repeats a member name. (R-11.2-f) */
export const DUPLICATE_INPUT_REQUESTS_KEY_ERROR = {
  code: INVALID_PARAMS_CODE,
  message: 'Malformed InputRequiredResult: duplicate member name in object (R-11.2-f)',
} as const;

/**
 * Scans raw JSON text for a duplicate object member name. `JSON.parse` silently
 * collapses duplicate keys (last-wins), so duplicate detection MUST work on the
 * raw token stream — this tokenizer tracks the member names seen within each
 * object scope and reports the first repeat. (§11.2, R-11.2-f)
 */
function jsonHasDuplicateKeys(text: string): boolean {
  let i = 0;
  const n = text.length;
  const stack: Array<{ object: boolean; keys: Set<string> }> = [];
  let expectKey = false;

  const readString = (): string => {
    i++; // consume opening quote
    let out = '';
    while (i < n) {
      const c = text[i++]!;
      if (c === '\\') {
        const esc = text[i++];
        if (esc === undefined) break;
        if (esc === 'u') {
          out += text.slice(i, i + 4);
          i += 4;
        } else {
          out += '\\' + esc;
        }
      } else if (c === '"') {
        break;
      } else {
        out += c;
      }
    }
    return out;
  };

  while (i < n) {
    const c = text[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
    } else if (c === '{') {
      stack.push({ object: true, keys: new Set() });
      expectKey = true;
      i++;
    } else if (c === '[') {
      stack.push({ object: false, keys: new Set() });
      expectKey = false;
      i++;
    } else if (c === '}' || c === ']') {
      stack.pop();
      expectKey = false;
      i++;
    } else if (c === ',') {
      expectKey = stack[stack.length - 1]?.object === true;
      i++;
    } else if (c === ':') {
      expectKey = false;
      i++;
    } else if (c === '"') {
      const top = stack[stack.length - 1];
      const str = readString();
      if (top?.object && expectKey) {
        if (top.keys.has(str)) return true;
        top.keys.add(str);
        expectKey = false;
      }
    } else {
      i++; // primitive token char; advance
    }
  }
  return false;
}

/** Outcome of {@link parseInputRequiredResult}. */
export type ParseInputRequiredResult =
  | { ok: true; result: InputRequiredResult }
  | { ok: false; error: { code: number; message: string } };

/**
 * Parses an `InputRequiredResult` from its raw JSON text, treating a duplicate
 * object member name as malformed — the §11.2 rule that a receiver encountering
 * duplicate `inputRequests` keys MUST treat the result as malformed (R-11.2-f),
 * which is stricter than the base §2.3.1 last-wins tolerance. Duplicate detection
 * runs on the raw text because `JSON.parse` would already have collapsed repeats.
 *
 * Use this instead of `JSON.parse` + {@link isInputRequiredResult} when the raw
 * wire text is available and duplicate-key strictness is required (TV-17.10).
 *
 * @param rawJson - The raw JSON text of the result object.
 */
export function parseInputRequiredResult(rawJson: string): ParseInputRequiredResult {
  if (jsonHasDuplicateKeys(rawJson)) {
    return { ok: false, error: { ...DUPLICATE_INPUT_REQUESTS_KEY_ERROR } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    return {
      ok: false,
      error: { code: INVALID_PARAMS_CODE, message: `Malformed InputRequiredResult: ${(e as Error).message}` },
    };
  }
  const result = InputRequiredResultSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: {
        code: INVALID_PARAMS_CODE,
        message: `Malformed InputRequiredResult: ${result.error.issues.map((iss) => iss.message).join('; ')}`,
      },
    };
  }
  return { ok: true, result: result.data };
}

// ─── Deprecated-kind preference (§11.2, R-11.2-i — SHOULD) ───────────────────────

/** The two input-request kinds that are Deprecated client-provided capabilities. (§11.2, §27.3) */
export const DEPRECATED_INPUT_REQUEST_METHODS = new Set([
  'roots/list',
  'sampling/createMessage',
] as const);

/**
 * Returns `true` when `method` is a Deprecated input-request kind. Servers SHOULD
 * prefer non-deprecated alternatives (e.g. `elicitation/create`) where available
 * rather than soliciting via these. (§11.2 line 2406, R-11.2-i)
 */
export function isDeprecatedInputRequestKind(method: string): boolean {
  return DEPRECATED_INPUT_REQUEST_METHODS.has(method as never);
}

// ─── Loop guard / backoff for the retry loop (§11.5, R-11.5-b/-n/-o — SHOULD) ────

/**
 * A bounded round counter a client can use to guard against an unbounded MRTR
 * loop — there is no protocol-imposed round limit, so implementations SHOULD cap
 * it. (§11.5 line 2507, R-11.5-b)
 */
export class MrtrRoundGuard {
  private _round = 0;
  constructor(readonly maxRounds = 16) {}

  /** The number of rounds recorded so far. */
  get round(): number {
    return this._round;
  }

  /** Records one round; `ok` is `false` once `maxRounds` is exceeded. */
  recordRound(): { ok: boolean; round: number } {
    this._round += 1;
    return { ok: this._round <= this.maxRounds, round: this._round };
  }
}

/**
 * Computes an exponential-backoff delay (ms) for the Nth retry on repeated
 * non-progress — a client retrying without progress SHOULD apply a reasonable
 * backoff (and SHOULD offer the user a way to cancel). (§11.5 line 2518, R-11.5-n)
 *
 * @param attempt - The 1-based retry attempt number (attempt ≤ 0 ⇒ 0 ms).
 * @param opts    - `baseMs` (default 250) and `maxMs` (default 30000) bounds.
 */
export function computeRetryBackoffMs(
  attempt: number,
  opts: { baseMs?: number; maxMs?: number } = {},
): number {
  const baseMs = opts.baseMs ?? 250;
  const maxMs = opts.maxMs ?? 30_000;
  if (attempt <= 0) return 0;
  return Math.min(maxMs, baseMs * 2 ** (attempt - 1));
}

// ─── Re-request still-missing input (§11.5, R-11.5-q — SHOULD) ───────────────────

/**
 * Returns the `inputRequests` keys that the retry's `inputResponses` did not
 * answer. (§11.5, R-11.5-q)
 */
export function computeMissingInputResponseKeys(
  inputRequests: Record<string, unknown>,
  inputResponses: Record<string, unknown>,
): string[] {
  if (!isPlainObject(inputRequests)) return [];
  const provided = isPlainObject(inputResponses) ? inputResponses : {};
  return Object.keys(inputRequests).filter((key) => provided[key] === undefined);
}

/**
 * Builds a NEW `InputRequiredResult` re-requesting only the still-missing input,
 * or `null` when the retry supplied everything. A server whose retry
 * `inputResponses` is well-formed but incomplete SHOULD re-request the missing
 * information rather than failing the request. (§11.5 line 2520, R-11.5-q)
 *
 * @param inputRequests  - The server's original `inputRequests` map.
 * @param inputResponses - The client's retry `inputResponses`.
 * @param requestState   - OPTIONAL continuation token to echo on the new result.
 */
export function buildReRequestInputRequiredResult(
  inputRequests: Record<string, InputRequest>,
  inputResponses: Record<string, unknown>,
  requestState?: string,
): InputRequiredResult | null {
  const missingKeys = computeMissingInputResponseKeys(inputRequests, inputResponses);
  if (missingKeys.length === 0) return null;
  const reRequested: Record<string, InputRequest> = {};
  for (const key of missingKeys) {
    const request = inputRequests[key];
    if (request) reRequested[key] = request;
  }
  return {
    resultType: RESULT_TYPE.INPUT_REQUIRED,
    inputRequests: reRequested,
    ...(requestState !== undefined ? { requestState } : {}),
  };
}
