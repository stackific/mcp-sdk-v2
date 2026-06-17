/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

const METHODS = [
  'initialize',
  'server/discover',
  'tools/list',
  'tools/call',
  'resources/list',
  'resources/read',
  'resources/templates/list',
  'subscriptions/listen',
  'prompts/list',
  'prompts/get',
  'completion/complete',
  'logging/setLevel',
  'ping',
  'tasks/get',
  'tasks/result',
  'tasks/list',
  'tasks/cancel',
  'elicitation/create',
  'sampling/createMessage',
  'roots/list',
];

const ERROR_CODES = [
  { code: '-32700', name: 'Parse error' },
  { code: '-32600', name: 'Invalid request' },
  { code: '-32601', name: 'Method not found' },
  { code: '-32602', name: 'Invalid params' },
  { code: '-32603', name: 'Internal error' },
  { code: '-32002', name: 'Resource not found (MCP)' },
  { code: '-32001', name: 'HeaderMismatch (MCP, in -32000..-32099)' },
];

const META_KEYS = [
  'io.modelcontextprotocol/protocolVersion (REQUIRED on every client request)',
  'io.modelcontextprotocol/clientInfo (REQUIRED on every client request)',
  'io.modelcontextprotocol/clientCapabilities (REQUIRED on every client request)',
  'io.modelcontextprotocol/logLevel (OPTIONAL, Deprecated)',
  'progressToken (OPTIONAL, bare reserved-by-exception)',
  'traceparent / tracestate / baggage (OPTIONAL, bare reserved-by-exception)',
];

const CAPABILITIES = [
  'client: elicitation, roots, sampling (Deprecated), extensions',
  'server: tools, resources, prompts, completions, logging, extensions',
  'extensions: io.modelcontextprotocol/tasks, io.modelcontextprotocol/ui',
];

export function RegistriesPage() {
  const call = useAsync<ApiResult<any>>();
  const tools = call.data?.ok ? ((call.data.result.tools as any[]) ?? []) : [];
  return (
    <CapabilityPage
      title="Consolidated Registries"
      chapter="App. A–E"
      story="S46"
      description="The capstone reference appendices (A–E) consolidate the entire wire surface of the spec into five authoritative tables: the Method &amp; Notification Index, the Error Code Registry, the Reserved _meta Key Registry, the Capability Registry, and the Consolidated Type Index. They define no new types — each row points to the section that normatively owns it and restates a few cross-cutting rules. This page enumerates the standard registry contents statically and queries the live server's tools/list so its actual method surface can be compared against the index."
      wireFilter={(f) => f.method === 'tools/list' || f.kind === 'response'}
    >
      <Card>
        <CardHeader>
          <CardTitle>Live method surface</CardTitle>
          <CardDescription>
            Calls tools/list and renders the server's actual tool names as badges to compare against
            the Method &amp; Notification Index.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            data-testid="run-registries"
            disabled={call.loading}
            onClick={() => call.run(() => backend.listTools())}
          >
            Load live registry
          </Button>
          <div data-testid="registry-methods" className="flex flex-wrap gap-1.5">
            {tools.map((t) => (
              <Badge key={t.name} variant="outline">
                {t.name}
              </Badge>
            ))}
          </div>
          <ApiResultView result={call.data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Method &amp; Notification Index (Appendix A)</CardTitle>
          <CardDescription>
            Every method and notification name defined by the document.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {METHODS.map((m) => (
              <Badge key={m} variant="ghost">
                {m}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Error Code Registry (Appendix B)</CardTitle>
          <CardDescription>
            Implementation-defined codes MUST NOT collide with these; additions are permitted only
            within the reserved range -32000..-32099 (where -32001 already lives).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {ERROR_CODES.map((e) => (
              <li key={e.code}>
                <span className="font-mono text-muted-foreground">{e.code}</span> — {e.name}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reserved _meta Key Registry (Appendix C)</CardTitle>
          <CardDescription>
            Keys with the io.modelcontextprotocol/ prefix, plus the bare keys reserved by exception.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {META_KEYS.map((k) => (
              <li key={k}>
                <span className="font-mono text-muted-foreground">{k}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Capability Registry (Appendix D)</CardTitle>
          <CardDescription>Negotiated client, server, and extension capabilities.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {CAPABILITIES.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Appendices A–E are governance artifacts: each is a single consolidated table that
            indexes one category of wire surface and points to its defining section, which stays
            normative. The registries only restate a handful of cross-cutting rules.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Custom error codes MUST NOT collide with any listed code; new codes MAY be added only
              within the reserved -32000..-32099 range, avoiding -32001 (HeaderMismatch).
            </li>
            <li>
              Three reserved client keys are REQUIRED in the _meta of every client request:
              protocolVersion, clientInfo, and clientCapabilities.
            </li>
            <li>
              logLevel is OPTIONAL and Deprecated; progressToken, traceparent, tracestate, and
              baggage are OPTIONAL bare keys reserved by exception.
            </li>
            <li>
              The io.modelcontextprotocol/ui host value carries a REQUIRED mimeTypes array (which
              must include "text/html;profile=mcp-app"); a tool's _meta.ui requires a ui://
              resourceUri.
            </li>
            <li>
              Extension-defined identifiers and keys beyond the registry MAY also appear in _meta
              and the extensions map, governed by the extension-mechanism namespacing rules.
            </li>
          </ul>
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
