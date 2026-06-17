/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { JsonBlock } from '@/components/json-block';
import { ApiResultView } from '@/components/result-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function TransportPage() {
  const call = useAsync<ApiResult<any>>();
  const probe = call.data && call.data.ok ? (call.data.result as any) : null;
  const statusOk = probe ? probe.status >= 200 && probe.status < 300 : false;

  return (
    <CapabilityPage
      title="Transport & Streamable HTTP"
      chapter="Ch 7–9"
      story="S12–S15"
      description="The transport is just the byte-carrying substrate: it frames, delivers, and tears down JSON-RPC messages without ever interpreting their meaning. This page probes the Streamable HTTP transport — a single MCP endpoint reached over HTTP — and shows the actual request headers the client sent, the HTTP status the server returned, and the response headers (content type, negotiated protocol version, and the session id, which under the stateless model should not be present)."
      wireFilter={(f) => f.kind === 'lifecycle' || f.kind === 'response'}
    >
      <Card>
        <CardHeader>
          <CardTitle>Probe the transport</CardTitle>
          <CardDescription>
            POSTs to the MCP endpoint and reports the headers and HTTP status of the exchange.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            data-testid="run-transport"
            disabled={call.loading}
            onClick={() => call.run(() => backend.transportProbe())}
          >
            Probe transport
          </Button>

          {probe ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusOk ? 'secondary' : 'destructive'}>
                  {probe.status} {probe.statusText}
                </Badge>
                <Badge variant="outline">
                  {probe.method} {probe.url}
                </Badge>
                {probe.negotiatedVersion ? (
                  <Badge variant="ghost">MCP-Protocol-Version: {probe.negotiatedVersion}</Badge>
                ) : null}
                <Badge variant={probe.sessionId ? 'destructive' : 'ghost'}>
                  {probe.sessionId
                    ? `Mcp-Session-Id: ${probe.sessionId}`
                    : 'no Mcp-Session-Id (stateless)'}
                </Badge>
                {probe.contentType ? (
                  <Badge variant="ghost">Content-Type: {probe.contentType}</Badge>
                ) : null}
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Request headers</div>
                <JsonBlock value={probe.requestHeaders} />
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Response headers</div>
                <JsonBlock value={probe.responseHeaders} />
              </div>
            </div>
          ) : null}

          <ApiResultView result={call.data} label="Raw probe result" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            MCP defines one transport contract (a bidirectional, integrity-preserving, UTF-8 JSON
            channel) and two concrete transports. This companion app uses Streamable HTTP; stdio is
            the other defined transport and is out of scope for a browser.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Streamable HTTP exposes a single MCP endpoint. Each client message is its own request
              (POST per message, never a batch). GET and DELETE are not part of this stateless
              transport — there is no session lifecycle and no separate GET stream — so the server
              answers them with 405.
            </li>
            <li>
              Every POST carries required headers: <code>Content-Type: application/json</code>,
              <code> Accept</code> listing both <code>application/json</code> and
              <code> text/event-stream</code>, and <code>MCP-Protocol-Version</code> (which must
              equal the body <code>_meta</code> protocol version).
            </li>
            <li>
              The HTTP status maps protocol conditions: 200 for a request answer (single JSON object
              or an SSE stream), 202 for an accepted notification or client response, 404 for an
              unknown path, and 405 for GET/DELETE (or any non-POST verb). A required-header,
              routing-header, or <code>_meta</code> violation is rejected with 400 (
              <code>-32001</code> or <code>-32602</code>); an unknown JSON-RPC <em>method</em>{' '}
              yields <code>-32601</code>.
            </li>
            <li>
              The layer is stateless: no handshake and no session identifier. A server must not
              mint, require, or echo an <code>Mcp-Session-Id</code> — so the absence of that header
              above is the expected, conforming behavior.
            </li>
          </ul>
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
