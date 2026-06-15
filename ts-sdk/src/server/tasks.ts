/**
 * S4 — an in-memory Tasks runtime for the server (§25). Implements the
 * {@link TaskStore} surface the {@link McpServer} dispatcher consumes
 * (`get`/`getResult`/`list`/`cancel`) plus the lifecycle helpers a task-augmented
 * tool drives (`createTask`/`updateStatus`/`storeResult`).
 *
 * Conformance: it mints spec-shaped {@link Task} objects (incl. `createdAt`,
 * `lastUpdatedAt`, `ttlMs`), enforces the legal status transitions (§25.5 via
 * {@link isLegalTaskTransition}), discards tasks whose non-null `ttlMs` has
 * elapsed and answers queries for them with the §22.4 not-found condition
 * (`-32602`, §25.6/§25.7), and reports `tasks/result` on an unfinished task as a
 * `-32602`.
 *
 * Edge-friendly: only Web-platform `Date` is used (a clock can be injected).
 */
import {
  isLegalTaskTransition,
  isTerminalTaskStatus,
  type Task,
  type DetailedTask,
  type TaskStatus,
} from '../protocol/tasks.js';
import { INVALID_PARAMS_CODE } from '../protocol/meta.js';
import { ServerError, INTERNAL_ERROR_CODE, type TaskStore } from './server.js';

interface Entry {
  task: Task;
  result?: Record<string, unknown>;
  /** Inline error for a `failed` task. (§25.5) */
  error?: { code: number; message: string; data?: unknown };
  /** Pending input solicitations for an `input_required` task. (§25.5) */
  inputRequests?: Record<string, unknown>;
  /** Input responses supplied via `tasks/update`. (§25.8) */
  inputResponses?: Record<string, unknown>;
  createdAtMs: number;
}

/** Options for {@link InMemoryTaskStore}. */
export interface InMemoryTaskStoreOptions {
  /** Clock injection (default `Date.now`); lets tests drive ttl expiry deterministically. */
  now?: () => number;
  /** Optional `pollIntervalMs` hint stamped on every created task. (§25.4) */
  defaultPollIntervalMs?: number;
}

/** A conformant, in-memory store for the Tasks extension (§25). */
export class InMemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, Entry>();
  private seq = 0;
  private readonly now: () => number;
  private readonly pollIntervalMs?: number;

  constructor(options: InMemoryTaskStoreOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.pollIntervalMs = options.defaultPollIntervalMs;
  }

  // ── Lifecycle (driven by a task-augmented tool) ──────────────────────────────

  /** Creates a task in the initial `working` state and returns the handle. (§25.3, §25.4) */
  createTask(options: { ttlMs?: number | null; taskId?: string } = {}): Task {
    const nowMs = this.now();
    const iso = new Date(nowMs).toISOString();
    const taskId = options.taskId ?? `task-${++this.seq}-${nowMs.toString(36)}`;
    const task: Task = {
      taskId,
      status: 'working',
      createdAt: iso,
      lastUpdatedAt: iso,
      ttlMs: options.ttlMs === undefined ? null : options.ttlMs,
      ...(this.pollIntervalMs !== undefined ? { pollIntervalMs: this.pollIntervalMs } : {}),
    };
    this.tasks.set(taskId, { task, createdAtMs: nowMs });
    return task;
  }

  /** Transitions a task to `status`, enforcing the legal transition graph. (§25.5) */
  updateStatus(taskId: string, status: TaskStatus, statusMessage?: string): Task {
    const entry = this.require(taskId);
    if (entry.task.status !== status && !isLegalTaskTransition(entry.task.status, status)) {
      throw new ServerError(INTERNAL_ERROR_CODE, `Illegal task transition: ${entry.task.status} → ${status} (§25.5)`);
    }
    entry.task = {
      ...entry.task,
      status,
      lastUpdatedAt: new Date(this.now()).toISOString(),
      ...(statusMessage !== undefined ? { statusMessage } : {}),
    };
    // §25.10: push the new DetailedTask to any wired listener (→ notifications/tasks).
    this.updateListener?.(this.getDetailed(taskId));
    return entry.task;
  }

  /** Registers a listener invoked with the new DetailedTask on every status change. (§25.10) */
  setUpdateListener(listener: (task: DetailedTask) => void): void {
    this.updateListener = listener;
  }
  private updateListener?: (task: DetailedTask) => void;

  /** Stores the terminal payload and moves the task to a terminal status (default `completed`). */
  storeResult(taskId: string, result: Record<string, unknown>, status: TaskStatus = 'completed'): Task {
    const entry = this.require(taskId);
    if (!isTerminalTaskStatus(status)) {
      throw new ServerError(INTERNAL_ERROR_CODE, `storeResult requires a terminal status, got "${status}"`);
    }
    entry.result = result;
    return this.updateStatus(taskId, status);
  }

  // ── TaskStore surface (consumed by McpServer.dispatch) ───────────────────────

  /** `tasks/get` — the current task handle, or `-32602` if unknown/expired. (§25.7) */
  get(taskId: string): Task {
    return this.live(taskId).task;
  }

  /**
   * The status-appropriate {@link DetailedTask} the `tasks/get` result wraps
   * (§25.7): a terminal task carries its outcome INLINE — `result` when completed,
   * `error` when failed — `inputRequests` when input-required, and nothing extra
   * while working/cancelled. (R-25.5-d)
   */
  getDetailed(taskId: string): DetailedTask {
    const t = this.live(taskId).task;
    const entry = this.require(taskId);
    const base: Record<string, unknown> = {
      taskId: t.taskId,
      status: t.status,
      createdAt: t.createdAt,
      lastUpdatedAt: t.lastUpdatedAt,
      ttlMs: t.ttlMs,
      ...(t.statusMessage !== undefined ? { statusMessage: t.statusMessage } : {}),
      ...(t.pollIntervalMs !== undefined ? { pollIntervalMs: t.pollIntervalMs } : {}),
    };
    switch (t.status) {
      case 'completed':
        return { ...base, result: entry.result ?? {} } as DetailedTask;
      case 'failed':
        return {
          ...base,
          error: entry.error ?? { code: INTERNAL_ERROR_CODE, message: t.statusMessage ?? 'task failed' },
        } as DetailedTask;
      case 'input_required':
        return { ...base, inputRequests: entry.inputRequests ?? {} } as DetailedTask;
      default:
        return base as DetailedTask;
    }
  }

  /** Records an inline error and moves the task to `failed`. (§25.5) */
  storeError(taskId: string, error: { code: number; message: string; data?: unknown }): Task {
    this.require(taskId).error = error;
    return this.updateStatus(taskId, 'failed');
  }

  /** `tasks/update` — supplies input to an `input_required` task, moving it back to `working`. (§25.8) */
  applyInput(taskId: string, inputResponses: Record<string, unknown>): Task {
    const entry = this.require(taskId);
    if (entry.task.status !== 'input_required') {
      throw new ServerError(INVALID_PARAMS_CODE, `Task "${taskId}" is not awaiting input (status: ${entry.task.status})`);
    }
    entry.inputResponses = inputResponses;
    return this.updateStatus(taskId, 'working');
  }

  /** `tasks/result` — terminal payload; `-32602` if unknown/expired or not finished. (§25.7) */
  getResult(taskId: string): Record<string, unknown> {
    const entry = this.live(taskId);
    if (!isTerminalTaskStatus(entry.task.status)) {
      throw new ServerError(INVALID_PARAMS_CODE, `Task "${taskId}" is not finished (status: ${entry.task.status})`);
    }
    return { ...(entry.result ?? {}), taskId: entry.task.taskId, status: entry.task.status };
  }

  /** `tasks/list` — all live tasks (expired ones are discarded first). */
  list(): Task[] {
    this.sweepExpired();
    return [...this.tasks.values()].map((e) => e.task);
  }

  /** `tasks/cancel` — move a non-terminal task to `cancelled`; terminal tasks are returned unchanged. (§25.9) */
  cancel(taskId: string): Task {
    const entry = this.require(taskId);
    if (isTerminalTaskStatus(entry.task.status)) return entry.task;
    return this.updateStatus(taskId, 'cancelled', 'cancelled by client');
  }

  // ── ttl expiry (§25.6) ───────────────────────────────────────────────────────

  private sweepExpired(): void {
    const nowMs = this.now();
    for (const [id, entry] of this.tasks) {
      if (entry.task.ttlMs !== null && nowMs - entry.createdAtMs > entry.task.ttlMs) {
        this.tasks.delete(id);
      }
    }
  }

  private live(taskId: string): Entry {
    this.sweepExpired();
    return this.require(taskId);
  }

  private require(taskId: string): Entry {
    const entry = this.tasks.get(taskId);
    if (!entry) throw new ServerError(INVALID_PARAMS_CODE, `Task not found: "${taskId}"`, { taskId });
    return entry;
  }
}
