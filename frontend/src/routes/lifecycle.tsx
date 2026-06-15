/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function LifecyclePage() {
  const call = useAsync<ApiResult<any>>();
  return (
    <CapabilityPage
      title="Feature Lifecycle & Deprecation"
      chapter="Ch 27"
      story="S43"
      description="Every governed feature is Active, Deprecated, or Removed. Deprecation must precede removal: a Deprecated feature stays fully functional and behaves exactly as specified for as long as it remains defined, so deprecated is not the same as gone. This page exercises a registered deprecated feature (Roots) to confirm a peer still honors it without faulting the exchange."
      wireFilter={(f) =>
        f.method === 'tools/call' ||
        f.method === 'roots/list' ||
        f.kind === 'note' ||
        f.kind === 'response'
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Exercise a deprecated feature</CardTitle>
          <CardDescription>
            Calls a tool that reads Roots — a deprecated capability that must remain functional.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            data-testid="run-lifecycle"
            disabled={call.loading}
            onClick={() => call.run(() => backend.callTool('show_roots', {}))}
          >
            Run
          </Button>
          <ApiResultView result={call.data} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Lifecycle stages</CardTitle>
          <CardDescription>
            The three governed states and the V2 registry of deprecated features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-400">
          <table data-testid="lifecycle-table" className="w-full text-left">
            <thead>
              <tr className="text-slate-300">
                <th className="py-1 pr-4">Feature / Stage</th>
                <th className="py-1 pr-4">State</th>
                <th className="py-1">Note</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1 pr-4">Tools, Resources, Prompts</td>
                <td className="py-1 pr-4">
                  <Badge variant="green">Active</Badge>
                </td>
                <td className="py-1">
                  Fully supported; implement as specified, subject to capability negotiation.
                </td>
              </tr>
              <tr>
                <td className="py-1 pr-4">Roots</td>
                <td className="py-1 pr-4">
                  <Badge variant="amber">Deprecated</Badge>
                </td>
                <td className="py-1">
                  Still accepted and functional; discouraged for new use, carries a migration note.
                </td>
              </tr>
              <tr>
                <td className="py-1 pr-4">Sampling</td>
                <td className="py-1 pr-4">
                  <Badge variant="amber">Deprecated</Badge>
                </td>
                <td className="py-1">
                  Still accepted and functional; behavior unchanged by deprecated status.
                </td>
              </tr>
              <tr>
                <td className="py-1 pr-4">Extensions (§24)</td>
                <td className="py-1 pr-4">
                  <Badge variant="blue">Extension</Badge>
                </td>
                <td className="py-1">
                  Own independent lifecycle; the §27.2 window and removal rules do not govern them.
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-400">
          <p>
            §27 defines a three-state lifecycle and disciplines how any feature ages. The key
            normative points:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              A feature MUST pass through Deprecated before Removed — a direct Active→Removed jump
              is forbidden.
            </li>
            <li>
              While Deprecated a feature MUST remain functional and MUST NOT have its observable
              semantics degraded, disabled, or altered just because it is deprecated.
            </li>
            <li>
              A Deprecated feature carries a migration path (or an explicit "none required"); any
              named replacement MUST itself be Active.
            </li>
            <li>
              The minimum window is 12 months (90-day floor under an expedited security exception);
              "earliest removal" marks eligibility only — a feature MAY stay Deprecated
              indefinitely.
            </li>
            <li>
              A peer MUST keep interoperating with a peer that still uses a deprecated feature and
              MUST NOT fault or error the exchange solely for that reliance.
            </li>
            <li>
              Deprecation warnings stay out of band — they MUST NOT be smuggled onto the wire or
              alter the response; this run returns exactly what a non-deprecated call would.
            </li>
            <li>Extensions follow their own lifecycle, not §27.2.</li>
          </ul>
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
