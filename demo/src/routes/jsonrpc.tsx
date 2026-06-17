/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function JsonRpcPage() {
  const call = useAsync<ApiResult<any>>();

  return (
    <CapabilityPage
      title="JSON-RPC Framing, Result & Error Base"
      chapter="Ch 3–4"
      story="S03–S04"
      description="Every interaction rides inside a single JSON-RPC 2.0 object. A ping sends a request and receives a success response; the wire panel shows the exact envelope — jsonrpc:'2.0', a correlating id, the method, and the result that echoes that id back."
      wireFilter={(f) =>
        f.method === 'ping' ||
        f.kind === 'request' ||
        f.kind === 'response' ||
        f.kind === 'notification'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Send a ping</CardTitle>
          <CardDescription>
            Issues a JSON-RPC request and reads back the success response in the wire panel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            data-testid="run-jsonrpc"
            disabled={call.loading}
            onClick={() => call.run(() => backend.ping())}
          >
            Ping
          </Button>
          <ApiResultView result={call.data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Each message is one standalone JSON object carrying a jsonrpc marker equal to "2.0".
            Batches (top-level arrays) are forbidden. Which members are present decides the message
            kind:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <span className="text-card-foreground">Request</span> — carries both an{' '}
              <code>id</code> and a <code>method</code>; expects exactly one response. The{' '}
              <code>id</code> (a string or number, never null) correlates the response back to it.
            </li>
            <li>
              <span className="text-card-foreground">Notification</span> — carries a{' '}
              <code>method</code> but <span className="text-card-foreground">no id</span>; it is
              one-way and MUST never be answered (even if malformed or unknown, it is silently
              discarded).
            </li>
            <li>
              <span className="text-card-foreground">Response</span> — carries exactly one of{' '}
              <code>result</code> or <code>error</code>, never both and never neither. A success
              response echoes the request <code>id</code> with the same JSON type and value.
            </li>
            <li>
              <span className="text-card-foreground">Result base (S04)</span> — every success{' '}
              <code>result</code> sets a required <code>resultType</code> discriminator (e.g.
              "complete"); an absent value is treated as "complete", an unrecognized one as an
              error.
            </li>
            <li>
              <span className="text-card-foreground">Error object</span> — the <code>error</code>{' '}
              member is {'{'} <code>code</code> (required integer), <code>message</code> (required
              string), <code>data</code> (optional, sender-defined) {'}'}.
            </li>
            <li>
              <span className="text-card-foreground">EmptyResult</span> — a method that returns
              nothing method-specific still emits a result that sets <code>resultType</code>{' '}
              (normally "complete") and carries no extra members beyond the base.
            </li>
          </ul>
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
