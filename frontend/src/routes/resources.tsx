/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';

import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function ResourcesPage() {
  const list = useAsync<ApiResult<any>>();
  const read = useAsync<ApiResult<any>>();
  const [uri, setUri] = useState('docs://readme');

  useEffect(() => {
    void list.run(() => backend.listResources());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resources = list.data?.ok ? (list.data.result.resources as any[]) : [];

  return (
    <CapabilityPage
      title="Resources"
      chapter="Book Ch 14"
      description="Resources are the app-controlled primitive: data identified by an opaque URI that the client reads. List them, then read one."
      wireFilter={(f) => f.method?.startsWith('resources/') || f.kind === 'response'}
    >
      <Card>
        <CardHeader>
          <CardTitle>resources/list</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => list.run(() => backend.listResources())}
          >
            Refresh
          </Button>
          <div className="flex flex-wrap gap-2">
            {resources.map((r) => (
              <button
                key={r.uri}
                type="button"
                onClick={() => setUri(r.uri)}
                className="rounded-md border border-slate-700 px-2 py-1 font-mono text-xs text-slate-200 hover:bg-slate-800"
              >
                {r.name ?? r.uri}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>resources/read</CardTitle>
          <CardDescription>
            An unresolvable URI returns -32602 (Invalid params) — try editing the URI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="res-uri">uri</Label>
          <Input
            id="res-uri"
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            className="font-mono"
          />
          <Button
            onClick={() => read.run(() => backend.readResource(uri))}
            disabled={read.loading}
            data-testid="run-read"
          >
            Read
          </Button>
          <ApiResultView result={read.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
