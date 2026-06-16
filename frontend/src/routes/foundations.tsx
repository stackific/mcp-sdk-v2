/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { JsonBlock } from '@/components/json-block';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type BackendStatus } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function FoundationsPage() {
  const status = useAsync<BackendStatus>();
  const s = status.data;
  return (
    <CapabilityPage
      title="Protocol Foundations & Conformance"
      chapter="Ch 1"
      story="S01"
      description="MCP is a JSON-RPC 2.0 protocol with a single current revision, defined around three roles — host, client, and server. This page drives the live connection: pressing Run issues server/discover — the stateless 2026-07-28 entry point — and surfaces the negotiated protocol revision and the server's Implementation descriptor (name/version) exactly as returned on the wire."
      wireFilter={(f) =>
        f.method === 'server/discover' || f.kind === 'lifecycle' || f.kind === 'response'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Negotiated revision & server identity</CardTitle>
          <CardDescription>
            Run <code>server/discover</code> to see the negotiated protocol revision and the server
            Implementation descriptor — and the request/response pair on the wire.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            data-testid="run-foundations"
            disabled={status.loading}
            onClick={() =>
              status.run(async () => {
                await backend.discover();
                return backend.status();
              })
            }
          >
            Run
          </Button>
          {s ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={s.connected ? 'green' : 'red'}>
                  {s.connected ? 'connected' : 'disconnected'}
                </Badge>
                <Badge variant="blue">revision: {s.negotiatedVersion ?? 'none'}</Badge>
              </div>
              <JsonBlock
                value={{ negotiatedVersion: s.negotiatedVersion, serverInfo: s.serverInfo }}
              />
            </div>
          ) : (
            <p className="text-sm text-slate-400">Press Run to read the live status.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Conformance model (RFC 2119)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-400">
          <p>
            The keywords MUST / MUST NOT / REQUIRED / SHALL / SHALL NOT / SHOULD / SHOULD NOT /
            RECOMMENDED / MAY / OPTIONAL carry their RFC 2119 / RFC 8174 meaning only when they
            appear in uppercase; lowercase forms impose no requirement.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="text-slate-300">MUST / REQUIRED / SHALL</span> — an absolute
              requirement, satisfied without exception.
            </li>
            <li>
              <span className="text-slate-300">MUST NOT / SHALL NOT</span> — an absolute
              prohibition, never done.
            </li>
            <li>
              <span className="text-slate-300">SHOULD / RECOMMENDED</span> — deviate only when the
              full implications are understood and a valid reason exists.
            </li>
            <li>
              <span className="text-slate-300">MAY / OPTIONAL</span> — including or omitting it are
              both conforming, and each must interoperate with the other (possibly with reduced
              functionality).
            </li>
            <li>
              An implementation is conforming if and only if it satisfies every applicable MUST /
              MUST NOT / SHALL / SHALL NOT for the roles and features it implements.
            </li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>JSON-RPC 2.0, one current revision</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-400">
          <p>
            The communication model is built on JSON-RPC 2.0 with three message kinds carried over a
            single current protocol revision.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              A <span className="text-slate-300">request</span> carries an <code>id</code>, a{' '}
              <code>method</code>, and optional <code>params</code>, and requires exactly one
              matching response.
            </li>
            <li>
              A <span className="text-slate-300">response</span> is a result or an error, never
              both.
            </li>
            <li>
              A <span className="text-slate-300">notification</span> carries a method and optional
              params but no id, and gets no response.
            </li>
            <li>
              The mandatory baseline — base message format, revision handling, and the core message
              patterns — must be implemented by every conforming party; other features may be
              omitted but must conform if implemented.
            </li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Roles: host, client, server</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-400">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="text-slate-300">Host</span> — owns the user relationship and trust
              boundary, makes consent decisions, and creates/coordinates clients; it is not itself a
              role on the wire.
            </li>
            <li>
              <span className="text-slate-300">Client</span> — runs inside the host, bound
              one-to-one to a single server, and sends client-originated requests.
            </li>
            <li>
              <span className="text-slate-300">Server</span> — exposes tools, resources, prompts,
              and completion; servers are isolated and cannot observe one another.
            </li>
            <li>
              Servers are stateless: a server infers no revision, identity, or capability from a
              prior request, connection, or process — each request carries those in its{' '}
              <code>_meta</code>.
            </li>
          </ul>
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
