/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function LoggingPage() {
  const call = useAsync<ApiResult<any>>();

  return (
    <CapabilityPage
      title="Logging"
      chapter="Book Ch 29"
      deprecated="Logging (and the io.modelcontextprotocol/logLevel _meta key) is deprecated — for stdio write diagnostics to stderr, otherwise emit telemetry via an external observability framework."
      description="Logging is deprecated in the RC. In 2026-07-28 a client opts in per-request via the _meta logLevel key (there is no logging/setLevel RPC). Here the server emits notifications/message via the tool context — watch the level/logger/data on the wire."
      wireFilter={(f) =>
        f.method === 'notifications/message' || f.method === 'tools/call' || f.kind === 'response'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Server log messages</CardTitle>
          <CardDescription>notifications/message — level, logger, data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={() =>
              call.run(() => backend.callTool('count_with_logs', { count: 6, intervalMs: 300 }))
            }
            disabled={call.loading}
            data-testid="run-logging"
          >
            Emit log notifications
          </Button>
          <ApiResultView result={call.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
