/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function ElicitationPage() {
  const form = useAsync<ApiResult<any>>();
  const url = useAsync<ApiResult<any>>();

  return (
    <CapabilityPage
      title="Elicitation"
      chapter="Book Ch 19–20"
      description="A tool pauses mid-call and asks the user for input (MRTR). The server's elicitInput surfaces here as a modal; your answer flows back and the tool resumes. Watch the elicitation/create request and the resumed result on the wire."
      wireFilter={(f) =>
        f.method === 'tools/call' ||
        f.method === 'elicitation/create' ||
        f.kind === 'elicitation' ||
        f.kind === 'note' ||
        f.kind === 'response'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Form elicitation</CardTitle>
          <CardDescription>
            register_user requests a structured form. A modal collects username/email/newsletter.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={() => form.run(() => backend.callTool('register_user', {}))}
            disabled={form.loading}
            data-testid="run-elicit-form"
          >
            Call register_user
          </Button>
          <ApiResultView result={form.data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>URL elicitation</CardTitle>
          <CardDescription>
            confirm_purchase hands off to a browser confirmation page (for sensitive/out-of-band
            flows).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={() => url.run(() => backend.callTool('confirm_purchase', {}))}
            disabled={url.loading}
            data-testid="run-elicit-url"
          >
            Call confirm_purchase
          </Button>
          <ApiResultView result={url.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
