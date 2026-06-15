/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';

import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function RootsPage() {
  const call = useAsync<ApiResult<any>>();
  const save = useAsync<any>();
  const [roots, setRoots] = useState(
    JSON.stringify(
      [
        { uri: 'file:///workspace/companion-project', name: 'companion-project' },
        { uri: 'file:///workspace/shared-lib', name: 'shared-lib' },
      ],
      null,
      2,
    ),
  );

  function saveRoots() {
    try {
      const parsed = JSON.parse(roots);
      void save.run(() => backend.setRoots(parsed));
    } catch {
      // invalid JSON — ignore
    }
  }

  return (
    <CapabilityPage
      title="Roots"
      chapter="Book Ch 22"
      deprecated="Roots is a deprecated client capability — convey workspace locations via tool parameters or resource URIs instead."
      description="The inversion: the client exposes its workspace roots to the server (via MRTR roots/list). Edit the roots the client will report, then call the show_roots tool which asks for them."
      wireFilter={(f) =>
        f.method === 'tools/call' ||
        f.method === 'roots/list' ||
        f.kind === 'note' ||
        f.kind === 'response'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Client roots</CardTitle>
          <CardDescription>
            What the client returns when the server calls roots/list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={roots}
            onChange={(e) => setRoots(e.target.value)}
            className="min-h-[120px] font-mono"
          />
          <Button variant="secondary" size="sm" onClick={saveRoots} data-testid="save-roots">
            Save roots
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>show_roots</CardTitle>
          <CardDescription>
            The tool calls roots/list back to the client and returns what it got.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={() => call.run(() => backend.callTool('show_roots', {}))}
            disabled={call.loading}
            data-testid="run-roots"
          >
            Call show_roots
          </Button>
          <ApiResultView result={call.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
