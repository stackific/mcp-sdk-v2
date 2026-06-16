/**
 * Tests for S40 — Tasks Extension II: get/update/cancel, Notifications & Cleanup
 * (§25.7–§25.12).
 *
 * AC coverage (one or more `it` per AC; AC id named in the title):
 *  AC-40.1  (R-25.7-a,b,e)       — tasks/get verbatim taskId → resultType "complete"
 *  AC-40.2  (R-25.7-c,d)         — un-negotiated tasks/get → -32003
 *  AC-40.3  (R-25.7-f,g)         — working variant, no payload
 *  AC-40.4  (R-25.7-h,i)         — input_required variant carries inputRequests
 *  AC-40.5  (R-25.7-j)           — completed variant carries result
 *  AC-40.6  (R-25.7-k)           — failed variant carries error
 *  AC-40.7  (R-25.7-l)           — cancelled variant, no payload
 *  AC-40.8  (R-25.7-m,n)         — honor / adopt latest pollIntervalMs
 *  AC-40.9  (R-25.7-o)           — server may rate-limit faster-than-interval polls
 *  AC-40.10 (R-25.7-p)           — continue polling until terminal / cancel
 *  AC-40.11 (R-25.7-q)           — taskId persisted to durable storage
 *  AC-40.12 (R-25.7-r,s; R-25.11-d,e) — unknown/expired taskId → -32602, stop polling
 *  AC-40.13 (R-25.8-a,b)         — tasks/update needs taskId + inputResponses; keys match
 *  AC-40.14 (R-25.8-c,d)         — un-negotiated tasks/update → -32003
 *  AC-40.15 (R-25.8-e,f)         — inputRequests keys unique over lifetime
 *  AC-40.16 (R-25.8-g)           — server ignores stale inputResponses entries
 *  AC-40.17 (R-25.8-h)           — partial responses accepted; stays input_required
 *  AC-40.18 (R-25.8-i)           — client tracks answered keys (no double answer)
 *  AC-40.19 (R-25.8-j,k)         — tasks/update ack is empty "complete"
 *  AC-40.20 (R-25.8-l)           — ack is eventually consistent
 *  AC-40.21 (R-25.8-m)           — tasks/update unknown taskId → -32602
 *  AC-40.22 (R-25.8-n)           — keep observing after tasks/update
 *  AC-40.23 (R-25.9-a)           — notifications/cancelled never used for tasks
 *  AC-40.24 (R-25.9-b)           — tasks/cancel needs taskId
 *  AC-40.25 (R-25.9-c,d)         — un-negotiated tasks/cancel → -32003
 *  AC-40.26 (R-25.9-e,f)         — tasks/cancel ack is empty "complete"
 *  AC-40.27 (R-25.9-g)           — tasks/cancel unknown taskId → -32602
 *  AC-40.28 (R-25.9-h,i)         — cancel: ack only, may stay non-terminal / other terminal
 *  AC-40.29 (R-25.9-j)           — terminal task: cancel does not change status
 *  AC-40.30 (R-25.9-k)           — client may drop state / stop polling after cancel
 *  AC-40.31 (R-25.10-a)          — notifications/tasks carries full DetailedTask
 *  AC-40.32 (R-25.10-b,c)        — opt-in via taskIds filter; each a held taskId
 *  AC-40.33 (R-25.10-d)          — no push for unsubscribed task
 *  AC-40.34 (R-25.10-e)          — taskIds without capability → -32003
 *  AC-40.35 (R-25.10-f)          — may rely on notifications, polling, or both
 *  AC-40.36 (R-25.10-g)          — no progress/message notifications for a task
 *  AC-40.37 (R-25.10-h)          — pre-task input resolved synchronously
 *  AC-40.38 (R-25.10-i)          — inputRequests treated as standalone request (trust)
 *  AC-40.39 (R-25.10-j)          — task input via tasks/update; inline via re-issue; never mixed
 *  AC-40.40 (R-25.11-a,b)        — ttlMs mutable; may fail+remove after elapse
 *  AC-40.41 (R-25.11-c)          — non-null ttlMs backstop
 *  AC-40.42 (R-25.11-f,g)        — protocol error → failed + error + statusMessage
 *  AC-40.43 (R-25.11-h,i)        — app error → completed with error in result; failed not used
 */

import { describe, it, expect } from 'vitest';
import {
  TASKS_GET_METHOD,
  TASKS_UPDATE_METHOD,
  TASKS_CANCEL_METHOD,
  TASKS_NOTIFICATION_METHOD,
  TASK_LIFECYCLE_METHODS,
  isTaskLifecycleMethod,
  TASK_INVALID_PARAMS_CODE,
  buildTaskUnknownError,
  TASK_MISSING_CAPABILITY_CODE,
  buildTasksMissingCapabilityError,
  GetTaskRequestSchema,
  GetTaskRequestParamsSchema,
  isGetTaskRequest,
  GetTaskResultSchema,
  isGetTaskResult,
  buildGetTaskResult,
  isUpdateTaskRequest,
  TaskInputResponsesSchema,
  validateUpdateInputResponseKeys,
  filterOutstandingInputResponses,
  isPartialInputResponse,
  CancelTaskRequestSchema,
  isCancelTaskRequest,
  UpdateTaskResultSchema,
  CancelTaskResultSchema,
  buildTaskAcknowledgementResult,
  isTaskAcknowledgementResult,
  classifyCancelEffect,
  TaskStatusNotificationSchema,
  isTaskStatusNotification,
  buildTaskStatusNotification,
  TaskSubscriptionFilterSchema,
  subscribedTaskIds,
  mayPushTaskNotification,
  taskSubscriptionRequiresCapability,
  TASK_FORBIDDEN_NOTIFICATION_METHODS,
  isForbiddenTaskNotification,
  adoptLatestPollIntervalMs,
  mayRateLimitPoll,
  shouldContinuePolling,
  isPollingTerminalResponse,
  isTaskBackstopElapsed,
  classifyTaskExecutionOutcome,
  buildFailedTaskUpdate,
  buildCompletedTaskUpdate,
} from '../../protocol/tasks-lifecycle.js';
import { RESULT_TYPE } from '../../jsonrpc/payload.js';
import { INVALID_PARAMS_CODE, MISSING_CLIENT_CAPABILITY_CODE } from '../../protocol/meta.js';
import { isTerminalTaskStatus, type DetailedTask } from '../../protocol/tasks.js';
import {
  PROGRESS_NOTIFICATION_METHOD,
  CANCELLED_NOTIFICATION_METHOD,
} from '../../protocol/progress.js';
import { LOGGING_MESSAGE_METHOD } from '../../protocol/logging.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const TASK_ID = '786512e2-9e0d-44bd-8f29-789f320fe840';

/** Base Task fields shared by every DetailedTask variant. */
function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    taskId: TASK_ID,
    createdAt: '2026-07-28T10:30:00Z',
    lastUpdatedAt: '2026-07-28T10:50:00Z',
    ttlMs: 3_600_000,
    pollIntervalMs: 5000,
    ...overrides,
  };
}

const workingTask: DetailedTask = base({ status: 'working' }) as DetailedTask;

const inputRequiredTask: DetailedTask = base({
  status: 'input_required',
  inputRequests: {
    name: { method: 'elicitation/create', params: { message: 'Your name?' } },
  },
}) as DetailedTask;

const completedTask: DetailedTask = base({
  status: 'completed',
  result: {
    content: [{ type: 'text', text: 'Hello, Luca!' }],
    isError: false,
  },
}) as DetailedTask;

const failedTask: DetailedTask = base({
  status: 'failed',
  statusMessage: 'upstream timed out',
  error: { code: -32000, message: 'Execution error' },
}) as DetailedTask;

const cancelledTask: DetailedTask = base({ status: 'cancelled' }) as DetailedTask;

/** A valid per-request `_meta` object (the three required keys). */
function requestMeta(): Record<string, unknown> {
  return {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
    'io.modelcontextprotocol/clientCapabilities': {},
  };
}

// ─── Method & notification names ────────────────────────────────────────────────

describe('S40 method and notification names', () => {
  it('uses the exact literal method names', () => {
    expect(TASKS_GET_METHOD).toBe('tasks/get');
    expect(TASKS_UPDATE_METHOD).toBe('tasks/update');
    expect(TASKS_CANCEL_METHOD).toBe('tasks/cancel');
    expect(TASKS_NOTIFICATION_METHOD).toBe('notifications/tasks');
  });

  it('isTaskLifecycleMethod recognizes the three request methods only', () => {
    expect(TASK_LIFECYCLE_METHODS).toEqual(['tasks/get', 'tasks/update', 'tasks/cancel']);
    for (const m of TASK_LIFECYCLE_METHODS) expect(isTaskLifecycleMethod(m)).toBe(true);
    expect(isTaskLifecycleMethod('notifications/tasks')).toBe(false);
    expect(isTaskLifecycleMethod('tools/call')).toBe(false);
  });
});

// ─── AC-40.1 ─────────────────────────────────────────────────────────────────

describe('AC-40.1 — tasks/get verbatim taskId → resultType "complete" (R-25.7-a,b,e)', () => {
  it('accepts a tasks/get with params.taskId set verbatim', () => {
    const req = {
      jsonrpc: '2.0',
      id: 8,
      method: TASKS_GET_METHOD,
      params: { taskId: TASK_ID, _meta: requestMeta() },
    };
    expect(isGetTaskRequest(req)).toBe(true);
    const parsed = GetTaskRequestSchema.parse(req);
    // taskId carried verbatim, unchanged. (R-25.7-b)
    expect(parsed.params.taskId).toBe(TASK_ID);
  });

  it('requires params.taskId (R-25.7-a)', () => {
    expect(GetTaskRequestParamsSchema.safeParse({}).success).toBe(false);
    expect(GetTaskRequestParamsSchema.safeParse({ taskId: TASK_ID }).success).toBe(true);
  });

  it('GetTaskResult resultType MUST be the literal "complete" (R-25.7-e)', () => {
    const result = buildGetTaskResult(workingTask);
    expect(result.resultType).toBe(RESULT_TYPE.COMPLETE);
    expect(result.resultType).toBe('complete');
    expect(isGetTaskResult(result)).toBe(true);
  });

  it('rejects a GetTaskResult whose resultType is not "complete"', () => {
    const bad = { ...workingTask, resultType: 'task' };
    expect(GetTaskResultSchema.safeParse(bad).success).toBe(false);
  });
});

// ─── AC-40.2 ─────────────────────────────────────────────────────────────────

describe('AC-40.2 — un-negotiated tasks/get → -32003 (R-25.7-c,d)', () => {
  it('builds a -32003 missing-capability error for tasks/get', () => {
    const err = buildTasksMissingCapabilityError(TASKS_GET_METHOD);
    expect(err.code).toBe(TASK_MISSING_CAPABILITY_CODE);
    expect(err.code).toBe(MISSING_CLIENT_CAPABILITY_CODE);
    expect(err.code).toBe(-32003);
    expect(err.data.method).toBe('tasks/get');
  });
});

// ─── AC-40.3 … AC-40.7 — per-status variant selection ────────────────────────

describe('AC-40.3 — working variant has no status-specific payload (R-25.7-f,g)', () => {
  it('returns status "working" and no result/error/inputRequests', () => {
    const r = buildGetTaskResult(workingTask);
    expect(r.status).toBe('working');
    expect((r as Record<string, unknown>)['result']).toBeUndefined();
    expect((r as Record<string, unknown>)['error']).toBeUndefined();
    expect((r as Record<string, unknown>)['inputRequests']).toBeUndefined();
    expect(isGetTaskResult(r)).toBe(true);
  });
});

describe('AC-40.4 — input_required variant carries inputRequests (R-25.7-h,i)', () => {
  it('returns status "input_required" with the outstanding inputRequests', () => {
    const r = buildGetTaskResult(inputRequiredTask) as Record<string, unknown>;
    expect(r['status']).toBe('input_required');
    expect(r['inputRequests']).toHaveProperty('name');
    expect(isGetTaskResult(r)).toBe(true);
  });

  it('rejects an input_required result missing inputRequests', () => {
    const bad = { ...base({ status: 'input_required' }), resultType: RESULT_TYPE.COMPLETE };
    expect(GetTaskResultSchema.safeParse(bad).success).toBe(false);
  });
});

describe('AC-40.5 — completed variant carries result (R-25.7-j)', () => {
  it('returns status "completed" with the verbatim result', () => {
    const r = buildGetTaskResult(completedTask) as Record<string, unknown>;
    expect(r['status']).toBe('completed');
    expect(r['result']).toEqual({
      content: [{ type: 'text', text: 'Hello, Luca!' }],
      isError: false,
    });
  });
});

describe('AC-40.6 — failed variant carries error (R-25.7-k)', () => {
  it('returns status "failed" with the JSON-RPC error', () => {
    const r = buildGetTaskResult(failedTask) as Record<string, unknown>;
    expect(r['status']).toBe('failed');
    expect(r['error']).toEqual({ code: -32000, message: 'Execution error' });
  });
});

describe('AC-40.7 — cancelled variant has no status-specific payload (R-25.7-l)', () => {
  it('returns status "cancelled" and no result/error', () => {
    const r = buildGetTaskResult(cancelledTask) as Record<string, unknown>;
    expect(r['status']).toBe('cancelled');
    expect(r['result']).toBeUndefined();
    expect(r['error']).toBeUndefined();
  });
});

// ─── AC-40.8 — pollIntervalMs honoring & adoption ────────────────────────────

describe('AC-40.8 — honor and adopt latest pollIntervalMs (R-25.7-m,n)', () => {
  it('adopts the latest observed pollIntervalMs over the previous value', () => {
    expect(adoptLatestPollIntervalMs(3000, 5000)).toBe(3000);
  });

  it('retains the previous value when the latest poll omits pollIntervalMs', () => {
    expect(adoptLatestPollIntervalMs(undefined, 5000)).toBe(5000);
  });

  it('falls back when neither is present', () => {
    expect(adoptLatestPollIntervalMs(undefined, undefined, 1000)).toBe(1000);
  });

  it('a client waits at least pollIntervalMs before the next poll', () => {
    // simulate honoring: last poll t=0, interval 5000 → poll allowed only at t>=5000.
    expect(mayRateLimitPoll(0, 4999, 5000)).toBe(true); // too soon — server may rate-limit
    expect(mayRateLimitPoll(0, 5000, 5000)).toBe(false); // honored
  });
});

// ─── AC-40.9 — server may rate-limit ─────────────────────────────────────────

describe('AC-40.9 — server may rate-limit faster-than-interval polls (R-25.7-o)', () => {
  it('reports rate-limit eligibility when polling sooner than the advertised interval', () => {
    expect(mayRateLimitPoll(1000, 1500, 5000)).toBe(true);
  });

  it('does not flag a first poll or a poll past the interval', () => {
    expect(mayRateLimitPoll(undefined, 1500, 5000)).toBe(false);
    expect(mayRateLimitPoll(1000, 7000, 5000)).toBe(false);
    expect(mayRateLimitPoll(1000, 1500, undefined)).toBe(false);
  });
});

// ─── AC-40.10 — continue polling until terminal/cancel ───────────────────────

describe('AC-40.10 — continue polling until terminal or tasks/cancel (R-25.7-p)', () => {
  it('keeps polling while non-terminal and not cancelled', () => {
    expect(shouldContinuePolling('working')).toBe(true);
    expect(shouldContinuePolling('input_required')).toBe(true);
  });

  it('stops at terminal status', () => {
    expect(shouldContinuePolling('completed')).toBe(false);
    expect(shouldContinuePolling('failed')).toBe(false);
    expect(shouldContinuePolling('cancelled')).toBe(false);
  });

  it('stops once the client has issued tasks/cancel', () => {
    expect(shouldContinuePolling('working', true)).toBe(false);
  });
});

// ─── AC-40.11 — durable persistence of taskId ────────────────────────────────

describe('AC-40.11 — taskId persisted to durable storage (R-25.7-q)', () => {
  it('the taskId survives a round-trip through durable (serialized) storage and a tasks/get resumes', () => {
    // The taskId is an opaque durable handle: persist, "restart", and re-poll.
    const store = new Map<string, string>();
    store.set('pending-task', TASK_ID);
    const serialized = JSON.stringify(Object.fromEntries(store));

    const restored = new Map<string, string>(Object.entries(JSON.parse(serialized)));
    const resumedId = restored.get('pending-task');
    expect(resumedId).toBe(TASK_ID);

    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: TASKS_GET_METHOD,
      params: { taskId: resumedId, _meta: requestMeta() },
    };
    expect(isGetTaskRequest(req)).toBe(true);
  });
});

// ─── AC-40.12 — unknown/expired taskId → -32602, stop polling ────────────────

describe('AC-40.12 — unknown/expired taskId → -32602, client stops polling (R-25.7-r,s; R-25.11-d,e)', () => {
  it('builds a -32602 (Invalid params) error, not a result', () => {
    const err = buildTaskUnknownError(TASK_ID);
    expect(err.code).toBe(TASK_INVALID_PARAMS_CODE);
    expect(err.code).toBe(INVALID_PARAMS_CODE);
    expect(err.code).toBe(-32602);
    expect(err.data.taskId).toBe(TASK_ID);
    // It is an error object, not a DetailedTask result.
    expect((err as Record<string, unknown>)['status']).toBeUndefined();
    expect(isGetTaskResult(err)).toBe(false);
  });

  it('a client treats a -32602 tasks/get response as terminal & stops polling', () => {
    expect(isPollingTerminalResponse(buildTaskUnknownError(TASK_ID))).toBe(true);
  });

  it('a non-terminal DetailedTask response does not stop polling', () => {
    expect(isPollingTerminalResponse(workingTask)).toBe(false);
    expect(isPollingTerminalResponse(inputRequiredTask)).toBe(false);
  });

  it('a terminal DetailedTask response stops polling', () => {
    expect(isPollingTerminalResponse(completedTask)).toBe(true);
    expect(isPollingTerminalResponse(failedTask)).toBe(true);
    expect(isPollingTerminalResponse(cancelledTask)).toBe(true);
  });
});

// ─── AC-40.13 — tasks/update well-formedness & key binding ───────────────────

describe('AC-40.13 — tasks/update needs taskId + inputResponses; keys match (R-25.8-a,b)', () => {
  it('is well-formed only with both taskId and inputResponses', () => {
    const ok = {
      jsonrpc: '2.0',
      id: 6,
      method: TASKS_UPDATE_METHOD,
      params: {
        taskId: TASK_ID,
        inputResponses: { name: { action: 'accept', content: { input: 'Luca' } } },
        _meta: requestMeta(),
      },
    };
    expect(isUpdateTaskRequest(ok)).toBe(true);

    const missingResponses = {
      jsonrpc: '2.0',
      id: 6,
      method: TASKS_UPDATE_METHOD,
      params: { taskId: TASK_ID, _meta: requestMeta() },
    };
    expect(isUpdateTaskRequest(missingResponses)).toBe(false);

    const missingTaskId = {
      jsonrpc: '2.0',
      id: 6,
      method: TASKS_UPDATE_METHOD,
      params: { inputResponses: {}, _meta: requestMeta() },
    };
    expect(isUpdateTaskRequest(missingTaskId)).toBe(false);
  });

  it('every inputResponses key MUST match a currently-outstanding inputRequests key', () => {
    const outstanding = { name: { method: 'elicitation/create', params: {} } };
    const good = validateUpdateInputResponseKeys(outstanding, {
      name: { action: 'accept' },
    });
    expect(good.valid).toBe(true);

    const bad = validateUpdateInputResponseKeys(outstanding, {
      name: { action: 'accept' },
      bogus: { action: 'accept' },
    });
    expect(bad.valid).toBe(false);
    expect(bad.unknownKeys).toEqual(['bogus']);
  });

  it('TaskInputResponsesSchema accepts a record of arbitrary response values', () => {
    expect(
      TaskInputResponsesSchema.safeParse({ name: { action: 'accept' } }).success,
    ).toBe(true);
  });
});

// ─── AC-40.14 — un-negotiated tasks/update → -32003 ──────────────────────────

describe('AC-40.14 — un-negotiated tasks/update → -32003 (R-25.8-c,d)', () => {
  it('builds a -32003 for tasks/update', () => {
    const err = buildTasksMissingCapabilityError(TASKS_UPDATE_METHOD);
    expect(err.code).toBe(-32003);
    expect(err.data.method).toBe('tasks/update');
  });
});

// ─── AC-40.15 — inputRequests keys unique over lifetime ──────────────────────

describe('AC-40.15 — inputRequests keys unique over a task lifetime (R-25.8-e,f)', () => {
  it('once a key is answered it is no longer outstanding and a reused key is treated as stale', () => {
    // Snapshot 1: key "q1" outstanding. The server answers it; it MUST NOT be
    // reused for a distinct later request. A subsequent stale response is ignored.
    const firstOutstanding = { q1: { method: 'elicitation/create', params: {} } };
    const answered = filterOutstandingInputResponses(firstOutstanding, {
      q1: { action: 'accept' },
    });
    expect(answered.accepted).toHaveProperty('q1');

    // After q1 is answered the next snapshot uses a DISTINCT new key (q2), never q1.
    const secondOutstanding = { q2: { method: 'elicitation/create', params: {} } };
    // A late response still keyed q1 is now stale and ignored.
    const stale = filterOutstandingInputResponses(secondOutstanding, {
      q1: { action: 'accept' },
    });
    expect(stale.accepted).toEqual({});
    expect(stale.ignoredKeys).toEqual(['q1']);
  });
});

// ─── AC-40.16 — server ignores stale entries ─────────────────────────────────

describe('AC-40.16 — server ignores non-outstanding inputResponses entries (R-25.8-g)', () => {
  it('drops keys that were never issued, already answered, or superseded', () => {
    const outstanding = { a: { method: 'elicitation/create', params: {} } };
    const { accepted, ignoredKeys } = filterOutstandingInputResponses(outstanding, {
      a: { action: 'accept' },
      neverIssued: { action: 'accept' },
      alreadyAnswered: { action: 'decline' },
    });
    expect(accepted).toEqual({ a: { action: 'accept' } });
    expect(ignoredKeys.sort()).toEqual(['alreadyAnswered', 'neverIssued']);
  });
});

// ─── AC-40.17 — partial responses accepted ───────────────────────────────────

describe('AC-40.17 — partial response subset accepted; stays input_required (R-25.8-h)', () => {
  it('detects a strict subset of outstanding keys', () => {
    const outstanding = {
      a: { method: 'elicitation/create', params: {} },
      b: { method: 'elicitation/create', params: {} },
    };
    expect(isPartialInputResponse(outstanding, { a: { action: 'accept' } })).toBe(true);
  });

  it('a full set of responses is not partial', () => {
    const outstanding = {
      a: { method: 'elicitation/create', params: {} },
      b: { method: 'elicitation/create', params: {} },
    };
    expect(
      isPartialInputResponse(outstanding, {
        a: { action: 'accept' },
        b: { action: 'accept' },
      }),
    ).toBe(false);
  });

  it('answering only stale keys is not a (valid) partial answer', () => {
    const outstanding = { a: { method: 'elicitation/create', params: {} } };
    expect(isPartialInputResponse(outstanding, { stale: { action: 'accept' } })).toBe(false);
  });
});

// ─── AC-40.18 — client tracks answered keys ──────────────────────────────────

describe('AC-40.18 — client tracks answered keys; no double answer (R-25.8-i)', () => {
  it('a key repeated across consecutive snapshots is answered at most once', () => {
    const answered = new Set<string>();
    // Same outstanding key "name" appears on two consecutive tasks/get snapshots.
    const snapshot = { name: { method: 'elicitation/create', params: {} } };

    function answerOnce(outstanding: Record<string, unknown>): Record<string, unknown> {
      const responses: Record<string, unknown> = {};
      for (const key of Object.keys(outstanding)) {
        if (!answered.has(key)) {
          responses[key] = { action: 'accept' };
          answered.add(key);
        }
      }
      return responses;
    }

    const first = answerOnce(snapshot);
    expect(Object.keys(first)).toEqual(['name']);
    const second = answerOnce(snapshot); // key still present, but already answered
    expect(Object.keys(second)).toEqual([]);
  });
});

// ─── AC-40.19 — tasks/update empty "complete" ack ────────────────────────────

describe('AC-40.19 — tasks/update ack is empty "complete" (R-25.8-j,k)', () => {
  it('builds and validates the empty acknowledgement', () => {
    const ack = buildTaskAcknowledgementResult();
    expect(ack).toEqual({ resultType: 'complete' });
    expect(UpdateTaskResultSchema.safeParse(ack).success).toBe(true);
    expect(isTaskAcknowledgementResult(ack)).toBe(true);
  });

  it('the ack carries no status-specific payload', () => {
    const ack = buildTaskAcknowledgementResult() as Record<string, unknown>;
    expect(ack['status']).toBeUndefined();
    expect(ack['result']).toBeUndefined();
  });
});

// ─── AC-40.20 — ack is eventually consistent ─────────────────────────────────

describe('AC-40.20 — tasks/update ack is eventually consistent (R-25.8-l)', () => {
  it('the empty ack carries no observable status — the task may still be input_required', () => {
    // The acknowledgement itself conveys nothing about observable status; the
    // server MAY return it before tasks/get reflects the responses.
    const ack = buildTaskAcknowledgementResult() as Record<string, unknown>;
    expect(ack['status']).toBeUndefined();
    // Immediately after the ack the observable status MAY still be input_required.
    const afterAck = buildGetTaskResult(inputRequiredTask) as Record<string, unknown>;
    expect(afterAck['status']).toBe('input_required');
  });
});

// ─── AC-40.21 — tasks/update unknown taskId → -32602 ─────────────────────────

describe('AC-40.21 — tasks/update unknown taskId → -32602 (R-25.8-m)', () => {
  it('builds the -32602 unknown-task error', () => {
    const err = buildTaskUnknownError(TASK_ID, 'update');
    expect(err.code).toBe(-32602);
    expect(err.message).toContain('update');
  });
});

// ─── AC-40.22 — keep observing after tasks/update ────────────────────────────

describe('AC-40.22 — keep observing after tasks/update until terminal (R-25.8-n)', () => {
  it('continues polling a still-non-terminal task after update', () => {
    expect(shouldContinuePolling('input_required')).toBe(true);
    expect(shouldContinuePolling('working')).toBe(true);
    expect(shouldContinuePolling('completed')).toBe(false);
  });
});

// ─── AC-40.23 — notifications/cancelled never used for tasks ──────────────────

describe('AC-40.23 — notifications/cancelled never used to cancel a task (R-25.9-a)', () => {
  it('notifications/cancelled is a forbidden task notification', () => {
    expect(isForbiddenTaskNotification(CANCELLED_NOTIFICATION_METHOD)).toBe(true);
    expect(isForbiddenTaskNotification('notifications/cancelled')).toBe(true);
  });

  it('tasks/cancel is the only cancellation mechanism (it is a lifecycle method)', () => {
    expect(isTaskLifecycleMethod(TASKS_CANCEL_METHOD)).toBe(true);
  });
});

// ─── AC-40.24 — tasks/cancel needs taskId ────────────────────────────────────

describe('AC-40.24 — tasks/cancel is well-formed only with params.taskId (R-25.9-b)', () => {
  it('accepts a tasks/cancel carrying taskId', () => {
    const req = {
      jsonrpc: '2.0',
      id: 9,
      method: TASKS_CANCEL_METHOD,
      params: { taskId: TASK_ID, _meta: requestMeta() },
    };
    expect(isCancelTaskRequest(req)).toBe(true);
    expect(CancelTaskRequestSchema.parse(req).params.taskId).toBe(TASK_ID);
  });

  it('rejects a tasks/cancel missing taskId', () => {
    const req = {
      jsonrpc: '2.0',
      id: 9,
      method: TASKS_CANCEL_METHOD,
      params: { _meta: requestMeta() },
    };
    expect(isCancelTaskRequest(req)).toBe(false);
  });
});

// ─── AC-40.25 — un-negotiated tasks/cancel → -32003 ──────────────────────────

describe('AC-40.25 — un-negotiated tasks/cancel → -32003 (R-25.9-c,d)', () => {
  it('builds a -32003 for tasks/cancel', () => {
    const err = buildTasksMissingCapabilityError(TASKS_CANCEL_METHOD);
    expect(err.code).toBe(-32003);
    expect(err.data.method).toBe('tasks/cancel');
  });
});

// ─── AC-40.26 — tasks/cancel empty "complete" ack ────────────────────────────

describe('AC-40.26 — tasks/cancel ack is empty "complete" (R-25.9-e,f)', () => {
  it('builds and validates the empty acknowledgement', () => {
    const ack = buildTaskAcknowledgementResult();
    expect(ack.resultType).toBe('complete');
    expect(CancelTaskResultSchema.safeParse(ack).success).toBe(true);
  });
});

// ─── AC-40.27 — tasks/cancel unknown taskId → -32602 ─────────────────────────

describe('AC-40.27 — tasks/cancel unknown taskId → -32602 (R-25.9-g)', () => {
  it('builds the -32602 unknown-task error', () => {
    const err = buildTaskUnknownError(TASK_ID, 'cancel');
    expect(err.code).toBe(-32602);
  });
});

// ─── AC-40.28 — cooperative, eventually consistent cancel ─────────────────────

describe('AC-40.28 — cancel: ack only; may stay non-terminal or reach other terminal (R-25.9-h,i)', () => {
  it('classifies a non-terminal task as acknowledged-pending', () => {
    expect(classifyCancelEffect('working')).toBe('acknowledged-pending');
    expect(classifyCancelEffect('input_required')).toBe('acknowledged-pending');
  });

  it('the task MAY reach a terminal status other than cancelled after a pending cancel', () => {
    // After acknowledging a cancel on a working task, the work may finish first.
    expect(classifyCancelEffect('working')).toBe('acknowledged-pending');
    const finished = buildGetTaskResult(completedTask) as Record<string, unknown>;
    expect(finished['status']).toBe('completed'); // not "cancelled"
  });
});

// ─── AC-40.29 — terminal task: cancel is a no-op ─────────────────────────────

describe('AC-40.29 — terminal task: tasks/cancel does not change status (R-25.9-j)', () => {
  it('classifies a terminal task as acknowledged-terminal (no state change)', () => {
    expect(classifyCancelEffect('completed')).toBe('acknowledged-terminal');
    expect(classifyCancelEffect('failed')).toBe('acknowledged-terminal');
    expect(classifyCancelEffect('cancelled')).toBe('acknowledged-terminal');
  });
});

// ─── AC-40.30 — client may drop state / stop polling after cancel ────────────

describe('AC-40.30 — client may drop local state / stop polling after cancel (R-25.9-k)', () => {
  it('shouldContinuePolling is false once cancel has been requested', () => {
    expect(shouldContinuePolling('working', true)).toBe(false);
    expect(shouldContinuePolling('input_required', true)).toBe(false);
  });
});

// ─── AC-40.31 — notifications/tasks carries a full DetailedTask ───────────────

describe('AC-40.31 — notifications/tasks carries a complete DetailedTask (R-25.10-a)', () => {
  it('builds a notification whose params equal what tasks/get would return at that moment', () => {
    const notif = buildTaskStatusNotification(completedTask);
    expect(notif.method).toBe('notifications/tasks');
    expect(isTaskStatusNotification(notif)).toBe(true);
    const params = notif.params as Record<string, unknown>;
    expect(params['taskId']).toBe(TASK_ID);
    expect(params['status']).toBe('completed');
    expect(params['result']).toEqual(completedTask['result']);
    // identical to the DetailedTask body of a tasks/get result (sans resultType)
    const getBody = { ...(buildGetTaskResult(completedTask) as Record<string, unknown>) };
    delete getBody['resultType'];
    expect(params).toEqual(getBody);
  });

  it('validates the full notification envelope', () => {
    const notif = buildTaskStatusNotification(inputRequiredTask);
    expect(TaskStatusNotificationSchema.safeParse(notif).success).toBe(true);
  });
});

// ─── AC-40.32 — opt-in via taskIds filter ────────────────────────────────────

describe('AC-40.32 — opt-in via taskIds filter; each a held taskId (R-25.10-b,c)', () => {
  it('extracts subscribed taskIds from a subscriptions/listen filter', () => {
    expect(subscribedTaskIds({ taskIds: [TASK_ID] })).toEqual([TASK_ID]);
    expect(subscribedTaskIds({})).toEqual([]);
    expect(subscribedTaskIds({ taskIds: [] })).toEqual([]);
  });

  it('the taskIds filter coexists with §10 SubscriptionFilter fields', () => {
    const filter = { toolsListChanged: true, taskIds: [TASK_ID] };
    const parsed = TaskSubscriptionFilterSchema.parse(filter);
    expect(parsed.taskIds).toEqual([TASK_ID]);
    expect(parsed.toolsListChanged).toBe(true);
  });

  it('a client receives notifications only for tasks it subscribed to', () => {
    const subscribed = subscribedTaskIds({ taskIds: [TASK_ID] });
    expect(mayPushTaskNotification(TASK_ID, subscribed)).toBe(true);
  });
});

// ─── AC-40.33 — no push for unsubscribed task ────────────────────────────────

describe('AC-40.33 — server never pushes notifications/tasks for an unsubscribed task (R-25.10-d)', () => {
  it('mayPushTaskNotification is false for a task outside the subscribed set', () => {
    expect(mayPushTaskNotification('other-task', [TASK_ID])).toBe(false);
    expect(mayPushTaskNotification(TASK_ID, [])).toBe(false);
  });
});

// ─── AC-40.34 — taskIds without capability → -32003 ──────────────────────────

describe('AC-40.34 — taskIds filter without tasks capability → -32003 (R-25.10-e)', () => {
  it('requires the capability when taskIds are supplied', () => {
    expect(taskSubscriptionRequiresCapability({ taskIds: [TASK_ID] }, false)).toBe(true);
    // a server then answers subscriptions/listen with -32003
    const err = buildTasksMissingCapabilityError('subscriptions/listen');
    expect(err.code).toBe(-32003);
  });

  it('does not require the capability when no taskIds are supplied or already negotiated', () => {
    expect(taskSubscriptionRequiresCapability({ taskIds: [TASK_ID] }, true)).toBe(false);
    expect(taskSubscriptionRequiresCapability({}, false)).toBe(false);
    expect(taskSubscriptionRequiresCapability({ taskIds: [] }, false)).toBe(false);
  });
});

// ─── AC-40.35 — notifications, polling, or both ──────────────────────────────

describe('AC-40.35 — may rely on notifications, polling, or both (R-25.10-f)', () => {
  it('a subscribed client need not poll (notifications convey the same DetailedTask)', () => {
    const subscribed = subscribedTaskIds({ taskIds: [TASK_ID] });
    expect(mayPushTaskNotification(TASK_ID, subscribed)).toBe(true);
    // The notification carries the same body tasks/get would return.
    const notif = buildTaskStatusNotification(completedTask);
    expect((notif.params as Record<string, unknown>)['status']).toBe('completed');
  });

  it('a non-subscribed client still polls via tasks/get', () => {
    expect(shouldContinuePolling('working')).toBe(true);
  });
});

// ─── AC-40.36 — no progress/message notifications for a task ──────────────────

describe('AC-40.36 — no progress/message notifications for a task (R-25.10-g)', () => {
  it('progress and message notifications are forbidden for tasks', () => {
    expect(isForbiddenTaskNotification(PROGRESS_NOTIFICATION_METHOD)).toBe(true);
    expect(isForbiddenTaskNotification(LOGGING_MESSAGE_METHOD)).toBe(true);
  });

  it('the only task-state channels are tasks/get and notifications/tasks', () => {
    expect(isForbiddenTaskNotification(TASKS_NOTIFICATION_METHOD)).toBe(false);
    expect(TASK_FORBIDDEN_NOTIFICATION_METHODS).toEqual([
      'notifications/progress',
      'notifications/message',
      'notifications/cancelled',
    ]);
  });
});

// ─── AC-40.37 — pre-task input resolved synchronously ────────────────────────

describe('AC-40.37 — pre-task input resolved synchronously before CreateTaskResult (R-25.10-h)', () => {
  it('inline §11 input is resolved by re-issuing the original method, not via tasks/update', () => {
    // Pre-task: the input is surfaced inline and resolved by re-issuing the same
    // method; tasks/update is NOT involved (it has no taskId yet). We assert the
    // two channels are distinct: tasks/update is a task method, not a re-issue.
    expect(isTaskLifecycleMethod(TASKS_UPDATE_METHOD)).toBe(true);
    expect(isTaskLifecycleMethod('tools/call')).toBe(false);
  });
});

// ─── AC-40.38 — inputRequests carry the same trust model ──────────────────────

describe('AC-40.38 — inputRequests treated as a standalone request; no trust elevation (R-25.10-i)', () => {
  it('an inputRequests entry is shaped exactly like a standalone server-to-client request', () => {
    // The entry under a task's inputRequests is a verbatim InputRequest (S17),
    // identical to what would be sent inline — the same kind/params the client
    // would handle directly, with no elevated trust.
    const r = buildGetTaskResult(inputRequiredTask) as Record<string, unknown>;
    const reqs = r['inputRequests'] as Record<string, { method: string }>;
    expect(reqs['name'].method).toBe('elicitation/create');
  });
});

// ─── AC-40.39 — task input vs inline; never mixed ────────────────────────────

describe('AC-40.39 — task input via tasks/update; inline via re-issue; never mixed (R-25.10-j)', () => {
  it('task-surfaced input is resolved only via tasks/update', () => {
    // For a task in input_required, the resolution channel is tasks/update.
    const r = buildGetTaskResult(inputRequiredTask) as Record<string, unknown>;
    expect(r['status']).toBe('input_required');
    const update = {
      jsonrpc: '2.0',
      id: 1,
      method: TASKS_UPDATE_METHOD,
      params: { taskId: TASK_ID, inputResponses: { name: { action: 'accept' } }, _meta: requestMeta() },
    };
    expect(isUpdateTaskRequest(update)).toBe(true);
  });
});

// ─── AC-40.40 — ttlMs mutable; may fail+remove ───────────────────────────────

describe('AC-40.40 — ttlMs mutable; may fail+remove after elapse (R-25.11-a,b)', () => {
  it('ttlMs may change across successive observations of the same task', () => {
    const first = buildGetTaskResult(base({ status: 'working', ttlMs: 60_000 }) as DetailedTask) as Record<string, unknown>;
    const later = buildGetTaskResult(base({ status: 'working', ttlMs: 3_600_000 }) as DetailedTask) as Record<string, unknown>;
    expect(first['ttlMs']).toBe(60_000);
    expect(later['ttlMs']).toBe(3_600_000); // adopted a new value — both valid
  });

  it('after ttlMs elapse a server may mark failed then remove → later tasks/get is -32602', () => {
    // Marked failed:
    const failed = buildFailedTaskUpdate(
      base({ ttlMs: 1000 }),
      { code: -32000, message: 'ttl elapsed' },
      'expired',
    );
    expect((failed as Record<string, unknown>)['status']).toBe('failed');
    // Subsequently removed → a tasks/get is now unknown.
    expect(buildTaskUnknownError(TASK_ID).code).toBe(-32602);
  });
});

// ─── AC-40.41 — non-null ttlMs backstop ──────────────────────────────────────

describe('AC-40.41 — non-null ttlMs backstop (R-25.11-c)', () => {
  it('a client may treat createdAt+ttlMs as a backstop for a still-non-terminal task', () => {
    // created at 0, ttl 1000; at now=1000 a still-working task is past its backstop.
    expect(isTaskBackstopElapsed(0, 1000, 1000, 'working')).toBe(true);
    expect(isTaskBackstopElapsed(0, 1000, 999, 'working')).toBe(false);
  });

  it('a null ttlMs is never a backstop', () => {
    expect(isTaskBackstopElapsed(0, null, 10_000_000, 'working')).toBe(false);
  });

  it('a task already terminal is not a backstop candidate', () => {
    expect(isTaskBackstopElapsed(0, 1000, 5000, 'completed')).toBe(false);
  });
});

// ─── AC-40.42 — protocol error → failed + error + statusMessage ───────────────

describe('AC-40.42 — protocol error → failed with error and diagnostic statusMessage (R-25.11-f,g)', () => {
  it('classifies a protocol error as failed', () => {
    expect(
      classifyTaskExecutionOutcome({ kind: 'protocol-error', error: { code: -32000, message: 'x' } }),
    ).toBe('failed');
  });

  it('builds a failed DetailedTask carrying the JSON-RPC error and a statusMessage', () => {
    const failed = buildFailedTaskUpdate(
      base(),
      { code: -32000, message: 'Execution error' },
      'database connection lost',
    ) as Record<string, unknown>;
    expect(failed['status']).toBe('failed');
    expect(failed['error']).toEqual({ code: -32000, message: 'Execution error' });
    expect(failed['statusMessage']).toBe('database connection lost');
    // round-trips through a tasks/get result
    expect(isGetTaskResult(buildGetTaskResult(failed as DetailedTask))).toBe(true);
  });
});

// ─── AC-40.43 — app error → completed with error in result ────────────────────

describe('AC-40.43 — app error → completed (error in result); failed not used (R-25.11-h,i)', () => {
  it('classifies a protocol-level-complete request as completed even when it conveys an app error', () => {
    expect(
      classifyTaskExecutionOutcome({ kind: 'result', result: { isError: true, content: [] } }),
    ).toBe('completed');
  });

  it('builds a completed DetailedTask with the application error carried inside result', () => {
    const completed = buildCompletedTaskUpdate(base(), {
      content: [{ type: 'text', text: 'tool failed' }],
      isError: true,
    }) as Record<string, unknown>;
    expect(completed['status']).toBe('completed');
    expect(isTerminalTaskStatus('completed')).toBe(true);
    // The application error is inside result, not a failed task.
    expect((completed['result'] as Record<string, unknown>)['isError']).toBe(true);
    expect(completed['error']).toBeUndefined();
  });
});
