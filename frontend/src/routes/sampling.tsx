/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';

import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function SamplingPage() {
  const call = useAsync<ApiResult<any>>();
  const info = useAsync<any>();
  const [text, setText] = useState(
    'The Model Context Protocol is a standard that connects AI models to external tools and data over a single wire protocol.',
  );

  useEffect(() => {
    void info.run(() => backend.info());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const provider: string | undefined = info.data?.sampling?.provider;
  const isMock = provider?.startsWith('mock');

  return (
    <CapabilityPage
      title="Sampling"
      chapter="Book Ch 21"
      deprecated="Sampling is a deprecated client capability — use Elicitation (§20) for structured user input; the includeContext values 'thisServer'/'allServers' are deprecated too."
      description="The server borrows the client's model via MRTR (sampling/createMessage). The backend handles it by calling DeepSeek through its Anthropic-compatible endpoint. Watch the sampling request and the model's reply on the wire."
      wireFilter={(f) =>
        f.method === 'tools/call' ||
        f.method === 'sampling/createMessage' ||
        f.kind === 'note' ||
        f.kind === 'response'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Model provider</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant={isMock ? 'amber' : 'green'} data-testid="sampling-provider">
            {provider ?? '…'}
          </Badge>
          {isMock ? (
            <span className="ml-2 text-xs text-slate-500">
              Set DEEPSEEK_API_KEY in backend/.env for a real DeepSeek answer.
            </span>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>summarize (uses sampling)</CardTitle>
          <CardDescription>The tool asks the client to summarize the text.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} />
          <Button
            onClick={() => call.run(() => backend.callTool('summarize', { text }))}
            disabled={call.loading}
            data-testid="run-sampling"
          >
            Summarize
          </Button>
          <ApiResultView result={call.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
