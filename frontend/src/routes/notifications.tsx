/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function NotificationsPage() {
  const call = useAsync<ApiResult<any>>();

  return (
    <CapabilityPage
      title="Notifications"
      chapter="Book Ch 24–27"
      description="Notifications are one-way messages (no id, no reply). The count_with_logs tool streams notifications/message frames while it runs — watch them arrive on the response stream in real time on the right, before the final result."
      wireFilter={(f) =>
        f.method?.startsWith('notifications/') ||
        f.method === 'tools/call' ||
        f.kind === 'response' ||
        f.kind === 'note'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>count_with_logs</CardTitle>
          <CardDescription>
            Emits N notifications, then resolves. Each notification appears on the wire as it is
            sent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={() =>
              call.run(() => backend.callTool('count_with_logs', { count: 5, intervalMs: 400 }))
            }
            disabled={call.loading}
            data-testid="run-notifications"
          >
            Start (5 ticks)
          </Button>
          <ApiResultView result={call.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
