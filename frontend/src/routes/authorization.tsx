/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { JsonBlock } from '@/components/json-block';
import { ApiResultView } from '@/components/result-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

interface AuthStep {
  n: number;
  title: string;
  method: string;
  url: string;
  status: number | string;
  detail?: unknown;
}

export function AuthorizationPage() {
  const flow = useAsync<ApiResult<any>>();
  const data = flow.data && flow.data.ok ? (flow.data.result as any) : null;
  const steps: AuthStep[] = data?.steps ?? [];

  const statusVariant = (s: number | string) =>
    s === 401
      ? 'amber'
      : typeof s === 'number' && s >= 200 && s < 300
        ? 'green'
        : s === 201
          ? 'green'
          : 'slate';

  return (
    <CapabilityPage
      title="Authorization (OAuth 2.1)"
      chapter="Book Ch 40–41"
      description="MCP servers are OAuth 2.1 protected resources. An unauthenticated call gets a 401 with a WWW-Authenticate challenge; the client then discovers the protected-resource metadata, finds the authorization server, registers dynamically, obtains a token (client_credentials here), and retries — and the server sees the validated identity as ctx.http.authInfo. Every hop is shown on the wire."
      wireFilter={(f) => f.method === 'oauth' || f.trace === 'authorization'}
    >
      <Card>
        <CardHeader>
          <CardTitle>Run the handshake</CardTitle>
          <CardDescription>
            401 → resource metadata → AS metadata → DCR → token → authorized tools/call.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={() => flow.run(() => backend.runAuthFlow())}
            disabled={flow.loading}
            data-testid="run-auth"
          >
            {flow.loading ? 'Running OAuth flow…' : 'Run OAuth 2.1 flow'}
          </Button>

          {steps.length > 0 ? (
            <ol className="space-y-2" data-testid="auth-steps">
              {steps.map((s) => (
                <li key={s.n} className="rounded-md border border-slate-800 bg-slate-900/40 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-200">
                      <span className="text-slate-500">{s.n}.</span> {s.title}
                    </span>
                    <Badge variant={statusVariant(s.status) as any}>
                      {s.method} {s.status}
                    </Badge>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
                    {s.url}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          {data?.tokenMasked ? (
            <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="auth-token">
              <span className="text-slate-400">access token:</span>
              <span className="font-mono text-emerald-300">{data.tokenMasked}</span>
              {data.scope ? <Badge variant="blue">scope: {data.scope}</Badge> : null}
            </div>
          ) : null}

          {data?.authInfo ? (
            <div className="space-y-1">
              <div className="text-xs text-slate-400" data-testid="auth-identity">
                server-validated identity (ctx.http.authInfo):
              </div>
              <JsonBlock value={data.authInfo} />
            </div>
          ) : null}

          <ApiResultView result={flow.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
