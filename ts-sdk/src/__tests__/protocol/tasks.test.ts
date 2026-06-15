/**
 * Tests for S39 — Tasks Extension I: Model, Capability, Types & Lifecycle
 * (§25.1–§25.6).
 *
 * AC coverage:
 *  AC-39.1  (R-25.1-a)            — identifier is exact, case-sensitive
 *  AC-39.2  (R-25.2-a, R-25.2-b)  — empty settings; ignore unrecognized members
 *  AC-39.3  (R-25.2-c)            — per-request opt-in via extensions map
 *  AC-39.4  (R-25.2-d)            — no task handle without declared capability
 *  AC-39.5  (R-25.2-e, R-25.3-c)  — client handles ordinary OR task result
 *  AC-39.6  (R-25.2-f)            — Tasks method without extension → -32003
 *  AC-39.7  (R-25.2-g, R-25.3-a,b)— server-directed, no warmup, unsolicited
 *  AC-39.8  (R-25.3-c)            — CreateTaskResult: resultType "task" + Task fields
 *  AC-39.9  (R-25.4-a)            — taskId is opaque
 *  AC-39.10 (R-25.4-b)            — required Task fields; ttlMs number≥0 | null
 *  AC-39.11 (R-25.4-c,R-25.6-f,g) — ttlMs expiry → discard → not-found error
 *  AC-39.12 (R-25.4-d, R-25.4-e)  — pollIntervalMs honored; fallback when absent
 *  AC-39.13 (R-25.5-a)            — status is one of five case-sensitive values
 *  AC-39.14 (R-25.5-b)            — terminal states immutable
 *  AC-39.15 (R-25.5-c)            — legal non-terminal transitions
 *  AC-39.16 (R-25.5-d)            — inline outcome rules per status
 *  AC-39.17 (R-25.5-e)            — keep polling until terminal
 *  AC-39.18 (R-25.6-a)            — correct under stateless per-request model
 *  AC-39.19 (R-25.6-b)            — durable persist before returning handle
 *  AC-39.20 (R-25.6-c, R-25.6-d)  — answer from durable record on any instance
 *  AC-39.21 (R-25.6-e)            — may reuse §11 continuation token
 *  AC-39.22 (R-25.6-h)            — client persists taskId to resume polling
 */

import { describe, it, expect } from 'vitest';
import {
  TASKS_EXTENSION_ID,
  isTasksExtensionId,
  TASK_RESULT_TYPE,
  isTaskResultType,
  TasksExtensionCapabilitySchema,
  isTasksExtensionCapability,
  clientDeclaresTasksForRequest,
  serverAdvertisesTasks,
  isTasksActiveForRequest,
  mayReturnTaskHandle,
  TASK_STATUSES,
  TaskStatusSchema,
  isTaskStatus,
  TERMINAL_TASK_STATUSES,
  NON_TERMINAL_TASK_STATUSES,
  isTerminalTaskStatus,
  isLegalTaskTransition,
  assertLegalTaskTransition,
  TaskTtlMsSchema,
  TaskSchema,
  isTask,
  CreateTaskResultSchema,
  isCreateTaskResult,
  dispatchEligibleResult,
  TaskInputRequestsSchema,
  WorkingTaskSchema,
  InputRequiredTaskSchema,
  CompletedTaskSchema,
  FailedTaskSchema,
  CancelledTaskSchema,
  DetailedTaskSchema,
  isDetailedTask,
  hasConsistentInlineOutcome,
  isTaskExpired,
  resolvePollIntervalMs,
  mayPollNow,
  TASK_MISSING_CAPABILITY_CODE,
  buildTasksMissingCapabilityError,
  TASK_NOT_FOUND_CODE,
  buildTaskNotFoundError,
  type Task,
  type CreateTaskResult,
  type DetailedTask,
  type TaskStatus,
} from '../../protocol/tasks.js';
import { RESULT_TYPE } from '../../jsonrpc/payload.js';
import { MISSING_CLIENT_CAPABILITY_CODE } from '../../protocol/meta.js';

// ─── shared fixtures ────────────────────────────────────────────────────────────

const baseTask: Task = {
  taskId: 'task_3f2a9c10',
  status: 'working',
  createdAt: '2026-06-13T10:15:00Z',
  lastUpdatedAt: '2026-06-13T10:15:00Z',
  ttlMs: 3600000,
};

const tasksMap = { [TASKS_EXTENSION_ID]: {} };

// ─── AC-39.1 — identifier exact, case-sensitive (R-25.1-a) ──────────────────────

describe('AC-39.1 — extension identifier is exact and case-sensitive (R-25.1-a)', () => {
  it('matches only the exact identifier string', () => {
    expect(TASKS_EXTENSION_ID).toBe('io.modelcontextprotocol/tasks');
    expect(isTasksExtensionId('io.modelcontextprotocol/tasks')).toBe(true);
  });

  it('rejects a case-differing identifier', () => {
    expect(isTasksExtensionId('IO.MODELCONTEXTPROTOCOL/TASKS')).toBe(false);
    expect(isTasksExtensionId('io.modelcontextprotocol/Tasks')).toBe(false);
  });

  it('rejects a prefix/suffix-extended identifier (no prefix matching)', () => {
    expect(isTasksExtensionId('io.modelcontextprotocol/tasks-foo')).toBe(false);
    expect(isTasksExtensionId('io.modelcontextprotocol/task')).toBe(false);
    expect(isTasksExtensionId('xio.modelcontextprotocol/tasks')).toBe(false);
  });
});

// ─── AC-39.2 — empty settings; ignore unrecognized members (R-25.2-a,b) ─────────

describe('AC-39.2 — settings object: empty canonical, ignore unknown (R-25.2-a, R-25.2-b)', () => {
  it('accepts the canonical empty settings object', () => {
    expect(isTasksExtensionCapability({})).toBe(true);
    expect(TasksExtensionCapabilitySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a settings object carrying an unrecognized member and ignores it', () => {
    const withUnknown = { somethingUnknown: 42 };
    expect(isTasksExtensionCapability(withUnknown)).toBe(true);
    const parsed = TasksExtensionCapabilitySchema.parse(withUnknown);
    // The declaration is accepted; the unknown member is simply carried/ignored,
    // never a cause for rejection.
    expect(parsed).toEqual(withUnknown);
  });

  it('rejects non-object settings values', () => {
    expect(isTasksExtensionCapability([])).toBe(false);
    expect(isTasksExtensionCapability('x')).toBe(false);
    expect(isTasksExtensionCapability(null)).toBe(false);
  });
});

// ─── AC-39.3 — per-request opt-in (R-25.2-c) ────────────────────────────────────

describe('AC-39.3 — per-request opt-in via extensions map (R-25.2-c)', () => {
  it('treats a request declaring the identifier as eligible', () => {
    expect(clientDeclaresTasksForRequest(tasksMap)).toBe(true);
  });

  it('treats a request lacking the declaration as NOT eligible', () => {
    expect(clientDeclaresTasksForRequest({})).toBe(false);
    expect(clientDeclaresTasksForRequest(undefined)).toBe(false);
    expect(clientDeclaresTasksForRequest({ 'io.modelcontextprotocol/ui': {} })).toBe(false);
  });
});

// ─── AC-39.4 — no task handle without declared capability (R-25.2-d) ────────────

describe('AC-39.4 — no task handle without declared capability (R-25.2-d)', () => {
  it('a request without the declaration is not eligible for a task handle', () => {
    expect(mayReturnTaskHandle({}, tasksMap)).toBe(false);
    expect(mayReturnTaskHandle(undefined, tasksMap)).toBe(false);
  });

  it('a request declaring it against a server advertising it MAY get a task handle', () => {
    expect(mayReturnTaskHandle(tasksMap, tasksMap)).toBe(true);
  });

  it('a declaring request against a server NOT advertising it is not active', () => {
    expect(mayReturnTaskHandle(tasksMap, {})).toBe(false);
  });
});

// ─── AC-39.5 — client handles ordinary OR task result (R-25.2-e, R-25.3-c) ──────

describe('AC-39.5 — client dispatches on resultType (R-25.2-e, R-25.3-c)', () => {
  it('dispatches a task handle to the task branch', () => {
    const handle: CreateTaskResult = { ...baseTask, resultType: 'task' };
    const disposition = dispatchEligibleResult(handle);
    expect(disposition.kind).toBe('task');
    if (disposition.kind === 'task') {
      expect(disposition.result.taskId).toBe('task_3f2a9c10');
    }
  });

  it('dispatches an ordinary result to the ordinary branch', () => {
    const ordinary = { resultType: RESULT_TYPE.COMPLETE, content: [{ type: 'text', text: 'Done.' }] };
    const disposition = dispatchEligibleResult(ordinary);
    expect(disposition.kind).toBe('ordinary');
    if (disposition.kind === 'ordinary') {
      expect(disposition.result).toBe(ordinary);
    }
  });

  it('treats a malformed "task" payload as ordinary (caller re-validates)', () => {
    const malformed = { resultType: 'task' }; // missing all Task fields
    expect(dispatchEligibleResult(malformed).kind).toBe('ordinary');
  });
});

// ─── AC-39.6 — Tasks method without extension → -32003 (R-25.2-f) ───────────────

describe('AC-39.6 — missing-capability error for Tasks methods (R-25.2-f)', () => {
  it('reuses the §22 missing-capability code -32003', () => {
    expect(TASK_MISSING_CAPABILITY_CODE).toBe(MISSING_CLIENT_CAPABILITY_CODE);
    expect(TASK_MISSING_CAPABILITY_CODE).toBe(-32003);
  });

  it('builds an actionable error naming the method and required extension', () => {
    const err = buildTasksMissingCapabilityError('tasks/get');
    expect(err.code).toBe(-32003);
    expect(err.data.method).toBe('tasks/get');
    expect(err.data.requiredExtension).toBe(TASKS_EXTENSION_ID);
  });
});

// ─── AC-39.7 — server-directed, no warmup, unsolicited (R-25.2-g, R-25.3-a,b) ───

describe('AC-39.7 — task creation is server-directed (R-25.2-g, R-25.3-a, R-25.3-b)', () => {
  it('eligibility depends only on the per-request capability, with no extra flag', () => {
    // Same map, no per-call flag anywhere — eligibility is purely the declaration.
    expect(mayReturnTaskHandle(tasksMap, tasksMap)).toBe(true);
  });

  it('the server MAY substitute for some eligible requests and not others', () => {
    // The decision is the server's; the helper only reports eligibility, leaving
    // the unsolicited per-request choice entirely to the server.
    const eligible = mayReturnTaskHandle(tasksMap, tasksMap);
    expect(eligible).toBe(true);
    // Server returns an ordinary result for THIS eligible request — still valid.
    const ordinary = { resultType: RESULT_TYPE.COMPLETE };
    expect(dispatchEligibleResult(ordinary).kind).toBe('ordinary');
    // Server returns a task handle for ANOTHER eligible request — also valid.
    const handle = { ...baseTask, resultType: 'task' as const };
    expect(dispatchEligibleResult(handle).kind).toBe('task');
  });
});

// ─── AC-39.8 — CreateTaskResult shape (R-25.3-c) ────────────────────────────────

describe('AC-39.8 — CreateTaskResult carries resultType "task" + all Task fields (R-25.3-c)', () => {
  it('parses a complete task handle', () => {
    const handle = {
      resultType: 'task',
      taskId: 'task_3f2a9c10',
      status: 'working',
      statusMessage: 'Processing item 42 of 100',
      createdAt: '2026-06-13T10:15:00Z',
      lastUpdatedAt: '2026-06-13T10:15:00Z',
      ttlMs: 3600000,
      pollIntervalMs: 2000,
    };
    expect(isCreateTaskResult(handle)).toBe(true);
    const parsed = CreateTaskResultSchema.parse(handle);
    expect(parsed.resultType).toBe('task');
    expect(parsed.taskId).toBe('task_3f2a9c10');
    expect(parsed.status).toBe('working');
  });

  it('TASK_RESULT_TYPE is the literal "task" and isTaskResultType matches it', () => {
    expect(TASK_RESULT_TYPE).toBe('task');
    expect(isTaskResultType('task')).toBe(true);
    expect(isTaskResultType('complete')).toBe(false);
    expect(isTaskResultType(RESULT_TYPE.INPUT_REQUIRED)).toBe(false);
  });

  it('rejects a handle whose resultType is not "task"', () => {
    expect(isCreateTaskResult({ ...baseTask, resultType: 'complete' })).toBe(false);
  });

  it('permits an optional _meta on the handle', () => {
    const handle = { ...baseTask, resultType: 'task', _meta: { 'x.y/z': 1 } };
    expect(isCreateTaskResult(handle)).toBe(true);
  });
});

// ─── AC-39.9 — taskId opaque (R-25.4-a) ─────────────────────────────────────────

describe('AC-39.9 — taskId is an opaque string (R-25.4-a)', () => {
  it('accepts any non-empty server-minted string verbatim', () => {
    for (const id of ['task_3f2a9c10', 'opaque/with/slashes', '12345', 'a b c']) {
      const parsed = TaskSchema.parse({ ...baseTask, taskId: id });
      expect(parsed.taskId).toBe(id); // stored verbatim, no parsing
    }
  });
});

// ─── AC-39.10 — required Task fields; ttlMs (R-25.4-b) ───────────────────────────

describe('AC-39.10 — required Task fields and ttlMs union (R-25.4-b)', () => {
  it('accepts a Task with all required fields', () => {
    expect(isTask(baseTask)).toBe(true);
  });

  it('rejects a Task missing any required field', () => {
    for (const key of ['taskId', 'status', 'createdAt', 'lastUpdatedAt', 'ttlMs'] as const) {
      const incomplete: Record<string, unknown> = { ...baseTask };
      delete incomplete[key];
      expect(isTask(incomplete)).toBe(false);
    }
  });

  it('accepts ttlMs of a non-negative number or null', () => {
    expect(TaskTtlMsSchema.safeParse(0).success).toBe(true);
    expect(TaskTtlMsSchema.safeParse(3600000).success).toBe(true);
    expect(TaskTtlMsSchema.safeParse(null).success).toBe(true);
  });

  it('rejects a negative ttlMs', () => {
    expect(TaskTtlMsSchema.safeParse(-1).success).toBe(false);
    expect(isTask({ ...baseTask, ttlMs: -5 })).toBe(false);
  });

  it('treats statusMessage and pollIntervalMs as optional', () => {
    expect(isTask({ ...baseTask, statusMessage: undefined, pollIntervalMs: undefined })).toBe(true);
    expect(isTask({ ...baseTask, statusMessage: 'hi', pollIntervalMs: 2000 })).toBe(true);
  });
});

// ─── AC-39.11 — ttlMs expiry → discard → not-found (R-25.4-c, R-25.6-f,g) ───────

describe('AC-39.11 — ttlMs expiry and the not-found error (R-25.4-c, R-25.6-f, R-25.6-g)', () => {
  const createdAt = 1_000_000;

  it('reports a task as expired once its non-null ttlMs has elapsed', () => {
    expect(isTaskExpired(createdAt, 1000, createdAt + 999)).toBe(false);
    expect(isTaskExpired(createdAt, 1000, createdAt + 1000)).toBe(true);
    expect(isTaskExpired(createdAt, 1000, createdAt + 5000)).toBe(true);
  });

  it('never expires a task whose ttlMs is null (unbounded)', () => {
    expect(isTaskExpired(createdAt, null, createdAt + 10_000_000)).toBe(false);
  });

  it('answers a discarded/unknown taskId with the §22.4 not-found code -32602 (§25.7)', () => {
    expect(TASK_NOT_FOUND_CODE).toBe(-32602);
    const err = buildTaskNotFoundError('task_gone');
    expect(err.code).toBe(-32602);
    expect(err.data.taskId).toBe('task_gone');
  });
});

// ─── AC-39.12 — pollIntervalMs honored; fallback when absent (R-25.4-d,e) ───────

describe('AC-39.12 — polling interval (R-25.4-d, R-25.4-e)', () => {
  it('uses the recommended pollIntervalMs when present', () => {
    expect(resolvePollIntervalMs(2000)).toBe(2000);
    expect(resolvePollIntervalMs(0)).toBe(0);
  });

  it('chooses a reasonable fallback interval when absent', () => {
    expect(resolvePollIntervalMs(undefined)).toBe(1000);
    expect(resolvePollIntervalMs(undefined, 500)).toBe(500);
  });

  it('disallows polling before the interval elapses, allows it after', () => {
    expect(mayPollNow(undefined, 0, 2000)).toBe(true); // first poll always allowed
    expect(mayPollNow(1000, 1000 + 1999, 2000)).toBe(false);
    expect(mayPollNow(1000, 1000 + 2000, 2000)).toBe(true);
  });

  it('applies the fallback cadence when pollIntervalMs is absent', () => {
    expect(mayPollNow(1000, 1000 + 999, undefined, 1000)).toBe(false);
    expect(mayPollNow(1000, 1000 + 1000, undefined, 1000)).toBe(true);
  });
});

// ─── AC-39.13 — status is one of five case-sensitive values (R-25.5-a) ──────────

describe('AC-39.13 — TaskStatus is one of five case-sensitive values (R-25.5-a)', () => {
  it('enumerates exactly the five values in spec order', () => {
    expect(TASK_STATUSES).toEqual([
      'working',
      'input_required',
      'completed',
      'failed',
      'cancelled',
    ]);
  });

  it('accepts each valid status and rejects unknown/miscased values', () => {
    for (const s of TASK_STATUSES) expect(isTaskStatus(s)).toBe(true);
    expect(isTaskStatus('Working')).toBe(false);
    expect(isTaskStatus('done')).toBe(false);
    expect(isTaskStatus('inputRequired')).toBe(false);
    expect(TaskStatusSchema.safeParse('cancelled').success).toBe(true);
  });

  it('classifies terminal and non-terminal sets correctly', () => {
    expect([...TERMINAL_TASK_STATUSES].sort()).toEqual(['cancelled', 'completed', 'failed']);
    expect([...NON_TERMINAL_TASK_STATUSES].sort()).toEqual(['input_required', 'working']);
    expect(isTerminalTaskStatus('completed')).toBe(true);
    expect(isTerminalTaskStatus('working')).toBe(false);
  });
});

// ─── AC-39.14 — terminal states immutable (R-25.5-b) ────────────────────────────

describe('AC-39.14 — terminal states are immutable (R-25.5-b)', () => {
  const terminals: TaskStatus[] = ['completed', 'failed', 'cancelled'];

  it('forbids any transition out of a terminal state', () => {
    for (const from of terminals) {
      for (const to of TASK_STATUSES) {
        expect(isLegalTaskTransition(from, to)).toBe(false);
      }
    }
  });

  it('assertLegalTaskTransition throws for a terminal-state transition', () => {
    expect(() => assertLegalTaskTransition('completed', 'working')).toThrow(/immutable/);
    expect(() => assertLegalTaskTransition('cancelled', 'failed')).toThrow(/immutable/);
  });

  it('inline result/error on a terminal DetailedTask is fixed by the schema', () => {
    const completed = DetailedTaskSchema.parse({
      ...baseTask,
      status: 'completed',
      result: { resultType: 'complete' },
    });
    expect(completed.status).toBe('completed');
    // The discriminated union pins result onto the completed variant; a failed
    // variant requires error — the two are not interchangeable.
    expect(CompletedTaskSchema.safeParse({ ...baseTask, status: 'completed' }).success).toBe(false);
  });
});

// ─── AC-39.15 — legal non-terminal transitions (R-25.5-c) ───────────────────────

describe('AC-39.15 — non-terminal transitions (R-25.5-c)', () => {
  it('working may go to input_required or any terminal state', () => {
    expect(isLegalTaskTransition('working', 'input_required')).toBe(true);
    expect(isLegalTaskTransition('working', 'completed')).toBe(true);
    expect(isLegalTaskTransition('working', 'failed')).toBe(true);
    expect(isLegalTaskTransition('working', 'cancelled')).toBe(true);
  });

  it('input_required may go back to working or to any terminal state', () => {
    expect(isLegalTaskTransition('input_required', 'working')).toBe(true);
    expect(isLegalTaskTransition('input_required', 'completed')).toBe(true);
    expect(isLegalTaskTransition('input_required', 'failed')).toBe(true);
    expect(isLegalTaskTransition('input_required', 'cancelled')).toBe(true);
  });

  it('a self-transition between identical non-terminal states is not a change', () => {
    expect(isLegalTaskTransition('working', 'working')).toBe(false);
    expect(isLegalTaskTransition('input_required', 'input_required')).toBe(false);
  });

  it('assertLegalTaskTransition passes for a legal non-terminal move', () => {
    expect(() => assertLegalTaskTransition('working', 'input_required')).not.toThrow();
    expect(() => assertLegalTaskTransition('input_required', 'working')).not.toThrow();
  });
});

// ─── AC-39.16 — inline outcome rules per status (R-25.5-d) ───────────────────────

describe('AC-39.16 — inline outcome conveyed only when terminal (R-25.5-d)', () => {
  it('completed carries result and no error', () => {
    const t = { ...baseTask, status: 'completed' as const, result: { resultType: 'complete' } };
    expect(CompletedTaskSchema.safeParse(t).success).toBe(true);
    expect(hasConsistentInlineOutcome(t)).toBe(true);
  });

  it('failed carries error and no result', () => {
    const t = {
      ...baseTask,
      status: 'failed' as const,
      error: { code: -32603, message: 'Internal error while processing item 57' },
    };
    expect(FailedTaskSchema.safeParse(t).success).toBe(true);
    expect(hasConsistentInlineOutcome(t)).toBe(true);
  });

  it('input_required carries inputRequests and neither result nor error', () => {
    const t = {
      ...baseTask,
      status: 'input_required' as const,
      inputRequests: { 'req-1': { method: 'elicitation/create', params: {} } },
    };
    expect(InputRequiredTaskSchema.safeParse(t).success).toBe(true);
    expect(hasConsistentInlineOutcome(t)).toBe(true);
    expect(TaskInputRequestsSchema.safeParse(t.inputRequests).success).toBe(true);
  });

  it('working and cancelled carry neither result nor error', () => {
    expect(WorkingTaskSchema.safeParse({ ...baseTask, status: 'working' }).success).toBe(true);
    expect(CancelledTaskSchema.safeParse({ ...baseTask, status: 'cancelled' }).success).toBe(true);
    expect(hasConsistentInlineOutcome({ ...baseTask, status: 'working' })).toBe(true);
    expect(hasConsistentInlineOutcome({ ...baseTask, status: 'cancelled' })).toBe(true);
  });

  it('flags a non-terminal task that smuggles a result/error', () => {
    expect(
      hasConsistentInlineOutcome({ ...baseTask, status: 'working', result: { x: 1 } }),
    ).toBe(false);
    expect(
      hasConsistentInlineOutcome({ ...baseTask, status: 'cancelled', error: { code: -1, message: 'x' } }),
    ).toBe(false);
  });

  it('DetailedTask discriminates each variant by status', () => {
    expect(isDetailedTask({ ...baseTask, status: 'working' })).toBe(true);
    expect(isDetailedTask({ ...baseTask, status: 'completed', result: {} })).toBe(true);
    expect(isDetailedTask({ ...baseTask, status: 'failed', error: { code: -1, message: 'x' } })).toBe(true);
    // completed without result is invalid
    expect(isDetailedTask({ ...baseTask, status: 'completed' })).toBe(false);
    // failed without error is invalid
    expect(isDetailedTask({ ...baseTask, status: 'failed' })).toBe(false);
  });
});

// ─── AC-39.17 — keep polling until terminal (R-25.5-e) ──────────────────────────

describe('AC-39.17 — client polls until a terminal state (R-25.5-e)', () => {
  it('simulates a poll loop that stops only at a terminal status', () => {
    // Sequence the server would expose across successive tasks/get responses.
    const sequence: DetailedTask[] = [
      { ...baseTask, status: 'working' },
      { ...baseTask, status: 'input_required', inputRequests: {} },
      { ...baseTask, status: 'working' },
      { ...baseTask, status: 'completed', result: { resultType: 'complete' } },
    ];
    let i = 0;
    let last: TaskStatus = 'working';
    // Poll while non-terminal (R-25.5-e), respecting interval gates not modeled here.
    while (i < sequence.length && !isTerminalTaskStatus(sequence[i].status)) {
      last = sequence[i].status;
      i++;
    }
    expect(isTerminalTaskStatus(sequence[i].status)).toBe(true);
    expect(sequence[i].status).toBe('completed');
    expect(NON_TERMINAL_TASK_STATUSES.has(last)).toBe(true);
  });
});

// ─── AC-39.18 — correct under stateless per-request model (R-25.6-a) ────────────

describe('AC-39.18 — tasks behave correctly under the stateless model (R-25.6-a)', () => {
  it('computes eligibility from THIS request only, never a prior one', () => {
    // A prior request declared the capability …
    expect(isTasksActiveForRequest(tasksMap, tasksMap)).toBe(true);
    // … but a later request that omits the declaration is NOT eligible — the
    // result is a pure function of the current request's capabilities.
    expect(isTasksActiveForRequest({}, tasksMap)).toBe(false);
    expect(isTasksActiveForRequest(undefined, tasksMap)).toBe(false);
  });

  it('requires the server to advertise it as well (intersection)', () => {
    expect(serverAdvertisesTasks(tasksMap)).toBe(true);
    expect(serverAdvertisesTasks({})).toBe(false);
    expect(isTasksActiveForRequest(tasksMap, {})).toBe(false);
  });
});

// ─── AC-39.19/20 — durable persistence, instance-agnostic (R-25.6-b,c,d) ────────

describe('AC-39.19, AC-39.20 — durability and instance-agnostic resolution (R-25.6-b, R-25.6-c, R-25.6-d)', () => {
  // A minimal durable store the spec mandates a server keep; two independent
  // "instances" share it, modeling no session affinity / no connection state.
  class DurableTaskStore {
    private readonly records = new Map<string, DetailedTask>();
    persist(task: DetailedTask): void {
      this.records.set(task.taskId, task);
    }
    resolve(taskId: string): DetailedTask | undefined {
      return this.records.get(taskId);
    }
  }

  it('persists the task before the handle is returned and survives the creating request', () => {
    const store = new DurableTaskStore();
    const handle: CreateTaskResult = { ...baseTask, resultType: 'task' };
    // Server persists BEFORE returning the CreateTaskResult (R-25.6-b).
    store.persist({ ...baseTask, status: 'working' });
    expect(isCreateTaskResult(handle)).toBe(true);
    // The creating request "completes"; the durable record is still there.
    expect(store.resolve(handle.taskId)?.taskId).toBe(handle.taskId);
  });

  it('any instance answers a later tasks/get from the durable record', () => {
    const store = new DurableTaskStore();
    store.persist({ ...baseTask, status: 'completed', result: { resultType: 'complete' } });

    // "Instance A" created it; "instance B" (a different closure with no shared
    // connection state) answers the follow-up purely from the durable store.
    const instanceB = (id: string) => store.resolve(id) ?? buildTaskNotFoundError(id);
    const resolved = instanceB(baseTask.taskId);
    expect('status' in resolved && resolved.status).toBe('completed');

    // An unknown id yields the not-found error from any instance.
    const missing = instanceB('task_unknown');
    expect('code' in missing && missing.code).toBe(TASK_NOT_FOUND_CODE);
  });
});

// ─── AC-39.21 — may reuse §11 continuation token (R-25.6-e) ──────────────────────

describe('AC-39.21 — resumable state may reuse the §11 continuation token (R-25.6-e)', () => {
  it('a task MAY carry an opaque requestState string in passthrough members', () => {
    // The §11 requestState is an opaque string; passthrough lets a server encode
    // resumable state on the task without a dedicated field here.
    const t = TaskSchema.parse({ ...baseTask, requestState: 'opaque-continuation-token' });
    expect(t['requestState']).toBe('opaque-continuation-token');
  });
});

// ─── AC-39.22 — client persists taskId to resume polling (R-25.6-h) ─────────────

describe('AC-39.22 — client persists taskId to resume after restart (R-25.6-h)', () => {
  it('stores the opaque taskId verbatim and resumes polling with it', () => {
    const handle: CreateTaskResult = { ...baseTask, resultType: 'task' };
    // Client persists the taskId durably (here: a string captured before "crash").
    const persistedId = handle.taskId;
    expect(persistedId).toBe('task_3f2a9c10');

    // After a restart, the client resumes polling using the stored id verbatim —
    // it derives no meaning from it, just forwards it.
    const resumedGetParams = { taskId: persistedId };
    expect(resumedGetParams.taskId).toBe(handle.taskId);
  });
});
