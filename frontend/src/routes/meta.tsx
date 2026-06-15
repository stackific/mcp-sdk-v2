/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { JsonBlock } from '@/components/json-block';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function MetaPage() {
  const call = useAsync<ApiResult<any>>();
  const echoed = call.data?.ok ? ((call.data.result as any)?._meta?.echoed ?? null) : null;
  return (
    <CapabilityPage
      title="The _meta Envelope"
      chapter="Ch 4"
      story="S05"
      description="_meta is the open, string-keyed extension envelope that may ride on any request params, notification params, or result. Here the client sends a tools/call whose _meta carries both a protocol-reserved key (io.modelcontextprotocol/) and a custom namespaced key; the server echoes the _meta it received back to us, demonstrating that arbitrary metadata travels alongside the message and unknown keys are tolerated rather than rejected."
      wireFilter={(f) => f.method === 'tools/call' || f.kind === 'response'}
    >
      <Card>
        <CardHeader>
          <CardTitle>Send custom _meta</CardTitle>
          <CardDescription>
            Calls echo_trace with a reserved-prefix key and a custom namespaced key in _meta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            data-testid="run-meta"
            disabled={call.loading}
            onClick={() =>
              call.run(() =>
                backend.callToolTraced(
                  'echo_trace',
                  {},
                  {
                    'io.modelcontextprotocol/example': 'reserved-namespace',
                    'companion/note': 'custom key',
                  },
                ),
              )
            }
          >
            Run
          </Button>
          {echoed ? (
            <div className="space-y-1">
              <div className="text-xs text-slate-400">server echoed _meta:</div>
              <JsonBlock value={echoed} />
            </div>
          ) : null}
          <ApiResultView result={call.data} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-400">
          <p>
            _meta is a generic, string-keyed map whose member values may be any JSON value. It is
            optional on params and results, but every client request must carry one because the
            protocol-defined per-request keys (protocol revision, client info, client capabilities)
            live inside it.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Each key is one string: an optional dot-separated prefix ending in `/`, then a name —
              or one of four reserved bare keys (progressToken, traceparent, tracestate, baggage).
            </li>
            <li>
              A prefix whose second label is `modelcontextprotocol` or `mcp` is reserved; only the
              protocol mints keys under `io.modelcontextprotocol/`. Third parties must use their own
              reverse-DNS prefix (e.g. `com.example/requestTag`).
            </li>
            <li>
              Receivers must never reject a message solely for unrecognized _meta keys; after the
              required keys are validated, unknown keys are simply ignored.
            </li>
          </ul>
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
