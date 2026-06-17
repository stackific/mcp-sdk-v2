/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { JsonBlock } from '@/components/json-block';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type BackendStatus } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

const CHECKLIST: { label: string; detail: string; level: 'MUST' | 'SHOULD' }[] = [
  {
    label: 'Token audience binding',
    detail:
      'A server validates that every access token names it as the intended audience before processing, and rejects tokens not bound to it — never accepting or forwarding a token meant for another resource (no passthrough / confused-deputy).',
    level: 'MUST',
  },
  {
    label: 'OAuth 2.1 + PKCE (S256)',
    detail:
      'Authorization uses PKCE with the S256 challenge method, confirmed via authorization-server metadata; the client records the expected issuer and rejects mismatches by exact string comparison, and verifies a state value (mix-up + CSRF defense).',
    level: 'MUST',
  },
  {
    label: 'Explicit user consent',
    detail:
      'The host obtains informed, explicit consent before exposing data or invoking a tool. Silence is never consent, granted scope is never silently escalated, and a materially different operation requires fresh consent.',
    level: 'MUST',
  },
  {
    label: 'Human in the loop',
    detail:
      'A user can review, understand, and deny a proposed tools/call before it runs; the decision never rests solely with the model. The same gate covers elicitation review/approve/edit/decline/cancel.',
    level: 'MUST',
  },
  {
    label: 'Sandbox MCP Apps UI',
    detail:
      'Server-provided interactive UI renders in an isolated sandbox (iframe) under a restrictive CSP; the host mediates every privileged action, validates postMessage origins, exposes no unrelated credentials/context, and routes any UI-requested tool call through the normal consent path.',
    level: 'MUST',
  },
  {
    label: 'Validate all peer inputs',
    detail:
      'Receivers never assume a peer is well-behaved: tool arguments are validated against the input schema, URIs and cursors validated before use, and failures are reported as errors (-32602 / -32600) rather than acted upon. Validation is bounded in depth, time, and size.',
    level: 'MUST',
  },
  {
    label: 'Never leak secrets in errors or logs',
    detail:
      'Credentials and tokens are never logged; sensitive request/result content and metadata are kept out of logs, traces, and telemetry; data crossing the trust boundary is minimized and redacted. Metadata carries no authority.',
    level: 'MUST',
  },
  {
    label: 'TLS everywhere',
    detail:
      'Authorization-server endpoints and redirect URIs use HTTPS (a localhost redirect is permitted); tokens are stored securely and kept confidential in transit and at rest.',
    level: 'MUST',
  },
];

export function SecurityPage() {
  const status = useAsync<BackendStatus>();
  const s = status.data;
  return (
    <CapabilityPage
      title="Security Considerations"
      chapter="Ch 28"
      story="S44"
      description="Section 28 is a consolidating, principles-and-rules chapter: it defines no new wire types, but binds the consent, isolation, validation, and confidentiality obligations introduced across tools, elicitation, sampling, authorization, and UI into a single enforceable baseline. The host is the sole trust boundary — it mediates every flow of data and authority between the user, the model, and isolated servers, and most of these obligations cannot be enforced at the wire level."
      wireFilter={(f) => f.kind === 'response'}
    >
      <Card>
        <CardHeader>
          <CardTitle>Live connection context</CardTitle>
          <CardDescription>
            Loads the current backend status so the security baseline below can be read against the
            connected server and negotiated protocol version.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            data-testid="run-security"
            disabled={status.loading}
            onClick={() => status.run(() => backend.status())}
          >
            Load status
          </Button>
          {s ? <JsonBlock value={s} /> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Security baseline checklist</CardTitle>
          <CardDescription>
            The key normative requirements every conforming MCP implementation MUST honor (§28).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul data-testid="security-checklist" className="space-y-3 text-sm">
            {CHECKLIST.map((item) => (
              <li key={item.label} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Badge variant={item.level === 'MUST' ? 'destructive' : 'ghost'}>
                    {item.level}
                  </Badge>
                  <span className="font-medium text-card-foreground">{item.label}</span>
                </div>
                <p className="text-muted-foreground">{item.detail}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            The protocol cannot enforce most of these at the wire level, so conformance depends on
            implementations building them in. A few observable behaviors do surface as errors:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>An over-the-limit tools/call is rejected with -32600 rather than executed.</li>
            <li>A malformed, unknown, or expired pagination cursor is rejected with -32602.</li>
            <li>A token whose audience does not name the server is rejected before processing.</li>
            <li>Tool arguments that fail input-schema validation return an error, not a result.</li>
          </ul>
          <p>
            Servers are isolated from one another: the host never relays one server's requests,
            results, context, or credentials to another, and serves file:// resources only from
            user-authorized directories with sanitized paths.
          </p>
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
