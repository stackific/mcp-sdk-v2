/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function ErrorsPage() {
  const proto = useAsync<ApiResult<any>>();
  const badArgs = useAsync<ApiResult<any>>();
  const toolErr = useAsync<ApiResult<any>>();
  const method = useAsync<ApiResult<any>>();

  return (
    <CapabilityPage
      title="Errors"
      chapter="Book Ch 12"
      description="Two channels. A TOOL error rides inside a SUCCESSFUL result (isError:true) so the model can see and recover. A PROTOCOL error is a JSON-RPC error response handled by the client/host. The codes below are -32602 (invalid params, two flavors) and -32601 (method not found)."
      wireFilter={(f) =>
        f.method === 'tools/call' ||
        f.method === 'does/not/exist' ||
        f.kind === 'response' ||
        f.kind === 'error'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Protocol error — unknown tool</CardTitle>
          <CardDescription>Returns -32602 Invalid params (a JSON-RPC error).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={() => proto.run(() => backend.callTool('does_not_exist', {}))}
            disabled={proto.loading}
            data-testid="run-proto-error"
          >
            Call a tool that does not exist
          </Button>
          <ApiResultView result={proto.data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Protocol error — invalid arguments</CardTitle>
          <CardDescription>
            Calls add with a non-number — schema validation fails with -32602.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={() => badArgs.run(() => backend.callTool('add', { a: 'not-a-number', b: 2 }))}
            disabled={badArgs.loading}
            data-testid="run-badargs-error"
          >
            Call add with a bad argument
          </Button>
          <ApiResultView result={badArgs.data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tool error — divide by zero</CardTitle>
          <CardDescription>
            Returns a successful result with isError:true (note: NOT a JSON-RPC error).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={() => toolErr.run(() => backend.callTool('divide', { a: 1, b: 0 }))}
            disabled={toolErr.loading}
            data-testid="run-tool-error"
          >
            Divide by zero
          </Button>
          <ApiResultView result={toolErr.data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Method not found — unknown method</CardTitle>
          <CardDescription>
            Calls a JSON-RPC method the server does not implement → -32601 Method not found (a
            protocol error). (server/discover, by contrast, is implemented — see the Overview page.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={() => method.run(() => backend.raw('does/not/exist', {}))}
            disabled={method.loading}
            data-testid="run-method-error"
          >
            Call an unimplemented method
          </Button>
          <ApiResultView result={method.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
