/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { JsonBlock } from '@/components/json-block';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type BackendStatus } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function ExtensionsPage() {
  const call = useAsync<BackendStatus>();
  const s = call.data;
  const extensions = s?.serverExtensions ?? null;
  const hasExtensions = !!extensions && Object.keys(extensions).length > 0;
  const tasks = (s?.serverCapabilities as Record<string, unknown> | null | undefined)?.tasks;
  return (
    <CapabilityPage
      title="Extensions Map & Mechanism"
      chapter="Ch 11"
      story="S11·S38"
      description="The extensions map lives on both ClientCapabilities and ServerCapabilities and is how the protocol grows beyond its core. Each key is a namespaced identifier (prefix/name) mapping to a settings object; an extension is active only in the intersection of what both peers advertise. This page reads the negotiated server capabilities to show which extensions (and the standard Tasks capability) the connected server advertises."
      wireFilter={(f) => f.method === 'initialize' || f.kind === 'response'}
    >
      <Card>
        <CardHeader>
          <CardTitle>Negotiated extensions</CardTitle>
          <CardDescription>
            Read the server&apos;s advertised <span className="font-mono">extensions</span> map and
            the <span className="font-mono">tasks</span> capability from negotiated status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            data-testid="run-extensions"
            disabled={call.loading}
            onClick={() => call.run(() => backend.status())}
          >
            Read extensions map
          </Button>
          {s ? (
            hasExtensions ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Server <span className="font-mono">extensions</span> map:
                </p>
                <JsonBlock value={extensions} />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  The server advertises no <span className="font-mono">extensions</span> map. Below
                  is the extension-bearing capability the server does negotiate (Tasks).
                </p>
                <JsonBlock value={{ tasks: tasks ?? null }} />
              </div>
            )
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Extensions let the protocol grow through opt-in, independently versioned additions that
            never break older peers.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Identifiers are <strong>namespaced</strong>: a reverse-DNS prefix, a single slash,
              then a name (e.g. <span className="font-mono">io.modelcontextprotocol/tasks</span>);
              prefixes whose second label is <span className="font-mono">modelcontextprotocol</span>{' '}
              or <span className="font-mono">mcp</span> are reserved.
            </li>
            <li>
              They are <strong>negotiated by intersection</strong>: an extension is active only when
              both peers advertise the same identifier; a peer must never exercise an extension the
              other side did not advertise.
            </li>
            <li>
              They are <strong>optional and disabled by default</strong>: when only one side
              advertises an extension, the supporting peer falls back to core behavior, or rejects
              with an actionable error only if the extension is mandatory.
            </li>
            <li>
              They are <strong>forward-compatible</strong>: unknown capability fields, unknown
              extension keys, and unknown settings keys are ignored, never treated as errors. A{' '}
              <span className="font-mono">null</span> value is malformed and the entry is ignored.
            </li>
            <li>
              <strong>Tasks</strong> (
              <span className="font-mono">io.modelcontextprotocol/tasks</span>) and{' '}
              <strong>Interactive UI</strong> (
              <span className="font-mono">io.modelcontextprotocol/ui</span>) are the standard
              extensions; an active extension may add surface only via methods/notifications,
              reserved <span className="font-mono">_meta</span> keys,{' '}
              <span className="font-mono">resultType</span> values, and fields on existing objects —
              never redefining core.
            </li>
          </ul>
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
