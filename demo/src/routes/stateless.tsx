/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { JsonBlock } from '@/components/json-block';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type BackendStatus } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function StatelessPage() {
  const status = useAsync<BackendStatus>();
  const s = status.data;
  return (
    <CapabilityPage
      title="Stateless Per-Request Model"
      chapter="Ch 4"
      story="S06"
      description="MCP V2 processes every request independently: all the information needed to handle a request lives in that request's own _meta, and nothing is remembered between requests. This page reads the backend status to surface the server URL and negotiated protocol version, then explains why each call is self-contained and how genuine cross-call continuity is achieved without relying on the connection."
      wireFilter={(f) => f.kind === 'lifecycle' || f.kind === 'response'}
    >
      <Card>
        <CardHeader>
          <CardTitle>Inspect the stateless connection</CardTitle>
          <CardDescription>
            Reads backend status — the server URL and negotiated version are derived per request,
            not from session history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            data-testid="run-stateless"
            disabled={status.loading}
            onClick={() => status.run(() => backend.status())}
          >
            Read status
          </Button>
          {s ? (
            <div className="space-y-3">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-muted-foreground">Server URL</div>
                  <div className="font-mono">{s.serverUrl ?? '—'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Negotiated version</div>
                  <div className="font-mono">{s.negotiatedVersion ?? '—'}</div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Each request is self-contained: the server derives identity, capabilities, and
                version solely from the current request's <code>_meta</code>, never from earlier
                requests or the connection.
              </p>
              <JsonBlock value={s} />
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            V2 is stateless per request: the protocol requires no implicit session state, no
            handshake, and no prior request before a server will process a given call.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              A server processes each request independently and must not infer identity,
              capabilities, or protocol version from any earlier request — only from the current
              request's <code>_meta</code>.
            </li>
            <li>
              A connection is not a conversation: unrelated requests may be interleaved on one
              connection, and any two requests may be served by different server instances with
              identical behavior.
            </li>
            <li>
              Cross-call continuity is explicit, via server-minted opaque identifiers (e.g. a
              pagination
              <code>nextCursor</code>) and <code>_meta</code> handles like
              <code> io.modelcontextprotocol/related-task</code> — the client echoes them back
              verbatim, never parsing or constructing them.
            </li>
            <li>
              The <code>Mcp-Session-Id</code> header is a transport convenience for routing and
              resumption, not protocol state — continuity must never depend on connection or session
              identity.
            </li>
            <li>
              List (enumeration) results must not vary by connection identity; any variation derives
              only from explicit request inputs such as parameters, cursors, or per-request
              authenticated identity.
            </li>
          </ul>
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
