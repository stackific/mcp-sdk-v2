/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';

import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function ToolsPage() {
  const list = useAsync<ApiResult<any>>();
  const call = useAsync<ApiResult<any>>();
  const [name, setName] = useState('echo');
  const [args, setArgs] = useState('{"text":"hello MCP"}');

  useEffect(() => {
    void list.run(() => backend.listTools());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function doCall() {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(args || '{}');
    } catch {
      // leave empty on invalid JSON
    }
    void call.run(() => backend.callTool(name, parsed));
  }

  const tools = list.data?.ok ? (list.data.result.tools as any[]) : [];

  return (
    <CapabilityPage
      title="Tools"
      chapter="Book Ch 13"
      description="Tools are the model-controlled primitive. List them, then call one. Note how divide-by-zero returns a TOOL error (isError:true in a successful result) rather than a protocol error. tools/list also carries each tool's behavioural annotations (readOnly/idempotent hints)."
      wireFilter={(f) =>
        f.method === 'tools/list' || f.method === 'tools/call' || f.kind === 'response'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>tools/list</CardTitle>
          <CardDescription>
            Each tool ships a JSON Schema 2020-12 inputSchema; get_weather also has an outputSchema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="secondary" size="sm" onClick={() => list.run(() => backend.listTools())}>
            Refresh
          </Button>
          <div className="flex flex-wrap gap-2">
            {tools.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => setName(t.name)}
                className="rounded-md border border-border px-2 py-1 font-mono text-xs text-card-foreground hover:bg-accent"
              >
                {t.name}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>tools/call</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <Label htmlFor="tool-name">name</Label>
            <Input
              id="tool-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 font-mono"
            />
          </div>
          <div>
            <Label htmlFor="tool-args">arguments (JSON)</Label>
            <Textarea
              id="tool-args"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              className="mt-1 font-mono"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={doCall} disabled={call.loading} data-testid="run-tool">
              Call tool
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setName('get_weather');
                setArgs('{"city":"Oslo"}');
              }}
            >
              get_weather (structured)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setName('divide');
                setArgs('{"a":1,"b":0}');
              }}
            >
              divide by 0 (tool error)
            </Button>
          </div>
          <ApiResultView result={call.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
