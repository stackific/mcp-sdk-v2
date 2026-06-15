/* eslint-disable @typescript-eslint/no-explicit-any */
import { CapabilityPage } from '@/components/capability-page';
import { JsonBlock } from '@/components/json-block';
import { ApiResultView } from '@/components/result-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function ContentPage() {
  const call = useAsync<ApiResult<any>>();
  const blocks: any[] = call.data?.ok ? ((call.data.result as any).content ?? []) : [];

  return (
    <CapabilityPage
      title="Common Types & Content Blocks"
      chapter="Ch 14"
      story="S20–S21"
      description="The §14 common types are the shared building blocks of MCP. S20 defines the identity primitives (BaseMetadata, Icon/Icons, Implementation); S21 defines the content vocabulary — the ContentBlock discriminated union, the ResourceContents text/blob family, Annotations, and Role. This page calls a tool that returns one of each ContentBlock member and renders it by its case-sensitive type discriminator."
      wireFilter={(f) => f.method === 'tools/call' || f.kind === 'response'}
    >
      <Card>
        <CardHeader>
          <CardTitle>Content gallery</CardTitle>
          <CardDescription>
            Calls tools/call on content_gallery and dispatches each returned ContentBlock on its
            type discriminator.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            data-testid="run-content"
            disabled={call.loading}
            onClick={() => call.run(() => backend.callTool('content_gallery', {}))}
          >
            Run
          </Button>
          {blocks.length > 0 ? (
            <div data-testid="content-gallery" className="space-y-3">
              {blocks.map((b, i) => {
                if (b.type === 'text') {
                  return (
                    <div key={i} className="space-y-1">
                      <Badge variant="blue">text</Badge>
                      <p className="text-sm text-slate-200">{b.text}</p>
                    </div>
                  );
                }
                if (b.type === 'image') {
                  return (
                    <div key={i} className="space-y-1">
                      <Badge variant="green">image</Badge>
                      <img
                        src={`data:${b.mimeType};base64,${b.data}`}
                        className="max-h-32 rounded border border-slate-800"
                      />
                    </div>
                  );
                }
                if (b.type === 'audio') {
                  return (
                    <div key={i} className="space-y-1">
                      <Badge variant="amber">audio</Badge>
                      <audio controls src={`data:${b.mimeType};base64,${b.data}`} />
                    </div>
                  );
                }
                if (b.type === 'resource') {
                  return (
                    <div key={i} className="space-y-1">
                      <Badge variant="slate">resource</Badge>
                      <div className="text-xs font-mono text-slate-400">{b.resource?.uri}</div>
                      <JsonBlock value={b.resource?.text ?? b.resource} />
                    </div>
                  );
                }
                if (b.type === 'resource_link') {
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <Badge variant="blue">resource_link</Badge>
                      <a href={b.uri} className="font-mono text-xs text-blue-300 hover:underline">
                        {b.name ?? b.uri}
                      </a>
                    </div>
                  );
                }
                return (
                  <div key={i} className="space-y-1">
                    <Badge variant="red">{String(b.type)}</Badge>
                    <p className="text-xs text-slate-400">
                      Unrecognized type — treated as unsupported content, the message is not failed.
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}
          <ApiResultView result={call.data} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-400">
          <p>
            ContentBlock is a discriminated union dispatched on a case-sensitive type string. An
            unrecognized type SHOULD be treated as unsupported content rather than failing the whole
            message.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-mono text-slate-300">text</span> /{' '}
              <span className="font-mono text-slate-300">image</span> /{' '}
              <span className="font-mono text-slate-300">audio</span> — inline blocks; image and
              audio carry Base64 data plus a required mimeType.
            </li>
            <li>
              <span className="font-mono text-slate-300">resource_link</span> references a resource
              by uri (reusing BaseMetadata name/title and the Icons mixin) instead of embedding it.
            </li>
            <li>
              <span className="font-mono text-slate-300">resource</span> (EmbeddedResource) nests a
              ResourceContents value: exactly one of text (TextResourceContents) XOR blob
              (BlobResourceContents) — never both.
            </li>
            <li>
              Annotations are optional, untrusted hints — audience (an array of Role), priority in
              the inclusive range 0..1, and an ISO 8601 lastModified — used only for presentation,
              never for security or correctness.
            </li>
            <li>Role is the closed set "user" | "assistant"; any other value is invalid.</li>
            <li>
              From S20: Implementation composes BaseMetadata (name/title) plus a required version,
              optional description/websiteUrl, and the Icons mixin (each Icon has src, mimeType,
              sizes, theme); these identity primitives carry an optional _meta object.
            </li>
          </ul>
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
