/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function JsonModelPage() {
  const call = useAsync<ApiResult<any>>();
  return (
    <CapabilityPage
      title="JSON Value Model & Forward Compatibility"
      chapter="Ch 2"
      story="S02"
      description="MCP is built on a single JSON value model (JSONValue: string, number, boolean, null, object, or array). A core invariant of that model is forward compatibility: receivers MUST ignore object members and _meta keys they do not recognize rather than rejecting the message. This page calls the echo tool with an extra unrecognized argument and an unknown _meta key to demonstrate the server accepts and ignores both while still returning the echoed value."
      wireFilter={(f) => f.method === 'tools/call' || f.kind === 'response'}
    >
      <Card>
        <CardHeader>
          <CardTitle>Echo with unknown fields</CardTitle>
          <CardDescription>
            Calls echo with an unrecognized argument (unknownExtra) and an unknown _meta key
            (companion/unknown-meta). The server should ignore both and still echo back.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            data-testid="run-json-model"
            disabled={call.loading}
            onClick={() =>
              call.run(() =>
                backend.callToolTraced(
                  'echo',
                  { text: 'hello', unknownExtra: 123 },
                  { 'companion/unknown-meta': true },
                ),
              )
            }
          >
            Run
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
            Every value on the wire is one of six JSONValue forms. This story fixes the
            cross-cutting rules that govern how those values are encoded, named, numerically
            bounded, and extended.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Ignore unknown members:</strong> receivers MUST ignore object members and
              _meta keys they do not recognize rather than rejecting the message; an unrecognized
              member MUST NOT make the message malformed or alter how recognized members are
              processed.
            </li>
            <li>
              <strong>Integer vs number:</strong> JSON has one numeric type. An "integer" field is a
              JSON number with no fractional part; a value with a fractional component is rejected
              where an integer is required.
            </li>
            <li>
              <strong>Safe-integer range:</strong> identifiers and counters MUST stay within the
              inclusive range -9007199254740991..9007199254740991; values are compared without loss
              of precision and there are no NaN or Infinity values in the model.
            </li>
            <li>
              <strong>Numeric equality:</strong> two numerically equal numbers (e.g. 1, 1.0, 1e0)
              are treated as equal regardless of textual form.
            </li>
            <li>
              <strong>Strings are UTF-8:</strong> all JSON text exchanged is encoded as UTF-8, and
              every protocol-defined name is case-sensitive and matched byte-for-byte.
            </li>
          </ul>
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
