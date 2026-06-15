/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function MrtrPage() {
  const call = useAsync<ApiResult<any>>();
  return (
    <CapabilityPage
      title="Multi-Round-Trip Requests"
      chapter="Ch 11"
      story="S17"
      description='A multi-round-trip request (MRTR) is the single protocol-wide mechanism by which a server gathers client-only input while processing a request. Instead of opening an independent server-to-client request, the server completes the in-flight response with an "input_required" result naming what it needs; the client fulfills it locally and retries the same method with the same arguments plus the gathered inputResponses and the verbatim requestState. Here, calling the summarize tool drives that loop: the server pauses to request a sampling/createMessage, the client runs the model, then the original tools/call completes.'
      wireFilter={(f) =>
        f.method === 'tools/call' ||
        f.method === 'sampling/createMessage' ||
        f.kind === 'note' ||
        f.kind === 'response'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Drive a round trip</CardTitle>
          <CardDescription>
            Calls the summarize tool; the server mid-call asks the client to run the model, then
            resumes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            data-testid="run-mrtr"
            disabled={call.loading}
            onClick={() =>
              call.run(() =>
                backend.callTool('summarize', {
                  text: 'The Model Context Protocol connects AI apps to tools and data over one wire protocol.',
                }),
              )
            }
          >
            Run summarize (MRTR)
          </Button>
          <ApiResultView result={call.data} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-400">
          <p>
            One client request can spawn nested server-to-client requests on the same stream. The
            server never opens an independent request: it returns an <code>"input_required"</code>{' '}
            result on the original response naming what it needs, and the client retries the same
            method with the gathered responses plus the opaque <code>requestState</code> token.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              The <code>input_required</code> pattern is the sole way a server solicits input
              mid-call; the retry is a brand-new request (new id), not a response.
            </li>
            <li>
              <strong>Elicitation</strong> and <strong>sampling</strong> are the two main MRTR
              triggers (with <code>roots/list</code> as the third kind) &mdash; see the dedicated
              Elicitation and Sampling pages.
            </li>
            <li>
              <code>requestState</code> is an opaque continuation token the client echoes back
              byte-for-byte; the loop repeats until a <code>"complete"</code> result or an error.
            </li>
            <li>
              A server may only ask for input kinds the client declared; otherwise it returns the
              missing-capability error <code>-32003</code>.
            </li>
            <li>
              Participating methods are <code>tools/call</code>, <code>prompts/get</code>, and{' '}
              <code>resources/read</code>.
            </li>
          </ul>
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
