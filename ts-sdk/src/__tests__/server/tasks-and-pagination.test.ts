/**
 * S4 (Tasks runtime, §25) + S1 (server pagination, §12) tests.
 */
import { describe, it, expect } from 'vitest';
import { McpServer, InMemoryTaskStore, ServerError } from '../../server/index.js';
import { TASKS_EXTENSION_ID } from '../../protocol/tasks.js';
import { CLIENT_CAPABILITIES_META_KEY } from '../../protocol/meta.js';

const noStreamCtx = {
  protocolVersion: '2026-07-28',
  requestId: 1,
  meta: {},
  signal: new AbortController().signal,
  notify() {},
  serverRequest: async () => ({}),
};

/** A context whose per-request client capabilities negotiate the Tasks extension (§25.2). */
const tasksCtx = {
  ...noStreamCtx,
  meta: { [CLIENT_CAPABILITIES_META_KEY]: { extensions: { [TASKS_EXTENSION_ID]: {} } } },
};

describe('S4 — InMemoryTaskStore (§25)', () => {
  it('creates conformant tasks and runs a legal lifecycle to a result', () => {
    let t = 1000;
    const store = new InMemoryTaskStore({ now: () => t });
    const task = store.createTask({ ttlMs: 60000 });
    expect(task.status).toBe('working');
    expect(task.createdAt).toBe(new Date(1000).toISOString());
    expect(task.lastUpdatedAt).toBe(task.createdAt);
    expect(task.ttlMs).toBe(60000);

    t = 2000;
    store.updateStatus(task.taskId, 'working', 'step 1/2');
    expect((store.get(task.taskId) as any).statusMessage).toBe('step 1/2');

    store.storeResult(task.taskId, { content: [{ type: 'text', text: 'done' }] });
    expect((store.get(task.taskId) as any).status).toBe('completed');
    expect((store.getResult(task.taskId) as any).content[0].text).toBe('done');
  });

  it('rejects an illegal transition (terminal is immutable, §25.5)', () => {
    const store = new InMemoryTaskStore();
    const task = store.createTask({ ttlMs: null });
    store.storeResult(task.taskId, {});
    expect(() => store.updateStatus(task.taskId, 'working')).toThrow(ServerError);
  });

  it('discards an expired task and answers -32602 (§25.6/§25.7)', () => {
    let t = 0;
    const store = new InMemoryTaskStore({ now: () => t });
    const task = store.createTask({ ttlMs: 100 });
    t = 50;
    expect((store.get(task.taskId) as any).taskId).toBe(task.taskId);
    t = 1000; // beyond ttl
    expect(() => store.get(task.taskId)).toThrow(ServerError);
    try {
      store.get(task.taskId);
      throw new Error('expected get to throw');
    } catch (e) {
      expect((e as ServerError).code).toBe(-32602);
    }
  });

  it('cancel moves a non-terminal task to cancelled', () => {
    const store = new InMemoryTaskStore();
    const task = store.createTask({ ttlMs: null });
    expect((store.cancel(task.taskId) as any).status).toBe('cancelled');
  });
});

describe('C8 — Tasks dispatch (§25.3 / §25.7 / §25.8)', () => {
  function taskServer() {
    const server = new McpServer(
      { name: 's', version: '1' },
      { tools: {}, extensions: { 'io.modelcontextprotocol/tasks': {} } },
    );
    const store = new InMemoryTaskStore();
    server.setTaskStore(store);
    server.registerTool('job', { execution: { taskSupport: 'required' } }, async () => {
      const task = store.createTask({ ttlMs: 60000 });
      store.storeResult(task.taskId, { content: [{ type: 'text', text: 'done' }] }); // complete immediately
      return { task };
    });
    return { server, store };
  }

  it('a task-augmented tools/call returns a CreateTaskResult ONLY when the client negotiated Tasks (§25.2)', async () => {
    const { server } = taskServer();
    // Client declared `io.modelcontextprotocol/tasks` AND server advertises it → handle.
    const r = await server.dispatch('tools/call', { name: 'job', task: { ttl: 60000 } }, tasksCtx);
    expect(r.resultType).toBe('task');
    expect(typeof r.taskId).toBe('string');
    expect(r.task).toBeUndefined(); // flattened, not nested under `task`
  });

  it('does NOT return a task handle to a client that did not negotiate Tasks (S39, R-25.2-d)', async () => {
    const { server } = taskServer();
    // `noStreamCtx` declares no client capabilities → the server MUST NOT substitute a
    // task handle; it returns the ordinary `complete` result with no taskId.
    const r = await server.dispatch('tools/call', { name: 'job', task: { ttl: 60000 } }, noStreamCtx);
    expect(r.resultType).toBe('complete');
    expect(r.taskId).toBeUndefined();
    expect(r.task).toBeUndefined();
  });

  it('tasks/get returns a DetailedTask (resultType:"complete") with the inline result (§25.7)', async () => {
    const { server } = taskServer();
    const created = await server.dispatch('tools/call', { name: 'job', task: { ttl: 60000 } }, tasksCtx);
    const got = await server.dispatch('tasks/get', { taskId: created.taskId }, tasksCtx);
    expect(got.resultType).toBe('complete');
    expect(got.status).toBe('completed');
    expect((got.result as any).content[0].text).toBe('done');
  });

  it('rejects tasks/get from a client that did not negotiate Tasks with -32003 (S40, §25.7-c)', async () => {
    const { server } = taskServer(); // store present, server advertises Tasks
    // First create a task via a negotiated client so a real id exists…
    const created = await server.dispatch('tools/call', { name: 'job', task: { ttl: 60000 } }, tasksCtx);
    // …then query it from a client that did NOT declare the extension → -32003.
    await expect(
      server.dispatch('tasks/get', { taskId: created.taskId }, noStreamCtx),
    ).rejects.toMatchObject({ code: -32003 });
  });

  it('missing Tasks capability/store → -32003, not -32601 (§25.7)', async () => {
    const server = new McpServer({ name: 's', version: '1' }, { tools: {} }); // no task store
    await expect(server.dispatch('tasks/get', { taskId: 'x' }, tasksCtx)).rejects.toMatchObject({ code: -32003 });
  });

  it('the non-spec tasks/result and tasks/list are no longer dispatched (-32601)', async () => {
    const { server } = taskServer();
    await expect(server.dispatch('tasks/result', { taskId: 'x' }, noStreamCtx)).rejects.toMatchObject({ code: -32601 });
    await expect(server.dispatch('tasks/list', {}, noStreamCtx)).rejects.toMatchObject({ code: -32601 });
  });
});

describe('S1 — McpServer pagination (§12)', () => {
  function serverWithTools(n: number, pageSize: number): McpServer {
    const server = new McpServer({ name: 's', version: '1' }, { tools: {} }, { pageSize });
    for (let i = 0; i < n; i++) server.registerTool(`t${i}`, {}, async () => ({ content: [] }));
    return server;
  }

  it('returns one page + a nextCursor, then the rest', async () => {
    const server = serverWithTools(12, 5);
    const p1 = await server.dispatch('tools/list', {}, noStreamCtx);
    expect((p1.tools as any[]).length).toBe(5);
    expect(typeof p1.nextCursor).toBe('string');

    const p2 = await server.dispatch('tools/list', { cursor: p1.nextCursor }, noStreamCtx);
    expect((p2.tools as any[]).length).toBe(5);

    const p3 = await server.dispatch('tools/list', { cursor: p2.nextCursor }, noStreamCtx);
    expect((p3.tools as any[]).length).toBe(2);
    expect(p3.nextCursor).toBeUndefined(); // end of list
  });

  it('rejects an invalid cursor with -32602 (§12.4)', async () => {
    const server = serverWithTools(3, 5);
    await expect(server.dispatch('tools/list', { cursor: '!!!not-base64-offset' }, noStreamCtx)).rejects.toMatchObject({
      code: -32602,
    });
  });

  it('omits nextCursor when everything fits in one page', async () => {
    const server = serverWithTools(3, 50);
    const r = await server.dispatch('tools/list', {}, noStreamCtx);
    expect((r.tools as any[]).length).toBe(3);
    expect(r.nextCursor).toBeUndefined();
  });

  it('treats a received cursor:"" as a present cursor (offset 0), not "no cursor" (S18 server role, §12.3)', async () => {
    const server = serverWithTools(3, 50);
    // The gate is on PRESENCE, not truthiness: `cursor:""` decodes to offset 0 and the
    // page is returned, rather than the cursor being silently ignored or rejected.
    const r = await server.dispatch('tools/list', { cursor: '' }, noStreamCtx);
    expect((r.tools as any[]).length).toBe(3);
    expect(r.nextCursor).toBeUndefined();
  });
});
