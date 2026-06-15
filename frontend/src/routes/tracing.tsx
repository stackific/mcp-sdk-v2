/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';

import { CapabilityPage } from '@/components/capability-page';
import { JsonBlock } from '@/components/json-block';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

function hex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function TracingPage() {
  const call = useAsync<ApiResult<any>>();
  const [traceparent, setTraceparent] = useState<string>('');

  function send() {
    const tp = `00-${hex(16)}-${hex(8)}-01`;
    setTraceparent(tp);
    void call.run(() =>
      backend.callToolTraced('echo_trace', {}, { traceparent: tp, tracestate: 'companion=demo' }),
    );
  }

  const echoed =
    call.data && call.data.ok ? ((call.data.result as any)?._meta?.echoed ?? null) : null;
  const roundTripped = echoed?.traceparent === traceparent && !!traceparent;

  return (
    <CapabilityPage
      title="Tracing & Context Propagation"
      chapter="Book Ch 44"
      description="Every request carries a _meta envelope. Propagating a W3C traceparent there lets a server (and downstream services) stitch one distributed trace across the whole call. Here the client injects a traceparent and the server echoes back exactly what it received."
      wireFilter={(f) => f.method === 'tools/call' || f.kind === 'response'}
    >
      <Card>
        <CardHeader>
          <CardTitle>echo_trace</CardTitle>
          <CardDescription>
            Injects _meta.traceparent and verifies the server saw it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={send} disabled={call.loading} data-testid="run-tracing">
            Send with traceparent
          </Button>

          {traceparent ? (
            <div className="space-y-1 text-xs">
              <div className="text-slate-400">sent traceparent:</div>
              <div className="font-mono text-slate-300">{traceparent}</div>
            </div>
          ) : null}

          {echoed ? (
            <div className="space-y-1">
              <div className="text-xs text-slate-400" data-testid="trace-roundtrip">
                {roundTripped
                  ? '✓ round-trip confirmed — server received the same traceparent'
                  : 'server _meta:'}
              </div>
              <JsonBlock value={echoed} />
            </div>
          ) : null}

          <ApiResultView result={call.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
