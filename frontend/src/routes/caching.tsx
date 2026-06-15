/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { JsonBlock } from '@/components/json-block';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function CachingPage() {
  const call = useAsync<ApiResult<any>>();
  const result = call.data && call.data.ok ? (call.data.result as any) : null;
  const meta = result?._meta ?? null;

  return (
    <CapabilityPage
      title="Caching"
      chapter="Book Ch 31"
      description="Cacheable results carry top-level cache hints — ttlMs (how long the value stays fresh) and cacheScope (how widely it may be shared: public or private). A spec-aware client can serve the cached value without a round-trip until the TTL lapses. The invocation counter shows whether the server actually re-ran."
      wireFilter={(f) => f.method === 'tools/call' || f.kind === 'response'}
    >
      <Card>
        <CardHeader>
          <CardTitle>cached_quote</CardTitle>
          <CardDescription>Returns a value plus top-level ttlMs / cacheScope.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={() => call.run(() => backend.callTool('cached_quote', {}))}
            disabled={call.loading}
            data-testid="run-caching"
          >
            Fetch quote
          </Button>

          {result ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="cache-hints">
              <Badge variant="green">ttlMs: {String(result.ttlMs)}</Badge>
              <Badge variant="blue">cacheScope: {String(result.cacheScope)}</Badge>
              <Badge variant="slate">invocation #{String(meta?.invocation)}</Badge>
            </div>
          ) : null}

          {meta ? <JsonBlock value={meta} /> : null}
          <ApiResultView result={call.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
