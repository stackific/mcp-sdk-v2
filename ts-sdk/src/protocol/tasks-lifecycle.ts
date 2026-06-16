/**
 * S40 — Tasks Extension II: get/update/cancel, Notifications & Cleanup (§25.7–§25.12).
 *
 * The client-facing wire surface that drives a task through its lifecycle once it
 * exists (S39 owns the model: `Task`/`DetailedTask`, the status lifecycle, the
 * `io.modelcontextprotocol/tasks` capability, and durability). This module adds:
 *
 *   - `tasks/get` — the polling primitive: request params (`taskId`) and the
 *     `GetTaskResult` (`resultType: "complete"` merged with a `DetailedTask`),
 *     plus the status→variant selection rule. (§25.7)
 *   - polling semantics — honoring/adopting the latest `pollIntervalMs`, deciding
 *     when to stop polling, server-side rate-limiting. (§25.7)
 *   - `tasks/update` — supplying `inputResponses` to an `input_required` task; the
 *     currently-outstanding-key binding rule, partial/stale-key handling, and the
 *     empty `"complete"` acknowledgement. (§25.8)
 *   - `tasks/cancel` — cooperative cancellation; the empty acknowledgement and the
 *     terminal-status immutability guarantee (reusing S39's lifecycle). (§25.9)
 *   - `notifications/tasks` — the optional server push carrying a full
 *     `DetailedTask`, opted into via the §10 `subscriptions/listen` `taskIds`
 *     filter (S16); plus the rule that progress/logging/`notifications/cancelled`
 *     MUST NOT be used for tasks. (§25.10)
 *   - lifecycle & cleanup — `ttlMs` mutability/backstop, expired-task `-32602`
 *     behavior, and the protocol-error (`failed`) vs application-error
 *     (`completed`) separation. (§25.11)
 *
 * Out of scope (owned elsewhere, consumed here):
 *   - the `Task` / `DetailedTask` field definitions, `TaskStatus` enum, status
 *     lifecycle, the extension identifier/capability, and `ttlMs` expiry eligibility
 *     — S39 (`tasks.ts`, §25.1–§25.6);
 *   - the base `Result`/`resultType` discriminator and notification metadata —
 *     S04 (`jsonrpc/payload.ts`, §3);
 *   - the subscription mechanism (`subscriptions/listen`, the acknowledgement) —
 *     S16 (`streaming.ts`, §10); this story adds only the `taskIds` filter;
 *   - the `InputResponses`/`InputResponse` types and key validation — S17
 *     (`multi-round-trip.ts`, §11);
 *   - the numeric `-32xxx` error values — S05/S34 (`meta.ts`/`errors.ts`, §22).
 *
 * REUSE (never redefined here):
 *   - `DetailedTaskSchema`, `TaskInputRequestsSchema`, `TaskStatusSchema`,
 *     `TaskStatus`, `isTerminalTaskStatus`, `TASK_MISSING_CAPABILITY_CODE`,
 *     `buildTasksMissingCapabilityError`, `resolvePollIntervalMs`, `mayPollNow`,
 *     `isTaskExpired` — `./tasks.js` (S39);
 *   - `validateInputResponseKeys` — `./multi-round-trip.js` (S17);
 *   - `SubscriptionFilterSchema`, `SUBSCRIPTIONS_LISTEN_METHOD`,
 *     `PROGRESS_NOTIFICATION_METHOD` / `LOGGING_MESSAGE_METHOD` (via the
 *     request-scoped list) — `./streaming.js` (S16) / `./progress.js` / `./logging.js`;
 *   - `RESULT_TYPE`, `NotificationParamsSchema`, `McpErrorSchema` —
 *     `../jsonrpc/payload.js` (S04);
 *   - `INVALID_PARAMS_CODE`, `MISSING_CLIENT_CAPABILITY_CODE` — `./meta.js` (S05).
 */

import { z } from 'zod';
import { RESULT_TYPE, NotificationParamsSchema, McpErrorSchema } from '../jsonrpc/payload.js';
import { INVALID_PARAMS_CODE } from './meta.js';
import { validateInputResponseKeys } from './multi-round-trip.js';
import { SubscriptionFilterSchema } from './streaming.js';
import { PROGRESS_NOTIFICATION_METHOD, CANCELLED_NOTIFICATION_METHOD } from './progress.js';
import { LOGGING_MESSAGE_METHOD } from './logging.js';
import {
  DetailedTaskSchema,
  TaskStatusSchema,
  isTerminalTaskStatus,
  resolvePollIntervalMs,
  type DetailedTask,
  type TaskStatus,
} from './tasks.js';

// ─── §25.7 / §25.8 / §25.9 / §25.10 — Method & notification names ──────────────

/** Method name of the task-poll request, the literal `"tasks/get"`. (§25.7, R-25.7-a) */
export const TASKS_GET_METHOD = 'tasks/get' as const;

/** Method name of the supply-input request, the literal `"tasks/update"`. (§25.8, R-25.8-a) */
export const TASKS_UPDATE_METHOD = 'tasks/update' as const;

/** Method name of the cooperative-cancel request, the literal `"tasks/cancel"`. (§25.9, R-25.9-b) */
export const TASKS_CANCEL_METHOD = 'tasks/cancel' as const;

/** Method name of the optional status-push notification, the literal `"notifications/tasks"`. (§25.10, R-25.10-a) */
export const TASKS_NOTIFICATION_METHOD = 'notifications/tasks' as const;

/**
 * The three client→server Tasks-extension request methods introduced by S40.
 * (§25.7–§25.9) Each MUST be issued only over the negotiated
 * `io.modelcontextprotocol/tasks` capability; a server receiving any of them from
 * a client that did not declare it responds with `-32003`
 * ({@link buildTasksMissingCapabilityError}). (R-25.7-c/d, R-25.8-c/d, R-25.9-c/d)
 */
export const TASK_LIFECYCLE_METHODS = [
  TASKS_GET_METHOD,
  TASKS_UPDATE_METHOD,
  TASKS_CANCEL_METHOD,
] as const;

export type TaskLifecycleMethod = (typeof TASK_LIFECYCLE_METHODS)[number];

/** Returns `true` when `method` is one of the three S40 Tasks request methods. */
export function isTaskLifecycleMethod(method: string): method is TaskLifecycleMethod {
  return (TASK_LIFECYCLE_METHODS as readonly string[]).includes(method);
}

// ─── §25.7 / §25.8 / §25.9 — The unknown / expired `taskId` error (-32602) ─────

/**
 * The §22 error code a server uses to answer `tasks/get` / `tasks/update` /
 * `tasks/cancel` for a `taskId` that is unknown — never existed, or expired and
 * removed: `-32602` (Invalid params). (§25.7, §25.11, R-25.7-r, R-25.8-m,
 * R-25.9-g, R-25.11-d)
 *
 * NOTE: S39's {@link import('./tasks.js').TASK_NOT_FOUND_CODE} resolves to the
 * SAME core `-32602` (Invalid params) — both the §25.4/§25.6 not-found condition
 * and these S40 wire operations specify `-32602`. The legacy `-32002` literal is
 * NOT minted by this SDK; this reuses {@link INVALID_PARAMS_CODE} (S05) accordingly.
 */
export const TASK_INVALID_PARAMS_CODE = INVALID_PARAMS_CODE;

/**
 * Builds the JSON-RPC `-32602` error a server returns to `tasks/get` /
 * `tasks/update` / `tasks/cancel` when `taskId` does not correspond to a known
 * task (never existed, or expired and removed). The `message` is informative and
 * non-normative; a client SHOULD treat the response as evidence the task is
 * terminal and unavailable and stop polling. (§25.7, §25.11, R-25.7-r, R-25.8-m,
 * R-25.9-g, R-25.11-d, R-25.11-e, AC-40.12, AC-40.21, AC-40.27)
 *
 * @param taskId    - The opaque task identifier that was not found.
 * @param operation - The Tasks operation that was attempted (default `"retrieve"`),
 *   used only to phrase the human-readable message.
 */
export function buildTaskUnknownError(
  taskId: string,
  operation = 'retrieve',
): {
  code: typeof TASK_INVALID_PARAMS_CODE;
  message: string;
  data: { taskId: string };
} {
  return {
    code: TASK_INVALID_PARAMS_CODE,
    message: `Failed to ${operation} task: Task not found`,
    data: { taskId },
  };
}

// Re-export the §25 capability-gating error code/builder so an S40 caller has the
// full error surface (missing capability + unknown task) without importing S39
// directly. These are S39-owned bindings, re-exported, never redefined.
export { TASK_MISSING_CAPABILITY_CODE, buildTasksMissingCapabilityError } from './tasks.js';

// ─── §25.7 — tasks/get request ─────────────────────────────────────────────────

/**
 * The `params` of a `tasks/get` request: a single REQUIRED `taskId`. (§25.7,
 * R-25.7-a)
 *
 * `taskId` MUST be the server-generated identifier sent verbatim, exactly as it
 * appeared in the originating `CreateTaskResult` (S39). (R-25.7-b) `.passthrough()`
 * preserves the per-request `_meta` and any other members.
 */
export const GetTaskRequestParamsSchema = z
  .object({
    /** REQUIRED. The task to query; the verbatim `taskId` from a `CreateTaskResult`. (R-25.7-a, R-25.7-b) */
    taskId: z.string(),
  })
  .passthrough();

export type GetTaskRequestParams = z.infer<typeof GetTaskRequestParamsSchema>;

/** The full `tasks/get` request envelope. (§25.7) */
export const GetTaskRequestSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.literal(TASKS_GET_METHOD),
    params: GetTaskRequestParamsSchema,
  })
  .passthrough();

export type GetTaskRequest = z.infer<typeof GetTaskRequestSchema>;

/** Returns `true` when `value` is a well-formed `tasks/get` request. (R-25.7-a, R-25.7-b) */
export function isGetTaskRequest(value: unknown): value is GetTaskRequest {
  return GetTaskRequestSchema.safeParse(value).success;
}

// ─── §25.7 — GetTaskResult (Result & DetailedTask) ─────────────────────────────

/**
 * The `tasks/get` result: a base `Result` whose `resultType` MUST be the literal
 * `"complete"`, merged with the current `DetailedTask`. (§25.7, R-25.7-e, R-25.7-f)
 *
 * The body is the status-appropriate `DetailedTask` variant (S39's
 * {@link DetailedTaskSchema}): `working`/`cancelled` carry no extra payload,
 * `input_required` carries `inputRequests`, `completed` carries `result`, `failed`
 * carries `error`. (R-25.7-g … R-25.7-l)
 *
 * Modeled as the `DetailedTask` discriminated union intersected with the
 * `resultType: "complete"` discriminator and the OPTIONAL `_meta` of any `Result`,
 * so the per-variant status→payload requirement is enforced by S39's schema.
 */
export const GetTaskResultSchema = z.intersection(
  DetailedTaskSchema,
  z.object({
    /** REQUIRED. The `"complete"` discriminator of every `tasks/get` result. (R-25.7-e) */
    resultType: z.literal(RESULT_TYPE.COMPLETE),
    /** OPTIONAL. The `_meta` permitted on any `Result` (§3 / S04). */
    _meta: z.record(z.unknown()).optional(),
  }),
);

export type GetTaskResult = z.infer<typeof GetTaskResultSchema>;

/** Returns `true` when `value` is a well-formed `GetTaskResult`. (R-25.7-e, R-25.7-f) */
export function isGetTaskResult(value: unknown): value is GetTaskResult {
  return GetTaskResultSchema.safeParse(value).success;
}

/**
 * Builds the `tasks/get` result for a task's current `DetailedTask` state: the
 * `DetailedTask` (status + its status-specific payload) plus the
 * `resultType: "complete"` discriminator. The server MUST inspect the current
 * status and return the matching variant — this helper does so by carrying the
 * caller-supplied `DetailedTask` verbatim and stamping the discriminator.
 * (§25.7, R-25.7-e, R-25.7-f … R-25.7-l, AC-40.1, AC-40.3 … AC-40.7)
 *
 * @param task - The task's current `DetailedTask` (already in the correct variant
 *   for its status; validated against {@link DetailedTaskSchema}).
 * @throws {z.ZodError} when `task` is not a well-formed `DetailedTask`.
 */
export function buildGetTaskResult(task: DetailedTask): GetTaskResult {
  const detailed = DetailedTaskSchema.parse(task);
  return { ...detailed, resultType: RESULT_TYPE.COMPLETE } as GetTaskResult;
}

// ─── §25.8 — tasks/update request ──────────────────────────────────────────────

/**
 * The `inputResponses` map carried by `tasks/update`: responses keyed by
 * currently-outstanding `inputRequests` keys. (§25.8)
 *
 * Each value is shaped as the response to the corresponding server-to-client
 * request would be when surfaced inline (the `InputResponse` model is owned by
 * S17 / §11; e.g. an elicitation result per §20). This story does not redefine
 * the per-kind `InputResponse` shapes — values are accepted as JSON objects and
 * the key-binding rule (each key MUST match a currently-outstanding `inputRequests`
 * key) is enforced separately by {@link validateUpdateInputResponseKeys}. (R-25.8-b)
 */
export const TaskInputResponsesSchema = z.record(z.unknown());

/** A map of input responses keyed by currently-outstanding `inputRequests` keys. (§25.8) */
export type TaskInputResponses = z.infer<typeof TaskInputResponsesSchema>;

/**
 * The `params` of a `tasks/update` request: REQUIRED `taskId` and
 * `inputResponses`. (§25.8, R-25.8-a)
 *
 * `.passthrough()` preserves the per-request `_meta` and any other members.
 */
export const UpdateTaskRequestParamsSchema = z
  .object({
    /** REQUIRED. The task whose outstanding input is being supplied. (R-25.8-a) */
    taskId: z.string(),
    /** REQUIRED. Responses keyed by currently-outstanding `inputRequests` keys. (R-25.8-a, R-25.8-b) */
    inputResponses: TaskInputResponsesSchema,
  })
  .passthrough();

export type UpdateTaskRequestParams = z.infer<typeof UpdateTaskRequestParamsSchema>;

/** The full `tasks/update` request envelope. (§25.8) */
export const UpdateTaskRequestSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.literal(TASKS_UPDATE_METHOD),
    params: UpdateTaskRequestParamsSchema,
  })
  .passthrough();

export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>;

/**
 * Returns `true` when `value` is a well-formed `tasks/update` request — both
 * `taskId` and `inputResponses` present. (§25.8, R-25.8-a, AC-40.13)
 */
export function isUpdateTaskRequest(value: unknown): value is UpdateTaskRequest {
  return UpdateTaskRequestSchema.safeParse(value).success;
}

/**
 * Validates the `tasks/update` key-binding rule: every key in `inputResponses`
 * MUST match a key currently outstanding in the task's `inputRequests` snapshot.
 * (§25.8, R-25.8-b, AC-40.13)
 *
 * Delegates to S17's {@link validateInputResponseKeys} so the key-matching logic
 * is shared with the in-line multi-round-trip flow. Returns the offending keys in
 * `unknownKeys` when any response key is not currently outstanding. Note this is a
 * client-side well-formedness check; a server SHOULD instead simply IGNORE stale
 * keys ({@link filterOutstandingInputResponses}, R-25.8-g).
 *
 * @param outstandingInputRequests - The task's currently-outstanding `inputRequests`
 *   (the snapshot from the latest `input_required` `tasks/get`).
 * @param inputResponses           - The client's `tasks/update` `inputResponses`.
 */
export function validateUpdateInputResponseKeys(
  outstandingInputRequests: Record<string, unknown>,
  inputResponses: Record<string, unknown>,
): { valid: boolean; unknownKeys: string[] } {
  return validateInputResponseKeys(outstandingInputRequests, inputResponses);
}

/**
 * The server-side handling of `tasks/update` `inputResponses`: keep only the
 * entries whose key is CURRENTLY OUTSTANDING for the task, dropping any entry
 * whose key was never issued, already answered, or superseded. (§25.8, R-25.8-g,
 * AC-40.16)
 *
 * A server SHOULD ignore stale entries rather than error, and MAY accept a strict
 * subset of the outstanding keys (the task then remains `input_required` until the
 * remaining responses arrive — see {@link isPartialInputResponse}). (R-25.8-h,
 * AC-40.17)
 *
 * @param outstandingInputRequests - The task's currently-outstanding `inputRequests`.
 * @param inputResponses           - The client's `tasks/update` `inputResponses`.
 * @returns The subset of `inputResponses` the server acts on, plus the keys it
 *   ignored.
 */
export function filterOutstandingInputResponses(
  outstandingInputRequests: Record<string, unknown>,
  inputResponses: Record<string, unknown>,
): { accepted: Record<string, unknown>; ignoredKeys: string[] } {
  const outstanding = new Set(Object.keys(outstandingInputRequests));
  const accepted: Record<string, unknown> = {};
  const ignoredKeys: string[] = [];
  for (const [key, value] of Object.entries(inputResponses)) {
    if (outstanding.has(key)) {
      accepted[key] = value;
    } else {
      ignoredKeys.push(key);
    }
  }
  return { accepted, ignoredKeys };
}

/**
 * Returns `true` when `inputResponses` answers only a STRICT SUBSET of the task's
 * currently-outstanding `inputRequests` — i.e. at least one outstanding key is not
 * answered. A server MAY accept such a partial set; the task then remains
 * `input_required` until the remaining responses arrive. (§25.8, R-25.8-h,
 * AC-40.17)
 *
 * Only currently-outstanding answered keys count toward "answered" (stale keys are
 * ignored per {@link filterOutstandingInputResponses}). When there are no
 * outstanding requests, this returns `false` (nothing to partially answer).
 *
 * @param outstandingInputRequests - The task's currently-outstanding `inputRequests`.
 * @param inputResponses           - The client's `tasks/update` `inputResponses`.
 */
export function isPartialInputResponse(
  outstandingInputRequests: Record<string, unknown>,
  inputResponses: Record<string, unknown>,
): boolean {
  const outstandingKeys = Object.keys(outstandingInputRequests);
  if (outstandingKeys.length === 0) return false;
  const { accepted } = filterOutstandingInputResponses(outstandingInputRequests, inputResponses);
  const answered = Object.keys(accepted).length;
  return answered > 0 && answered < outstandingKeys.length;
}

// ─── §25.9 — tasks/cancel request ──────────────────────────────────────────────

/**
 * The `params` of a `tasks/cancel` request: a single REQUIRED `taskId`. (§25.9,
 * R-25.9-b)
 *
 * `.passthrough()` preserves the per-request `_meta` and any other members.
 */
export const CancelTaskRequestParamsSchema = z
  .object({
    /** REQUIRED. The task to cancel. (R-25.9-b) */
    taskId: z.string(),
  })
  .passthrough();

export type CancelTaskRequestParams = z.infer<typeof CancelTaskRequestParamsSchema>;

/** The full `tasks/cancel` request envelope. (§25.9) */
export const CancelTaskRequestSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.literal(TASKS_CANCEL_METHOD),
    params: CancelTaskRequestParamsSchema,
  })
  .passthrough();

export type CancelTaskRequest = z.infer<typeof CancelTaskRequestSchema>;

/** Returns `true` when `value` is a well-formed `tasks/cancel` request. (§25.9, R-25.9-b, AC-40.24) */
export function isCancelTaskRequest(value: unknown): value is CancelTaskRequest {
  return CancelTaskRequestSchema.safeParse(value).success;
}

// ─── §25.8 / §25.9 — Empty acknowledgement results ─────────────────────────────

/**
 * The empty acknowledgement shared by `tasks/update` and `tasks/cancel`: a `Result`
 * whose `resultType` MUST be the literal `"complete"` and whose body is otherwise
 * empty. (§25.8, §25.9, R-25.8-j, R-25.9-e)
 *
 * `.passthrough()` preserves an OPTIONAL `_meta` and any other `Result` members.
 */
export const TaskAcknowledgementResultSchema = z
  .object({
    /** REQUIRED. The `"complete"` discriminator; the body is otherwise empty. (R-25.8-j, R-25.9-e) */
    resultType: z.literal(RESULT_TYPE.COMPLETE),
    /** OPTIONAL. The `_meta` permitted on any `Result` (§3 / S04). */
    _meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type TaskAcknowledgementResult = z.infer<typeof TaskAcknowledgementResultSchema>;

/** The `tasks/update` result: the empty `"complete"` acknowledgement. (§25.8, R-25.8-j, R-25.8-k) */
export const UpdateTaskResultSchema = TaskAcknowledgementResultSchema;
export type UpdateTaskResult = z.infer<typeof UpdateTaskResultSchema>;

/** The `tasks/cancel` result: the empty `"complete"` acknowledgement. (§25.9, R-25.9-e, R-25.9-f) */
export const CancelTaskResultSchema = TaskAcknowledgementResultSchema;
export type CancelTaskResult = z.infer<typeof CancelTaskResultSchema>;

/**
 * Builds the empty `"complete"` acknowledgement a server returns on a successful
 * `tasks/update` or `tasks/cancel`. The acknowledgement is eventually consistent:
 * for `tasks/update` the observable status may not yet reflect the responses, and
 * for `tasks/cancel` the task MAY remain non-terminal (or reach a terminal status
 * other than `cancelled`). (§25.8, §25.9, R-25.8-j, R-25.8-k, R-25.8-l, R-25.9-e,
 * R-25.9-f, R-25.9-h, R-25.9-i, AC-40.19, AC-40.26)
 */
export function buildTaskAcknowledgementResult(): TaskAcknowledgementResult {
  return { resultType: RESULT_TYPE.COMPLETE };
}

/**
 * Returns `true` when `value` is a well-formed task acknowledgement result —
 * `resultType: "complete"` (the shared `tasks/update` / `tasks/cancel` ack).
 * (R-25.8-j, R-25.9-e)
 */
export function isTaskAcknowledgementResult(value: unknown): value is TaskAcknowledgementResult {
  return TaskAcknowledgementResultSchema.safeParse(value).success;
}

// ─── §25.9 — Cancellation semantics (cooperative, terminal-final) ──────────────

/**
 * Decides what a server's stored task does when it receives `tasks/cancel`.
 * Cancellation is cooperative: the server is obligated only to acknowledge, never
 * to force a transition. A task already in a TERMINAL status MUST NOT change as a
 * result of `tasks/cancel` — terminal status is final. (§25.9, R-25.9-h, R-25.9-i,
 * R-25.9-j, AC-40.28, AC-40.29)
 *
 *   - `"acknowledged-terminal"` — the task is already terminal; the server
 *     acknowledges but MUST NOT change its status (no-op on state). (R-25.9-j)
 *   - `"acknowledged-pending"`  — the task is non-terminal; the server
 *     acknowledges and MAY (but need not) move it toward `cancelled` when feasible.
 *     The eventual terminal status MAY be something other than `cancelled` if the
 *     work finished first. (R-25.9-h, R-25.9-i)
 *
 * Either way the wire response is the same empty acknowledgement
 * ({@link buildTaskAcknowledgementResult}); this only reports the state effect.
 *
 * @param currentStatus - The task's current `TaskStatus`.
 */
export function classifyCancelEffect(
  currentStatus: TaskStatus,
): 'acknowledged-terminal' | 'acknowledged-pending' {
  return isTerminalTaskStatus(currentStatus) ? 'acknowledged-terminal' : 'acknowledged-pending';
}

// ─── §25.10 — notifications/tasks ──────────────────────────────────────────────

/**
 * The `params` of a `notifications/tasks` notification: a full `DetailedTask`
 * (identical to what `tasks/get` would return at that moment) optionally carrying
 * the §3 notification metadata. (§25.10, R-25.10-a)
 *
 * The `params` therefore always include `taskId` and `status`, plus the
 * status-specific payload (`inputRequests` / `result` / `error`) for
 * `input_required` / `completed` / `failed`. Modeled as S39's
 * {@link DetailedTaskSchema} intersected with S04's {@link NotificationParamsSchema}
 * (which contributes the OPTIONAL `_meta`).
 */
export const TaskStatusNotificationParamsSchema = z.intersection(
  DetailedTaskSchema,
  NotificationParamsSchema,
);

export type TaskStatusNotificationParams = z.infer<typeof TaskStatusNotificationParamsSchema>;

/** The full `notifications/tasks` notification envelope. (§25.10, R-25.10-a) */
export const TaskStatusNotificationSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    method: z.literal(TASKS_NOTIFICATION_METHOD),
    params: TaskStatusNotificationParamsSchema,
  })
  .passthrough();

export type TaskStatusNotification = z.infer<typeof TaskStatusNotificationSchema>;

/** Returns `true` when `value` is a well-formed `notifications/tasks` notification. (R-25.10-a) */
export function isTaskStatusNotification(value: unknown): value is TaskStatusNotification {
  return TaskStatusNotificationSchema.safeParse(value).success;
}

/**
 * Builds a `notifications/tasks` notification carrying a complete `DetailedTask`
 * for the task's current status — identical to what `tasks/get` would return at
 * that moment, so a subscribed client need not issue an extra `tasks/get`. (§25.10,
 * R-25.10-a, AC-40.31)
 *
 * A server MUST NOT push this for a task the client did not subscribe to via a
 * `taskIds` filter ({@link mayPushTaskNotification}, R-25.10-d).
 *
 * @param task - The task's current `DetailedTask` (validated against
 *   {@link DetailedTaskSchema}).
 * @throws {z.ZodError} when `task` is not a well-formed `DetailedTask`.
 */
export function buildTaskStatusNotification(task: DetailedTask): TaskStatusNotification {
  const detailed = DetailedTaskSchema.parse(task);
  return {
    jsonrpc: '2.0',
    method: TASKS_NOTIFICATION_METHOD,
    params: detailed as TaskStatusNotificationParams,
  };
}

// ─── §25.10 — taskIds subscription filter (extends S16's filter) ───────────────

/**
 * The S40 extension to S16's `SubscriptionFilter`: an OPTIONAL `taskIds` array by
 * which a client opts in to `notifications/tasks` for the named tasks. (§25.10,
 * R-25.10-b, R-25.10-c)
 *
 * Each element MUST be a `taskId` the client holds (R-25.10-c). Extends
 * S16's {@link SubscriptionFilterSchema} so the §10 filter fields remain valid on
 * the same `subscriptions/listen` request; `.passthrough()` keeps any other §10
 * members. Supplying `taskIds` without the negotiated tasks capability MUST yield
 * `-32003` on `subscriptions/listen` ({@link buildTasksMissingCapabilityError},
 * R-25.10-e).
 */
export const TaskSubscriptionFilterSchema = SubscriptionFilterSchema.extend({
  /** OPTIONAL. Task ids to receive `notifications/tasks` for; each MUST be a held `taskId`. (R-25.10-c) */
  taskIds: z.array(z.string()).optional(),
}).passthrough();

export type TaskSubscriptionFilter = z.infer<typeof TaskSubscriptionFilterSchema>;

/**
 * Returns the `taskIds` a `subscriptions/listen` filter opts in to, or `[]` when
 * none. (§25.10, R-25.10-b)
 *
 * @param filter - The `notifications` filter from a `subscriptions/listen` request.
 */
export function subscribedTaskIds(filter: unknown): string[] {
  const parsed = TaskSubscriptionFilterSchema.safeParse(filter);
  if (!parsed.success) return [];
  return parsed.data.taskIds ?? [];
}

/**
 * Returns `true` when a server MAY push `notifications/tasks` for `taskId` — i.e.
 * the client subscribed to it via a `taskIds` filter on `subscriptions/listen`. A
 * server MUST NOT push for any task NOT in the subscribed set. (§25.10, R-25.10-d,
 * AC-40.33)
 *
 * @param taskId            - The task a notification would be about.
 * @param subscribedTaskIds - The `taskIds` the server accepted for this client.
 */
export function mayPushTaskNotification(
  taskId: string,
  subscribedTaskIds: ReadonlyArray<string>,
): boolean {
  return subscribedTaskIds.includes(taskId);
}

/**
 * Returns `true` when supplying a non-empty `taskIds` subscription filter requires
 * the tasks capability and the client has NOT negotiated it — in which case the
 * server MUST respond to `subscriptions/listen` with `-32003`. (§25.10, R-25.10-e,
 * AC-40.34)
 *
 * When `true`, the server answers with {@link buildTasksMissingCapabilityError}
 * for `subscriptions/listen`. A filter with no `taskIds` (or an empty array) does
 * not trigger the requirement.
 *
 * @param filter             - The `notifications` filter from `subscriptions/listen`.
 * @param clientNegotiated   - Whether the client negotiated the tasks capability.
 */
export function taskSubscriptionRequiresCapability(
  filter: unknown,
  clientNegotiated: boolean,
): boolean {
  return subscribedTaskIds(filter).length > 0 && !clientNegotiated;
}

// ─── §25.10 — Notifications that MUST NOT be sent for a task ────────────────────

/**
 * The notification methods that MUST NOT be used to convey task state:
 * `notifications/progress`, `notifications/message`, and `notifications/cancelled`.
 * (§25.9, §25.10, R-25.9-a, R-25.10-g)
 *
 *   - progress / message — task state is conveyed ONLY via `tasks/get` and
 *     `notifications/tasks` (R-25.10-g, AC-40.36);
 *   - cancelled — `tasks/cancel` is the ONLY task-cancellation mechanism; the
 *     general `notifications/cancelled` MUST NOT be used (R-25.9-a, AC-40.23).
 *
 * Reuses the canonical method-name constants from S22 (progress / cancelled) and
 * S23 (logging) rather than re-typing the literals.
 */
export const TASK_FORBIDDEN_NOTIFICATION_METHODS = [
  PROGRESS_NOTIFICATION_METHOD,
  LOGGING_MESSAGE_METHOD,
  CANCELLED_NOTIFICATION_METHOD,
] as const;

export type TaskForbiddenNotificationMethod =
  (typeof TASK_FORBIDDEN_NOTIFICATION_METHODS)[number];

/**
 * Returns `true` when `method` is a notification kind that MUST NOT be sent for a
 * task (`notifications/progress`, `notifications/message`, or
 * `notifications/cancelled`); sending it for a task is a protocol violation.
 * (§25.9, §25.10, R-25.9-a, R-25.10-g, AC-40.23, AC-40.36)
 */
export function isForbiddenTaskNotification(method: string): boolean {
  return (TASK_FORBIDDEN_NOTIFICATION_METHODS as readonly string[]).includes(method);
}

// ─── §25.7 — Polling semantics ─────────────────────────────────────────────────

/**
 * Resolves the `pollIntervalMs` a client should honor between consecutive
 * `tasks/get` requests, ADOPTING THE LATEST observed value. Because
 * `pollIntervalMs` MAY change over the task's lifetime, a client SHOULD use the
 * value from the most recent `tasks/get` result. (§25.7, R-25.7-m, R-25.7-n,
 * AC-40.8)
 *
 * When the latest observation carries no `pollIntervalMs`, the previously observed
 * value (if any) is retained; failing that, the client's `fallbackMs`. Delegates
 * the final fallback to S39's {@link resolvePollIntervalMs}.
 *
 * @param latestObserved   - `pollIntervalMs` from the most recent `tasks/get`, or
 *   `undefined` when absent.
 * @param previousObserved - The previously adopted `pollIntervalMs`, or `undefined`.
 * @param fallbackMs       - The interval used when neither has supplied a value.
 */
export function adoptLatestPollIntervalMs(
  latestObserved: number | undefined,
  previousObserved: number | undefined,
  fallbackMs = 1000,
): number {
  return resolvePollIntervalMs(latestObserved ?? previousObserved, fallbackMs);
}

/**
 * Returns `true` when a server MAY rate-limit a `tasks/get` poll that arrived
 * sooner than the most recently advertised `pollIntervalMs`. (§25.7, R-25.7-o,
 * AC-40.9)
 *
 * A server is PERMITTED (not required) to rate-limit such a poll. This reports
 * eligibility: `true` when the gap since the last poll is below the advertised
 * minimum. A first poll (no prior poll) is never rate-limitable.
 *
 * @param lastPolledAtMs - Epoch ms of the previous poll, or `undefined` for the
 *   first poll.
 * @param nowMs          - The current time in epoch ms.
 * @param pollIntervalMs - The most recently advertised `pollIntervalMs`, or
 *   `undefined` when none was advertised.
 */
export function mayRateLimitPoll(
  lastPolledAtMs: number | undefined,
  nowMs: number,
  pollIntervalMs: number | undefined,
): boolean {
  if (lastPolledAtMs === undefined || pollIntervalMs === undefined) return false;
  return nowMs - lastPolledAtMs < pollIntervalMs;
}

/**
 * Returns `true` when a client SHOULD continue polling a task: it is non-terminal
 * AND the client has not issued `tasks/cancel`. A client SHOULD poll until the
 * task reaches a terminal status or it cancels. (§25.7, §25.8, R-25.7-p, R-25.8-n,
 * AC-40.10, AC-40.22)
 *
 * After `tasks/cancel`, the client MAY stop polling immediately and need not wait
 * for `cancelled` (R-25.9-k, AC-40.30) — pass `cancelRequested: true`.
 *
 * @param status         - The task's last observed `TaskStatus`.
 * @param cancelRequested - Whether the client has already issued `tasks/cancel`.
 */
export function shouldContinuePolling(status: TaskStatus, cancelRequested = false): boolean {
  if (cancelRequested) return false;
  return !isTerminalTaskStatus(status);
}

/**
 * Returns `true` when a client should STOP polling a task after a `tasks/get`
 * response: either a `-32602` error (the task is unknown/expired — terminal and
 * unavailable) or a terminal `DetailedTask`. (§25.7, §25.11, R-25.7-s, R-25.11-e,
 * AC-40.12)
 *
 * @param response - A raw `tasks/get` response: either an error object
 *   (`{ code, ... }`) or a `DetailedTask`-shaped result (`{ status, ... }`).
 */
export function isPollingTerminalResponse(response: unknown): boolean {
  if (response === null || typeof response !== 'object') return false;
  const r = response as Record<string, unknown>;
  // A -32602 error response → task is terminal and unavailable. (R-25.7-s, R-25.11-e)
  if (r['code'] === TASK_INVALID_PARAMS_CODE) return true;
  // A terminal DetailedTask result → stop polling. (R-25.7-p)
  const status = r['status'];
  return TaskStatusSchema.safeParse(status).success && isTerminalTaskStatus(status as TaskStatus);
}

// ─── §25.11 — Lifecycle, cleanup & error classification ────────────────────────

/**
 * Returns `true` when a client MAY treat a task as not usable because its non-null
 * `ttlMs` backstop has elapsed without the observable status advancing past a
 * non-terminal state. (§25.11, R-25.11-c, AC-40.41)
 *
 * The client MAY consider the task not usable once `createdAt + ttlMs` has passed
 * and the task is still non-terminal. A `null` `ttlMs` (unbounded) is never a
 * backstop and returns `false`. Time inputs are epoch milliseconds.
 *
 * @param createdAtMs - The task's creation time in epoch ms.
 * @param ttlMs       - The task's `ttlMs` (non-negative number, or `null`).
 * @param nowMs       - The current time in epoch ms.
 * @param status      - The task's last observed `TaskStatus`.
 */
export function isTaskBackstopElapsed(
  createdAtMs: number,
  ttlMs: number | null,
  nowMs: number,
  status: TaskStatus,
): boolean {
  if (ttlMs === null) return false; // unbounded lifetime is never a backstop (R-25.11-c)
  if (isTerminalTaskStatus(status)) return false; // already advanced to terminal
  return nowMs - createdAtMs >= ttlMs;
}

/**
 * The outcome classification a server applies when an augmented request finishes,
 * enforcing the strict §25.11 separation between protocol-level faults and
 * application-level outcomes. (§25.11, R-25.11-f … R-25.11-i)
 *
 *   - `"failed"`    — a JSON-RPC PROTOCOL error occurred during execution; the
 *     task moves to `failed` with the `error` field carrying that JSON-RPC error
 *     (and SHOULD include a diagnostic `statusMessage`). (R-25.11-f, R-25.11-g)
 *   - `"completed"` — the request completed at the protocol level; any
 *     application-level error (e.g. a tool result with `isError: true`) is carried
 *     INSIDE the `result` field, NOT as a `failed` task. (R-25.11-h, R-25.11-i)
 */
export type TaskExecutionOutcome = 'failed' | 'completed';

/**
 * Classifies how a finished augmented request maps onto a terminal task status,
 * enforcing R-25.11-h/i: `failed` is used ONLY for JSON-RPC protocol-level errors;
 * an application-level error returned within an otherwise-successful result maps to
 * `completed` (the error stays inside `result`). (§25.11, R-25.11-f, R-25.11-h,
 * R-25.11-i, AC-40.42, AC-40.43)
 *
 * @param finished - The execution outcome:
 *   - `{ kind: "protocol-error", error }` — a JSON-RPC error occurred → `failed`;
 *   - `{ kind: "result", result }` — the request completed at the protocol level
 *     (even if `result` conveys an application error such as `isError: true`) →
 *     `completed`.
 */
export function classifyTaskExecutionOutcome(
  finished:
    | { kind: 'protocol-error'; error: unknown }
    | { kind: 'result'; result: unknown },
): TaskExecutionOutcome {
  return finished.kind === 'protocol-error' ? 'failed' : 'completed';
}

/**
 * Builds the terminal `DetailedTask` for a task that hit a JSON-RPC PROTOCOL error
 * during execution: `status: "failed"` carrying the inline `error`, and SHOULD
 * include a diagnostic `statusMessage`. (§25.11, R-25.11-f, R-25.11-g, AC-40.42)
 *
 * The `failed` status MUST NOT be used for non-protocol faults — for an
 * application-level error use {@link buildCompletedTaskUpdate} with the error
 * carried inside `result`. (R-25.11-h)
 *
 * @param base          - The task's base fields (`taskId`, `createdAt`,
 *   `lastUpdatedAt`, `ttlMs`, and any other `Task` members).
 * @param error         - The JSON-RPC error that occurred (validated against
 *   {@link McpErrorSchema}).
 * @param statusMessage - OPTIONAL diagnostic message (SHOULD be supplied, R-25.11-g).
 */
export function buildFailedTaskUpdate(
  base: Record<string, unknown>,
  error: unknown,
  statusMessage?: string,
): DetailedTask {
  const parsedError = McpErrorSchema.parse(error);
  const detailed: Record<string, unknown> = {
    ...base,
    status: 'failed',
    error: parsedError,
  };
  if (statusMessage !== undefined) detailed['statusMessage'] = statusMessage;
  return DetailedTaskSchema.parse(detailed);
}

/**
 * Builds the terminal `DetailedTask` for a task whose underlying request COMPLETED
 * at the protocol level: `status: "completed"` carrying the verbatim `result` — the
 * value the original request would have returned synchronously. An application-level
 * error (e.g. a tool result with `isError: true`) is carried INSIDE `result`, NOT
 * as a `failed` task. (§25.11, R-25.11-i, AC-40.5, AC-40.43)
 *
 * @param base   - The task's base fields (`taskId`, `createdAt`, `lastUpdatedAt`,
 *   `ttlMs`, etc.).
 * @param result - The verbatim ordinary result of the underlying request.
 */
export function buildCompletedTaskUpdate(
  base: Record<string, unknown>,
  result: Record<string, unknown>,
): DetailedTask {
  return DetailedTaskSchema.parse({ ...base, status: 'completed', result });
}
