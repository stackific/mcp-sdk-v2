/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { JsonBlock } from '@/components/json-block';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type BackendStatus } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function CapabilitiesPage() {
  const status = useAsync<BackendStatus>();
  const s = status.data;
  return (
    <CapabilityPage
      title="Capability Negotiation"
      chapter="Ch 10"
      story="S10"
      description="Capabilities are the two declaration objects — ClientCapabilities and ServerCapabilities — that tell each peer which families of methods, notifications, and behaviors the other supports. Because MCP is stateless, a feature is usable only when BOTH sides declare its governing capability: the client learns ServerCapabilities once from the latest server/discover result, while the server re-reads ClientCapabilities from every request's _meta. Load the current connection's status to inspect both objects side by side."
      wireFilter={(f) => f.method === 'initialize' || f.kind === 'response'}
    >
      <Card>
        <CardHeader>
          <CardTitle>Inspect negotiated capabilities</CardTitle>
          <CardDescription>
            Fetches the live connection status and shows what each side declared.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            data-testid="run-capabilities"
            disabled={status.loading}
            onClick={() => status.run(() => backend.status())}
          >
            Load capabilities
          </Button>
          {status.error ? <p className="text-sm text-red-400">{status.error}</p> : null}
          {s ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-400">clientCapabilities</p>
                <JsonBlock value={s.clientCapabilities ?? {}} />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-400">serverCapabilities</p>
                <JsonBlock value={s.serverCapabilities ?? {}} />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-400">
          <p>
            Effective availability of any feature is the intersection of what both peers declared.
            The mere presence of a field declares support; an entirely empty <code>{'{}'}</code> is
            a valid value declaring no optional behaviors.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Capabilities are exchanged statelessly: the client caches{' '}
              <code>ServerCapabilities</code> from the most recent <code>server/discover</code>, and
              sends <code>ClientCapabilities</code> on every request via the request{' '}
              <code>_meta</code> (key <code>io.modelcontextprotocol/clientCapabilities</code>).
            </li>
            <li>
              Each side uses only what the other declared: a peer MUST NOT invoke a method, send a
              notification, or rely on a behavior whose governing capability the other peer did not
              declare.
            </li>
            <li>
              Sub-flags refine a capability without replacing it — e.g.{' '}
              <code>tools.listChanged</code>, <code>resources.subscribe</code> /{' '}
              <code>resources.listChanged</code>, <code>prompts.listChanged</code>, and on the
              client <code>elicitation.form</code> / <code>elicitation.url</code>. A capability is
              never inferred from a related one.
            </li>
            <li>
              If a request needs an undeclared client capability the server rejects it with{' '}
              <code>-32003</code> (data includes <code>requiredCapabilities</code>, HTTP 400); a
              missing required <code>_meta</code> field is <code>-32602</code> (HTTP 400).
            </li>
            <li>
              Graceful degradation: a peer falls back to mutually supported core behavior rather
              than failing merely because the other side declared fewer capabilities.
            </li>
          </ul>
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
