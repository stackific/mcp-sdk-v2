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

export function TemplatesPage() {
  const list = useAsync<ApiResult<any>>();
  const read = useAsync<ApiResult<any>>();
  const [city, setCity] = useState('oslo');

  useEffect(() => {
    void list.run(() => backend.listResourceTemplates());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const templates = list.data?.ok ? (list.data.result.resourceTemplates as any[]) : [];
  const uri = `weather://${city}/current`;

  return (
    <CapabilityPage
      title="Resource Templates"
      chapter="Book Ch 15"
      description="A template is a URI pattern (RFC 6570). Fill the {city} variable and read the resulting concrete URI with the ordinary resources/read. Completion (Ch 17) suggests values for the variable."
      wireFilter={(f) =>
        f.method?.startsWith('resources/') ||
        f.method === 'completion/complete' ||
        f.kind === 'response'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>resources/templates/list</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => list.run(() => backend.listResourceTemplates())}
          >
            Refresh
          </Button>
          <div className="mt-2 space-y-1">
            {templates.map((t) => (
              <div key={t.uriTemplate} className="font-mono text-xs text-slate-300">
                {t.uriTemplate}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expand &amp; read</CardTitle>
          <CardDescription>
            Resolves to <span className="font-mono">{uri}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="tmpl-city">city</Label>
          <Input
            id="tmpl-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="font-mono"
          />
          <Button
            onClick={() => read.run(() => backend.readResource(uri))}
            disabled={read.loading}
            data-testid="run-template-read"
          >
            Read templated resource
          </Button>
          <ApiResultView result={read.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
