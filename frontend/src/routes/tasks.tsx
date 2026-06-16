/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from 'react';

import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export function TasksPage() {
  const result = useAsync<ApiResult<any>>();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);

  function cancelTask() {
    cancelled.current = true;
    if (taskId) void backend.raw('tasks/cancel', { taskId });
  }

  async function runJob() {
    setBusy(true);
    setStatuses([]);
    setTaskId(null);
    result.reset();
    cancelled.current = false;
    try {
      const created = await backend.createTask('long_job', { steps: 4, label: 'report' }, 300000);
      if (!created.ok) {
        await result.run(async () => created);
        return;
      }
      // CreateTaskResult: the Task fields are flattened with resultType:"task".
      const id = (created.result as any)?.taskId as string;
      setTaskId(id);
      let status = (created.result as any)?.status ?? 'working';
      setStatuses([status]);
      let finalTask: any = created.result;

      // Poll tasks/get until terminal. Its DetailedTask carries the outcome INLINE
      // (result when completed, error when failed) — there is no separate tasks/result.
      for (let i = 0; i < 30 && !TERMINAL.has(status) && !cancelled.current; i++) {
        await sleep(600);
        const g = await backend.getTask(id);
        if (!g.ok) break;
        const t = g.result as any; // GetTaskResult = DetailedTask + resultType:"complete"
        finalTask = t;
        status = t?.status ?? status;
        setStatuses((s) =>
          s[s.length - 1] === `${status} ${t?.statusMessage ?? ''}`.trim()
            ? s
            : [...s, `${status} ${t?.statusMessage ?? ''}`.trim()],
        );
      }

      // Show the terminal DetailedTask (status + inline result/error).
      await result.run(async () => ({ ok: true, result: finalTask }) as any);
    } finally {
      setBusy(false);
    }
  }

  return (
    <CapabilityPage
      title="Tasks (long-running)"
      chapter="Book Ch 42"
      description="The Tasks extension turns a slow tool into an async job. A task-augmented tools/call returns a handle immediately (a CreateTaskResult, resultType:'task'); the client polls tasks/get until the status is terminal — and the DetailedTask carries the outcome INLINE (result when completed, error when failed). There is no separate tasks/result or tasks/list in this revision."
      wireFilter={(f) =>
        f.method === 'tools/call' ||
        f.method?.startsWith('tasks/') ||
        f.kind === 'response' ||
        f.kind === 'error'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>long_job (taskSupport: required)</CardTitle>
          <CardDescription>
            Augmented call → poll tasks/get → inline result. 4 background steps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={runJob} disabled={busy} data-testid="run-task">
              {busy ? 'Running…' : 'Start job as task'}
            </Button>
            <Button
              variant="destructive"
              onClick={cancelTask}
              disabled={!busy || !taskId}
              data-testid="cancel-task"
            >
              Cancel (tasks/cancel)
            </Button>
          </div>

          {taskId ? (
            <div className="text-xs text-slate-400">
              taskId <span className="font-mono text-slate-300">{taskId.slice(0, 12)}…</span>
            </div>
          ) : null}

          {statuses.length > 0 ? (
            <div className="flex flex-wrap gap-1" data-testid="task-status">
              {statuses.map((s, i) => (
                <Badge
                  key={i}
                  variant={
                    s.startsWith('completed') ? 'green' : s.startsWith('failed') ? 'red' : 'amber'
                  }
                >
                  {s}
                </Badge>
              ))}
            </div>
          ) : null}

          <ApiResultView result={result.data} label="Terminal DetailedTask" />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
