/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from 'react';

import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useFrames } from '@/lib/debug';
import { useAsync } from '@/lib/use-async';

export function ProgressPage() {
  const call = useAsync<ApiResult<any>>();
  const cancelId = useRef<string>('');
  const runStartSeq = useRef<number>(0);
  const [running, setRunning] = useState(false);
  const frames = useFrames();

  // Only consider progress frames emitted AFTER the current run started (no stale bar).
  const lastProgress = [...frames]
    .reverse()
    .find((f) => f.method === 'notifications/progress' && f.seq > runStartSeq.current);
  const p = lastProgress?.payload as any;
  const pct = p?.params?.total ? Math.round((p.params.progress / p.params.total) * 100) : null;

  function start(to: number, intervalMs: number) {
    cancelId.current = crypto.randomUUID();
    runStartSeq.current = frames.at(-1)?.seq ?? 0;
    setRunning(true);
    void call
      .run(() => backend.callToolCancellable('slow_count', { to, intervalMs }, cancelId.current))
      .finally(() => setRunning(false));
  }

  return (
    <CapabilityPage
      title="Progress & Cancellation"
      chapter="Book Ch 27–28"
      description="A long call attaches a progressToken; the server streams notifications/progress correlated to it. Cancelling aborts the request — the client emits notifications/cancelled and the server stops cooperatively at its next signal check."
      wireFilter={(f) =>
        f.method === 'notifications/progress' ||
        f.method === 'notifications/cancelled' ||
        f.method === 'notifications/message' ||
        f.method === 'tools/call' ||
        f.kind === 'response' ||
        f.kind === 'error'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>slow_count</CardTitle>
          <CardDescription>
            Counts with a progressToken; cancel to abort mid-flight.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => start(40, 300)} disabled={running} data-testid="run-progress">
              Start (count to 40)
            </Button>
            <Button
              variant="destructive"
              onClick={() => backend.cancel(cancelId.current)}
              disabled={!running}
              data-testid="cancel-progress"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => start(8, 250)}
              disabled={running}
              data-testid="run-progress-short"
            >
              Quick run (to 8)
            </Button>
          </div>

          {pct !== null ? (
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-400">
                <span data-testid="progress-label">
                  progress {p?.params?.progress}/{p?.params?.total}
                </span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : null}

          <ApiResultView result={call.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
