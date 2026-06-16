/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function SubscriptionsPage() {
  const listen = useAsync<ApiResult<any>>();
  const mutate = useAsync<ApiResult<any>>();

  return (
    <CapabilityPage
      title="Subscriptions & List-Changed"
      chapter="Book Ch 25–26"
      description="V2 RC is stateless, so there is no permanently-open channel. Instead the client sends ONE subscriptions/listen request with a filter declaring exactly which notification types it wants (replacing the legacy resources/subscribe). The server acks the honored subset, then only those notifications flow. Watch the ack + the list_changed/updated frames after you mutate the catalog."
      wireFilter={(f) =>
        f.method?.includes('subscriptions/') ||
        f.method?.startsWith('notifications/') ||
        f.method === 'tools/call' ||
        f.kind === 'response'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>subscriptions/listen</CardTitle>
          <CardDescription>
            Open a stream and opt in to tools/prompts/resources list_changed + updates for
            docs://readme. This is the 2026-07-28 method: the server acknowledges the honored
            subset, then only those notification types flow. Mutate the catalog (below) to watch
            them arrive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={() =>
              listen.run(() =>
                backend.subscribe({
                  toolsListChanged: true,
                  promptsListChanged: true,
                  resourcesListChanged: true,
                  resourceSubscriptions: ['docs://readme'],
                }),
              )
            }
            disabled={listen.loading}
            data-testid="run-subscribe"
          >
            subscriptions/listen (opt-in by filter)
          </Button>
          <ApiResultView result={listen.data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>mutate_catalog</CardTitle>
          <CardDescription>
            Triggers tools/list_changed, resources/list_changed, and resources/updated. A subscribed
            client re-fetches.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={() => mutate.run(() => backend.callTool('mutate_catalog', {}))}
            disabled={mutate.loading}
            data-testid="run-mutate"
          >
            Mutate catalog (emit notifications)
          </Button>
          <ApiResultView result={mutate.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
