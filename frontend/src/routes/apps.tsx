/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';

import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

interface HostLogEntry {
  dir: 'in' | 'out';
  type: string;
  payload: unknown;
}

export function AppsPage() {
  const call = useAsync<ApiResult<any>>();
  const [html, setHtml] = useState<string | null>(null);
  const [log, setLog] = useState<HostLogEntry[]>([]);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Receive messages from the sandboxed MCP App (the postMessage bridge).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || msg.source !== 'mcp-app') return;
      setLog((l) => [...l, { dir: 'in', type: msg.type, payload: msg.payload }]);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  async function launch() {
    const res = await call.run(() => backend.callTool('open_counter_app', {}));
    if (!res || !res.ok) return;
    const result = res.result as any;
    const content: any[] = result?.content ?? [];
    // The host reads the UI association from `_meta.ui.resourceUri` (§26.3), then
    // renders the embedded ui:// resource (mimeType `text/html;profile=mcp-app`).
    const resourceUri = result?._meta?.ui?.resourceUri as string | undefined;
    const ui = content.find(
      (c) =>
        c.type === 'resource' &&
        (c.resource?.uri === resourceUri ||
          (typeof c.resource?.mimeType === 'string' &&
            c.resource.mimeType.startsWith('text/html'))),
    );
    if (ui?.resource?.text) setHtml(ui.resource.text);
  }

  function sendToApp(type: string, payload: unknown) {
    frameRef.current?.contentWindow?.postMessage({ target: 'mcp-app', type, payload }, '*');
    setLog((l) => [...l, { dir: 'out', type, payload }]);
  }

  return (
    <CapabilityPage
      title="MCP Apps (UI extension)"
      chapter="Book Ch 43"
      description="The Apps extension lets a server ship an interactive UI as a ui:// resource. The host renders it in a sandboxed iframe (allow-scripts, no same-origin) and the app talks back over a postMessage bridge — so a server can present rich UI without the host trusting its code."
      wireFilter={(f) =>
        f.method === 'tools/call' || f.method === 'resources/read' || f.kind === 'response'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>open_counter_app → ui://counter</CardTitle>
          <CardDescription>
            Launch the embedded MCP App and exchange messages with it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={launch} disabled={call.loading} data-testid="run-app">
            Launch app
          </Button>

          {html ? (
            <div
              className="overflow-hidden rounded-md border border-slate-800"
              data-testid="app-frame"
            >
              <iframe
                ref={frameRef}
                title="MCP App: counter"
                srcDoc={html}
                sandbox="allow-scripts"
                className="h-[320px] w-full bg-slate-950"
              />
            </div>
          ) : null}

          {html ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => sendToApp('set', { count: 100 })}
                data-testid="app-set"
              >
                Host → set count = 100
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => sendToApp('note', { text: 'hello from host' })}
              >
                Host → send note
              </Button>
            </div>
          ) : null}

          {log.length > 0 ? (
            <div
              className="rounded-md border border-slate-800 bg-slate-900/40 p-2 text-xs"
              data-testid="app-bridge-log"
            >
              <div className="mb-1 text-slate-500">postMessage bridge</div>
              <ul className="space-y-0.5 font-mono">
                {log.slice(-8).map((e, i) => (
                  <li key={i} className={e.dir === 'in' ? 'text-emerald-300' : 'text-blue-300'}>
                    {e.dir === 'in' ? '← app' : '→ app'} {e.type} {JSON.stringify(e.payload)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ApiResultView result={call.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
