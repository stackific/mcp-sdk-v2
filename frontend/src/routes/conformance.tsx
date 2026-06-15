/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { JsonBlock } from '@/components/json-block';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type BackendStatus } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

const CONFORMANCE_AREAS: { area: string; spec: string; page: string }[] = [
  { area: 'Lifecycle / initialize', spec: '§29.2 baseline · server/discover', page: 'Lifecycle' },
  {
    area: 'Capabilities',
    spec: '§6 · advertise implies implement',
    page: 'Capability Negotiation',
  },
  { area: 'Tools', spec: '§16 · advertised → MUST implement', page: 'Tools' },
  { area: 'Resources', spec: '§17 + subscriptions §10', page: 'Resources' },
  { area: 'Prompts', spec: '§18 · advertised → MUST implement', page: 'Prompts' },
  { area: 'Completion', spec: '§19 · advertised → MUST implement', page: 'Completion' },
  { area: 'Errors', spec: '§34 · -32004 / -32003 / -32602', page: 'Error Handling' },
  { area: 'Authorization', spec: '§23 · HTTP SHOULD, stdio SHOULD NOT', page: 'Authorization' },
  { area: 'Tasks', spec: '§39–40 · OPTIONAL extension', page: 'Tasks' },
  { area: 'Interactive UI', spec: '§41–42 · OPTIONAL extension', page: 'Apps / UI' },
];

export function ConformancePage() {
  const status = useAsync<BackendStatus>();
  const s = status.data;
  return (
    <CapabilityPage
      title="Conformance"
      chapter="Ch 29"
      story="S45"
      description="Conformance is the testable contract for what it means to be an MCP party, judged on observable wire behavior alone across three axes: role (client / server / both), feature surface (the unconditional baseline plus whatever is advertised), and transport (each implemented transport, independently). An implementation is conformant if and only if it satisfies every applicable normative requirement for the roles it plays and the features it advertises — no more, no less. Load the live connection status to read the negotiated revision and the server capabilities that fix this implementation's conformance profile, then review the matrix of areas demonstrated across this app."
      wireFilter={(f) => f.method === 'initialize' || f.kind === 'response'}
    >
      <Card>
        <CardHeader>
          <CardTitle>Conformance profile</CardTitle>
          <CardDescription>
            Loads the live status to show the negotiated revision and advertised server
            capabilities.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            data-testid="run-conformance"
            disabled={status.loading}
            onClick={() => status.run(() => backend.status())}
          >
            Load conformance profile
          </Button>
          {status.error ? <p className="text-sm text-red-400">{status.error}</p> : null}
          {s ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <span className="text-slate-400">negotiatedVersion</span>
                <Badge variant="blue">{s.negotiatedVersion ?? 'none'}</Badge>
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
          <CardTitle>Conformance matrix</CardTitle>
          <CardDescription>
            The major conformance areas this RC companion demonstrates, each linking conceptually to
            its dedicated page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul data-testid="conformance-matrix" className="space-y-2">
            {CONFORMANCE_AREAS.map((row) => (
              <li
                key={row.area}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-800 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200">{row.area}</p>
                  <p className="truncate text-xs text-slate-400">
                    {row.spec} · see “{row.page}”
                  </p>
                </div>
                <Badge variant="green">demonstrated</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-400">
          <p>
            Normative weight uses RFC 2119 keywords — MUST / MUST NOT / REQUIRED / SHALL / SHALL NOT
            for absolute requirements, SHOULD / SHOULD NOT for strong recommendations, and MAY /
            OPTIONAL for genuinely discretionary behavior. Conformance is the product of all such
            requirements that apply.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              A conformant server MUST implement the unconditional baseline — answer{' '}
              <code>server/discover</code>, honor the per-request <code>_meta</code> envelope, tag
              every success with a <code>resultType</code> discriminator, and reject with the exact
              codes <code>-32004</code> (unsupported revision), <code>-32003</code> (missing
              required client capability), and <code>-32602</code> (malformed envelope).
            </li>
            <li>
              Capability obligations are bidirectional: advertising a capability is a binding
              assertion that you implement all of its MUST-level behavior, and you MUST NOT
              exercise, expose, or depend on anything you have not advertised. There is no partial
              conformance.
            </li>
            <li>
              The extension mechanism — including the Tasks and Interactive UI extensions — and
              Deprecated features are OPTIONAL; advertising zero extensions is fully conformant, but
              an extension that is implemented MUST be implemented in full.
            </li>
            <li>
              Implementations MUST be robust to inputs richer than they understand: ignore unknown
              fields, capabilities, and extension identifiers, and accept unrecognized error codes —
              without ever silently discarding understood content.
            </li>
            <li>
              Conformance is judged on wire behavior only, never on internal architecture or
              language, and the §30 reference citations are provenance only — never load-bearing.
            </li>
          </ul>
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
