/**
 * S39 — Tasks Extension I: Model, Capability, Types & Lifecycle (§25.1–§25.6).
 *
 * The foundational model of the Tasks extension (`io.modelcontextprotocol/tasks`):
 * an opt-in mechanism that turns long-running, server-handled operations into
 * durable, pollable **tasks** rather than blocking request/response exchanges.
 * A server that would otherwise hold a connection open until work completes may
 * instead return an opaque **task handle** immediately (a `CreateTaskResult`
 * whose `resultType` is `"task"`), and the client retrieves the eventual outcome
 * by polling. (§25.1)
 *
 * This module owns the model only:
 *   - the extension identifier and its exact, case-sensitive matching (§25.1);
 *   - the `TasksExtensionCapability` (empty) settings value and the per-request
 *     opt-in / server-advertisement negotiation and gating rules (§25.2);
 *   - task augmentation: `resultType: "task"` substitution and `CreateTaskResult`
 *     (§25.3);
 *   - the `Task` / `DetailedTask` object types and the `TaskStatus` enum (§25.4);
 *   - the five-state status lifecycle and its transition/immutability rules
 *     (§25.5);
 *   - the durability / statelessness guarantees and `ttlMs` expiry → not-found
 *     behavior (§25.6).
 *
 * Out of scope (owned elsewhere):
 *   - `tasks/get` / `tasks/update` / `tasks/cancel` request/result shapes,
 *     `inputResponses`, task notifications, and cleanup — S40 (§25.7–§25.x);
 *   - the extension identifier grammar, per-request active-set application, and
 *     graceful degradation — S38 (`extension-mechanism.ts`, §24);
 *   - `InputRequest` / `InputResponse` and the opaque `requestState`
 *     continuation token — S17 (`multi-round-trip.ts`, §11);
 *   - the open `resultType` discriminator and the base `Result` / `_meta` shapes
 *     — S04 (`jsonrpc/payload.ts`, §3);
 *   - the concrete `-32xxx` numeric error values — S34 (`errors.ts`, §22).
 *
 * REUSE (never redefined here):
 *   - `RESULT_TYPE`, `ResultSchema` — `../jsonrpc/payload.js` (S04);
 *   - `InputRequestSchema` / `InputRequest` — `./multi-round-trip.js` (S17);
 *   - `McpErrorSchema` — `../jsonrpc/payload.js` (S04 / §22 error object);
 *   - `extensionIdsMatch`, `activeSetForRequest`, `mayEmitExtensionSurface` —
 *     extension mechanism (S38); `isExtensionAdvertised` — `./extensions.js` (S11);
 *   - `MISSING_CLIENT_CAPABILITY_CODE`, `INVALID_PARAMS_CODE` — `./meta.js` (S05;
 *     `-32602` is the §22.4 not-found condition a Tasks query returns, per §25.7).
 */

import { z } from 'zod';
import { McpErrorSchema } from '../jsonrpc/payload.js';
import { InputRequestSchema, type InputRequest } from './multi-round-trip.js';
import { MISSING_CLIENT_CAPABILITY_CODE, INVALID_PARAMS_CODE } from './meta.js';
import {
  extensionIdsMatch,
  activeSetForRequest,
  mayEmitExtensionSurface,
} from './extension-mechanism.js';
import { isExtensionAdvertised } from './extensions.js';

// ─── §25.1 — Extension identifier ──────────────────────────────────────────────

/**
 * The exact, case-sensitive identifier of the Tasks extension. (§25.1, R-25.1-a)
 *
 * This is the key used in the extensions capability map. A conforming
 * implementation MUST treat it as an opaque, exact string and MUST NOT match it
 * case-insensitively or by prefix — use {@link isTasksExtensionId}, never an
 * ad-hoc comparison.
 */
export const TASKS_EXTENSION_ID = 'io.modelcontextprotocol/tasks' as const;

/**
 * Returns `true` only when `identifier` is byte-identical to
 * {@link TASKS_EXTENSION_ID}. (§25.1, R-25.1-a)
 *
 * Comparison is exact and case-sensitive: identifiers differing only in case
 * (`IO.MODELCONTEXTPROTOCOL/TASKS`) or by a prefix/suffix
 * (`io.modelcontextprotocol/tasks-foo`) are NON-matching. Delegates to the S38
 * octet-for-octet {@link extensionIdsMatch} so the no-case-folding rule is shared.
 */
export function isTasksExtensionId(identifier: string): boolean {
  return extensionIdsMatch(identifier, TASKS_EXTENSION_ID);
}

// ─── §25.3 — The "task" result discriminator ───────────────────────────────────

/**
 * The literal `resultType` discriminator value that marks a result as a task
 * handle: `"task"`. (§25.3, R-25.3-c)
 *
 * This is an extension-contributed `resultType` value (it is NOT one of the core
 * `RESULT_TYPE` values); it is only valid when the Tasks extension is active for
 * the interaction (§24.5 / S38). A client that has declared the capability MUST
 * dispatch on this value via {@link isTaskResultType} / {@link isCreateTaskResult}.
 */
export const TASK_RESULT_TYPE = 'task' as const;

/** Returns `true` when `resultType` is the `"task"` discriminator. (R-25.3-c) */
export function isTaskResultType(resultType: unknown): resultType is typeof TASK_RESULT_TYPE {
  return resultType === TASK_RESULT_TYPE;
}

// ─── §25.2 — Capability declaration & settings ─────────────────────────────────

/**
 * The settings value associated with {@link TASKS_EXTENSION_ID} in an extensions
 * capability map. (§25.2, R-25.2-a, R-25.2-b)
 *
 * This extension defines no settings, so the canonical value is the empty object
 * `{}`. Receivers MUST ignore unrecognized members of the settings object, so the
 * schema is a permissive record (`.passthrough()` equivalent for `z.record`):
 * unknown members are accepted and preserved, never rejected. (R-25.2-b)
 */
export const TasksExtensionCapabilitySchema = z.record(z.unknown());

/** The Tasks extension settings value: an object with no defined members. (§25.2) */
export type TasksExtensionCapability = z.infer<typeof TasksExtensionCapabilitySchema>;

/**
 * Returns `true` when `value` is a valid Tasks extension settings value — any
 * JSON object. (R-25.2-a, R-25.2-b)
 *
 * The canonical value is `{}`; a value carrying unrecognized members is still
 * valid (the receiver accepts the declaration and ignores those members,
 * R-25.2-b). A non-object value (array, scalar, `null`) is NOT a settings object.
 */
export function isTasksExtensionCapability(value: unknown): value is TasksExtensionCapability {
  return TasksExtensionCapabilitySchema.safeParse(value).success;
}

/**
 * Returns `true` when a request's declared client `extensions` map opts that
 * request in for task augmentation — i.e. it advertises {@link TASKS_EXTENSION_ID}.
 * (§25.2, R-25.2-c)
 *
 * Because the protocol is stateless and per-request, a request is eligible for
 * augmentation ONLY when this declaration is present in THAT request's
 * capabilities; a request lacking it is not eligible. (R-25.2-c)
 *
 * @param requestClientExtensions - The `extensions` map from this request's
 *   `io.modelcontextprotocol/clientCapabilities` (raw; `undefined` ⇒ none).
 */
export function clientDeclaresTasksForRequest(requestClientExtensions: unknown): boolean {
  return isExtensionAdvertised(requestClientExtensions, TASKS_EXTENSION_ID);
}

/**
 * Returns `true` when a server's advertised `extensions` map declares the Tasks
 * extension. (§25.2)
 *
 * @param serverExtensions - The server's advertised `extensions` map (raw).
 */
export function serverAdvertisesTasks(serverExtensions: unknown): boolean {
  return isExtensionAdvertised(serverExtensions, TASKS_EXTENSION_ID);
}

/**
 * Returns `true` when the Tasks extension is ACTIVE for a single request: the
 * request's client capabilities declare it AND the server advertises it. (§25.2,
 * R-25.2-c, R-25.2-d)
 *
 * This is the gate the server consults before it may return a task handle: when
 * `false`, the server MUST NOT substitute a `CreateTaskResult` for this request's
 * direct result (R-25.2-d). Computed per request under the stateless model —
 * nothing from a prior request is consulted (§24.4 / S38
 * {@link activeSetForRequest}).
 *
 * @param requestClientExtensions - This request's declared client `extensions` map.
 * @param serverExtensions        - The server's advertised `extensions` map.
 */
export function isTasksActiveForRequest(
  requestClientExtensions: unknown,
  serverExtensions: unknown,
): boolean {
  const active = activeSetForRequest(requestClientExtensions, serverExtensions);
  return mayEmitExtensionSurface(TASKS_EXTENSION_ID, active);
}

/**
 * Decides whether a server MAY return a task handle for a request, enforcing the
 * §25.2 gating rules. (R-25.2-d, R-25.2-g, R-25.3-a, R-25.3-b)
 *
 * Returns `true` only when the extension is active for THIS request
 * ({@link isTasksActiveForRequest}). When `true`, the substitution is entirely
 * server-directed: the server MAY (but need not) turn any individual eligible
 * request into a task, with no per-call flag or warmup beyond the per-request
 * capability (R-25.2-g, R-25.3-a, R-25.3-b). When `false`, the server MUST NOT
 * return a result with `resultType` equal to `"task"` (R-25.2-d).
 *
 * @param requestClientExtensions - This request's declared client `extensions` map.
 * @param serverExtensions        - The server's advertised `extensions` map.
 */
export function mayReturnTaskHandle(
  requestClientExtensions: unknown,
  serverExtensions: unknown,
): boolean {
  return isTasksActiveForRequest(requestClientExtensions, serverExtensions);
}

// ─── §25.5 — TaskStatus ─────────────────────────────────────────────────────────

/**
 * The five case-sensitive lifecycle states a task may be in. (§25.5, R-25.5-a)
 *
 *   - `working`        — operation in progress (non-terminal);
 *   - `input_required` — server requires client input before continuing
 *                        (non-terminal; outstanding requests in `inputRequests`);
 *   - `completed`      — finished successfully (terminal; result inline);
 *   - `failed`         — a JSON-RPC error occurred (terminal; error inline);
 *   - `cancelled`      — ended via cancellation (terminal).
 */
export const TASK_STATUSES = [
  'working',
  'input_required',
  'completed',
  'failed',
  'cancelled',
] as const;

/** Schema for the {@link TaskStatus} enum — exactly one of the five values. (R-25.5-a) */
export const TaskStatusSchema = z.enum(TASK_STATUSES);

/** One of the five case-sensitive task lifecycle states. (§25.5, R-25.5-a) */
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/** Returns `true` when `value` is exactly one of the five `TaskStatus` values. (R-25.5-a) */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return TaskStatusSchema.safeParse(value).success;
}

/**
 * The three terminal task states. (§25.5)
 *
 * Once a task reaches one of these its `status` and inline `result`/`error` are
 * immutable; it MUST NOT subsequently transition to any other state (R-25.5-b).
 */
export const TERMINAL_TASK_STATUSES = new Set<TaskStatus>([
  'completed',
  'failed',
  'cancelled',
]);

/** The two non-terminal task states, in which a task may still transition. (§25.5) */
export const NON_TERMINAL_TASK_STATUSES = new Set<TaskStatus>(['working', 'input_required']);

/**
 * Returns `true` when `status` is a terminal state (`completed` / `failed` /
 * `cancelled`). (§25.5, R-25.5-b)
 */
export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.has(status);
}

// ─── §25.5 — Legal status transitions ──────────────────────────────────────────

/**
 * Returns `true` when a task MAY transition from `from` to `to`, per the §25.5
 * lifecycle rules. (R-25.5-b, R-25.5-c)
 *
 *   - From a terminal state: no transition is ever legal — the state is immutable
 *     (R-25.5-b). (A "transition" to the SAME terminal state is likewise not a
 *     transition and is rejected; observing the same state is not a change.)
 *   - From `working`: MAY go to `input_required`, `completed`, `failed`, or
 *     `cancelled` (R-25.5-c).
 *   - From `input_required`: MAY go back to `working`, or to any terminal state
 *     (R-25.5-c).
 *
 * A self-transition between identical NON-terminal states (`working → working`,
 * `input_required → input_required`) is not a state change and returns `false`.
 *
 * @param from - The task's current status.
 * @param to   - The proposed next status.
 */
export function isLegalTaskTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (isTerminalTaskStatus(from)) return false; // terminal states are immutable (R-25.5-b)
  if (from === to) return false; // not a transition
  switch (from) {
    case 'working':
      // → input_required | completed | failed | cancelled (R-25.5-c)
      return to === 'input_required' || isTerminalTaskStatus(to);
    case 'input_required':
      // → working | any terminal state (R-25.5-c)
      return to === 'working' || isTerminalTaskStatus(to);
    default:
      return false;
  }
}

/**
 * Asserts that a proposed status transition is legal, throwing when it is not.
 * (R-25.5-b, R-25.5-c)
 *
 * Useful for server-side state machines that mutate a stored task: it refuses
 * any transition out of a terminal state (the immutability guarantee) and any
 * illegal non-terminal move.
 *
 * @throws {RangeError} when `from → to` is not a legal transition.
 */
export function assertLegalTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!isLegalTaskTransition(from, to)) {
    if (isTerminalTaskStatus(from)) {
      throw new RangeError(
        `Task in terminal state "${from}" is immutable and MUST NOT transition to "${to}" (R-25.5-b)`,
      );
    }
    throw new RangeError(`Illegal task transition "${from}" → "${to}" (R-25.5-c)`);
  }
}

// ─── §25.4 — Task ───────────────────────────────────────────────────────────────

/**
 * Schema for `ttlMs`: a non-negative number, or `null` (unbounded). (§25.4,
 * R-25.4-b) After a non-null value elapses, a server MAY discard the task.
 */
export const TaskTtlMsSchema = z.union([z.number().nonnegative(), z.null()]);

/**
 * The handle and status record for a long-running operation. (§25.4)
 *
 * REQUIRED fields (R-25.4-b): `taskId`, `status`, `createdAt`, `lastUpdatedAt`,
 * `ttlMs`. OPTIONAL: `statusMessage`, `pollIntervalMs`.
 *
 *   `taskId`         — opaque, server-minted identifier; the client MUST treat it
 *                      as opaque and MUST NOT parse or derive meaning from it
 *                      (R-25.4-a).
 *   `status`         — current lifecycle state ({@link TaskStatus}).
 *   `statusMessage`  — OPTIONAL human-readable description; display only, no
 *                      protocol semantics.
 *   `createdAt`      — RFC 3339 date-time string at which the task was created.
 *   `lastUpdatedAt`  — RFC 3339 date-time string of the last state modification.
 *   `ttlMs`          — lifetime in ms from creation; `null` ⇒ unbounded
 *                      ({@link TaskTtlMsSchema}, R-25.4-c).
 *   `pollIntervalMs` — OPTIONAL recommended MINIMUM ms between successive
 *                      `tasks/get` polls; clients SHOULD NOT poll faster
 *                      (R-25.4-d, R-25.4-e).
 *
 * `.passthrough()` preserves additional members (e.g. an active extension's
 * fields) through parse.
 */
export const TaskSchema = z
  .object({
    /** REQUIRED. Opaque, server-minted identifier; opaque to the client. (R-25.4-a, R-25.4-b) */
    taskId: z.string(),
    /** REQUIRED. Current lifecycle state. (R-25.4-b, R-25.5-a) */
    status: TaskStatusSchema,
    /** OPTIONAL. Human-readable state/progress description; display only. */
    statusMessage: z.string().optional(),
    /** REQUIRED. RFC 3339 date-time the task was created. (R-25.4-b) */
    createdAt: z.string(),
    /** REQUIRED. RFC 3339 date-time of the last state modification. (R-25.4-b) */
    lastUpdatedAt: z.string(),
    /** REQUIRED. Lifetime in ms from creation, or `null` (unbounded). (R-25.4-b, R-25.4-c) */
    ttlMs: TaskTtlMsSchema,
    /** OPTIONAL. Recommended minimum ms between successive polls. (R-25.4-d, R-25.4-e) */
    pollIntervalMs: z.number().nonnegative().optional(),
  })
  .passthrough();

export type Task = z.infer<typeof TaskSchema>;

/** Returns `true` when `value` is a well-formed {@link Task}. */
export function isTask(value: unknown): value is Task {
  return TaskSchema.safeParse(value).success;
}

// ─── §25.3 — CreateTaskResult (the task handle) ─────────────────────────────────

/**
 * A `Result` whose `resultType` is `"task"`: the wire form of a task handle.
 * (§25.3, R-25.3-c)
 *
 * It carries all {@link Task} fields directly, plus the result-level
 * `resultType: "task"` discriminator and the OPTIONAL `_meta` permitted on any
 * `Result`. This is what a server returns in place of a request's direct result
 * when it turns an eligible request into a task. (§25.3)
 *
 * `.passthrough()` preserves any extra `Result`/`Task` members.
 */
export const CreateTaskResultSchema = TaskSchema.extend({
  /** REQUIRED. The `"task"` discriminator marking this `Result` as a task handle. (R-25.3-c) */
  resultType: z.literal(TASK_RESULT_TYPE),
  /** OPTIONAL. The `_meta` permitted on any `Result` (§3 / S04). */
  _meta: z.record(z.unknown()).optional(),
}).passthrough();

export type CreateTaskResult = z.infer<typeof CreateTaskResultSchema>;

/**
 * Returns `true` when `value` is a well-formed {@link CreateTaskResult}: a
 * `Result` with `resultType: "task"` carrying all `Task` fields. (§25.3,
 * R-25.3-c, AC-39.8)
 *
 * A client that has declared the capability uses this to dispatch on the `"task"`
 * case after inspecting `resultType` on an eligible response. (R-25.3-c)
 */
export function isCreateTaskResult(value: unknown): value is CreateTaskResult {
  return CreateTaskResultSchema.safeParse(value).success;
}

/**
 * What a client should do with a result received for an eligible (task-capable)
 * request. (§25.3, R-25.2-e, R-25.3-c)
 *
 *   - `"task"`     — the payload is a {@link CreateTaskResult} task handle;
 *   - `"ordinary"` — the payload is the request's ordinary result shape.
 */
export type EligibleResultDisposition =
  | { kind: 'task'; result: CreateTaskResult }
  | { kind: 'ordinary'; result: unknown };

/**
 * Dispatches a result received for an eligible request on its `resultType`.
 * (R-25.2-e, R-25.3-c, AC-39.5)
 *
 * A client that declared the Tasks capability MUST be prepared for EITHER the
 * request's ordinary result OR a task handle in its place; this helper realizes
 * that obligation. When `resultType` is `"task"` and the payload is a well-formed
 * `CreateTaskResult`, the client treats it as a task handle; otherwise the result
 * is the request's ordinary result and is returned verbatim for the caller's own
 * `resultType` interpretation (§3 / S04).
 *
 * Note: a payload whose `resultType` is `"task"` but which is NOT a well-formed
 * `CreateTaskResult` is returned as `ordinary` here; structural validation /
 * error handling of a malformed task handle is the caller's concern (it can
 * re-check with {@link isCreateTaskResult}).
 *
 * @param result - The raw result object received from the wire.
 */
export function dispatchEligibleResult(result: unknown): EligibleResultDisposition {
  if (
    result !== null &&
    typeof result === 'object' &&
    isTaskResultType((result as Record<string, unknown>)['resultType']) &&
    isCreateTaskResult(result)
  ) {
    return { kind: 'task', result };
  }
  return { kind: 'ordinary', result };
}

// ─── §25.4 — DetailedTask (discriminated by status) ────────────────────────────

/**
 * The `InputRequests` map carried on the `input_required` variant of
 * {@link DetailedTask}: outstanding server requests keyed by opaque string.
 * (§25.4, §11.2)
 *
 * Keys are opaque strings chosen by the server; each value is an
 * {@link InputRequest} (S17 / §11.2 — e.g. an elicitation). The client returns
 * matching responses via `tasks/update` (S40). The per-key `InputRequest` shape
 * is owned by S17 and reused here, never redefined.
 */
export const TaskInputRequestsSchema = z.record(InputRequestSchema);

/** A map of outstanding input requests keyed by opaque string. (§25.4, §11.2) */
export type TaskInputRequests = Record<string, InputRequest>;

/** `status: "working"` variant — a `Task` with no additional fields. (§25.4) */
export const WorkingTaskSchema = TaskSchema.extend({
  status: z.literal('working'),
}).passthrough();
export type WorkingTask = z.infer<typeof WorkingTaskSchema>;

/**
 * `status: "input_required"` variant — carries the outstanding `inputRequests`
 * the client must fulfill before the task can continue. (§25.4)
 */
export const InputRequiredTaskSchema = TaskSchema.extend({
  status: z.literal('input_required'),
  /** REQUIRED on this variant. Outstanding server requests keyed by opaque string. */
  inputRequests: TaskInputRequestsSchema,
}).passthrough();
export type InputRequiredTask = z.infer<typeof InputRequiredTaskSchema>;

/**
 * `status: "completed"` variant — carries the verbatim ordinary `result` the
 * augmented request would have produced (including its own `resultType` and any
 * `_meta`). (§25.4, R-25.5-d)
 */
export const CompletedTaskSchema = TaskSchema.extend({
  status: z.literal('completed'),
  /** REQUIRED on this variant. The verbatim ordinary result the request would have returned. */
  result: z.record(z.unknown()),
}).passthrough();
export type CompletedTask = z.infer<typeof CompletedTaskSchema>;

/**
 * `status: "failed"` variant — carries the inline JSON-RPC `error` object that
 * occurred during execution. (§25.4, R-25.5-d)
 */
export const FailedTaskSchema = TaskSchema.extend({
  status: z.literal('failed'),
  /** REQUIRED on this variant. The JSON-RPC error object (§22). */
  error: McpErrorSchema,
}).passthrough();
export type FailedTask = z.infer<typeof FailedTaskSchema>;

/** `status: "cancelled"` variant — a `Task` with no additional fields. (§25.4) */
export const CancelledTaskSchema = TaskSchema.extend({
  status: z.literal('cancelled'),
}).passthrough();
export type CancelledTask = z.infer<typeof CancelledTaskSchema>;

/**
 * A `Task` that additionally conveys the terminal payload (or pending input
 * requests) inline; the shape returned by `tasks/get` (owned operationally by
 * S40). A union discriminated by `status`. (§25.4)
 *
 *   - `working`        → no additional fields;
 *   - `input_required` → `inputRequests` (R-25.5-d: no `result`/`error`);
 *   - `completed`      → `result` (the verbatim ordinary result, R-25.5-d);
 *   - `failed`         → `error` (the inline JSON-RPC error, R-25.5-d);
 *   - `cancelled`      → no additional fields.
 *
 * The underlying outcome is conveyed ONLY once terminal and ONLY inline here; a
 * non-terminal `DetailedTask` carries neither `result` nor `error` (R-25.5-d).
 */
export const DetailedTaskSchema = z.discriminatedUnion('status', [
  WorkingTaskSchema,
  InputRequiredTaskSchema,
  CompletedTaskSchema,
  FailedTaskSchema,
  CancelledTaskSchema,
]);

export type DetailedTask = z.infer<typeof DetailedTaskSchema>;

/** Returns `true` when `value` is a well-formed {@link DetailedTask}. */
export function isDetailedTask(value: unknown): value is DetailedTask {
  return DetailedTaskSchema.safeParse(value).success;
}

/**
 * Returns `true` when a `DetailedTask` correctly observes the inline-outcome rule
 * of §25.5: a non-terminal task carries neither `result` nor `error`; a
 * `completed` task carries `result` (and no `error`); a `failed` task carries
 * `error` (and no `result`); a `cancelled` task carries neither. (R-25.5-d,
 * AC-39.16)
 *
 * The schema-level {@link DetailedTaskSchema} already requires `result` on
 * `completed` and `error` on `failed`; this additionally rejects a non-terminal
 * or `cancelled` variant that smuggles a `result`/`error` it must not carry.
 *
 * @param task - A parsed `DetailedTask` (or any object shaped like one).
 */
export function hasConsistentInlineOutcome(task: { status: TaskStatus } & Record<string, unknown>): boolean {
  const hasResult = task['result'] !== undefined;
  const hasError = task['error'] !== undefined;
  switch (task.status) {
    case 'completed':
      return hasResult && !hasError;
    case 'failed':
      return hasError && !hasResult;
    case 'working':
    case 'input_required':
    case 'cancelled':
      // Non-terminal (and cancelled) variants carry neither result nor error. (R-25.5-d)
      return !hasResult && !hasError;
    default:
      return false;
  }
}

// ─── §25.4 / §25.6 — ttlMs expiry ───────────────────────────────────────────────

/**
 * Returns `true` when a task with a non-null `ttlMs` has expired by `nowMs` —
 * the lifetime has elapsed since `createdAtMs`, so a server MAY discard it.
 * (§25.4, §25.6, R-25.4-c, R-25.6-f)
 *
 * A `null` `ttlMs` means an unbounded lifetime: such a task never expires by
 * `ttlMs` and this returns `false`. The actual discard is at the server's
 * discretion (MAY); this predicate only reports eligibility for discard.
 *
 * @param createdAtMs - The task's creation time in epoch milliseconds.
 * @param ttlMs       - The task's `ttlMs` (non-negative number, or `null`).
 * @param nowMs       - The current time in epoch milliseconds.
 */
export function isTaskExpired(
  createdAtMs: number,
  ttlMs: number | null,
  nowMs: number,
): boolean {
  if (ttlMs === null) return false; // unbounded lifetime never expires (R-25.4-c)
  return nowMs - createdAtMs >= ttlMs;
}

// ─── §25.4(d/e) — Polling interval ─────────────────────────────────────────────

/**
 * The interval, in ms, a client SHOULD wait before its next `tasks/get` poll.
 * (§25.4, R-25.4-d, R-25.4-e)
 *
 * When the task's `pollIntervalMs` is a non-negative number, that value is the
 * recommended MINIMUM and is returned (the client SHOULD NOT poll faster). When
 * it is absent (`undefined`), the client chooses a reasonable interval, supplied
 * here as `fallbackMs`.
 *
 * @param pollIntervalMs - The task's `pollIntervalMs`, or `undefined` when absent.
 * @param fallbackMs     - The client's chosen interval when none is recommended
 *   (default 1000 ms — a reasonable polling cadence).
 */
export function resolvePollIntervalMs(
  pollIntervalMs: number | undefined,
  fallbackMs = 1000,
): number {
  return pollIntervalMs ?? fallbackMs;
}

/**
 * Returns `true` when polling at `nowMs`, given the last poll at `lastPolledAtMs`,
 * respects the recommended minimum interval. (§25.4, R-25.4-d, AC-39.12)
 *
 * A client SHOULD wait at least `pollIntervalMs` (or its `fallbackMs` substitute)
 * between successive polls and SHOULD NOT poll more frequently. This returns
 * `false` when not enough time has elapsed.
 *
 * @param lastPolledAtMs - Epoch ms of the previous poll, or `undefined` for the
 *   first poll (always allowed).
 * @param nowMs          - The current time in epoch ms.
 * @param pollIntervalMs - The task's `pollIntervalMs`, or `undefined` when absent.
 * @param fallbackMs     - The interval used when `pollIntervalMs` is absent.
 */
export function mayPollNow(
  lastPolledAtMs: number | undefined,
  nowMs: number,
  pollIntervalMs: number | undefined,
  fallbackMs = 1000,
): boolean {
  if (lastPolledAtMs === undefined) return true;
  return nowMs - lastPolledAtMs >= resolvePollIntervalMs(pollIntervalMs, fallbackMs);
}

// ─── §25.2 / §25.6 — Error conditions (reuse §22 codes) ────────────────────────

/**
 * The §22 error code a server uses when a client invokes a Tasks method against
 * a server that has not advertised the extension, or invokes a method the server
 * cannot service: the missing-required-capability condition `-32003`. (§25.2,
 * R-25.2-f)
 *
 * Reuses the core {@link MISSING_CLIENT_CAPABILITY_CODE} (S05) — the §22
 * missing-capability condition — rather than minting a Tasks-specific code.
 */
export const TASK_MISSING_CAPABILITY_CODE = MISSING_CLIENT_CAPABILITY_CODE;

/**
 * Builds the JSON-RPC error a server returns when a Tasks method is invoked but
 * the extension is unavailable (not advertised, or the method cannot be
 * serviced). (§25.2, R-25.2-f, AC-39.6)
 *
 * @param method - The Tasks method that was invoked (e.g. `"tasks/get"`).
 */
export function buildTasksMissingCapabilityError(method: string): {
  code: typeof TASK_MISSING_CAPABILITY_CODE;
  message: string;
  data: { requiredExtension: typeof TASKS_EXTENSION_ID; method: string };
} {
  return {
    code: TASK_MISSING_CAPABILITY_CODE,
    message: `Tasks extension not available for method "${method}"`,
    data: { requiredExtension: TASKS_EXTENSION_ID, method },
  };
}

/**
 * The §22 error code a server uses to answer a query (`tasks/get`/`update`/
 * `cancel`) for a `taskId` that is unknown — including one whose non-null `ttlMs`
 * elapsed and was discarded. (§25.4, §25.6, R-25.4-c, R-25.6-g)
 *
 * Per §25.7 (R-25.7, line 7430) a `tasks/get` for a `taskId` not known to the
 * server — including one that never existed and one that expired and was
 * removed — MUST carry JSON-RPC `code: -32602` (Invalid params), the canonical
 * §22.4 not-found condition. (The legacy `-32002` resource literal is NOT in the
 * §22 registry and is not used here.)
 */
export const TASK_NOT_FOUND_CODE = INVALID_PARAMS_CODE;

/**
 * Builds the JSON-RPC not-found error a server returns when queried for a
 * `taskId` it no longer holds (unknown, or expired-and-discarded). (§25.4,
 * §25.6, R-25.4-c, R-25.6-g, AC-39.11)
 *
 * @param taskId - The opaque task identifier that was not found.
 */
export function buildTaskNotFoundError(taskId: string): {
  code: typeof TASK_NOT_FOUND_CODE;
  message: string;
  data: { taskId: string };
} {
  return {
    code: TASK_NOT_FOUND_CODE,
    message: `Task not found: "${taskId}"`,
    data: { taskId },
  };
}
