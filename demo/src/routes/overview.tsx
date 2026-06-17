/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'react';

import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useStatus } from '@/lib/debug';
import { getLanguageId, LANGUAGES, setLanguage } from '@/lib/languages';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';

/**
 * Card that lets the user pick the language stack backing the companion. The shared
 * frontend stays the same; the choice repoints it at that language's MCP client host
 * (a different backend + server configuration). TypeScript is fully wired; Python and
 * C# are runnable placeholders.
 */
function LanguageSelector() {
  const currentId = getLanguageId();
  return (
    <Card data-testid="language-selector">
      <CardHeader>
        <CardTitle>Language stack</CardTitle>
        <CardDescription>
          Choose the implementation that backs this companion. The frontend is shared; your choice
          repoints it at that language's MCP client host — a different backend + server setup on its
          own ports. <strong>TypeScript</strong> and <strong>Python</strong> are fully wired (real
          MCP via their SDKs); C# is a runnable placeholder.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {LANGUAGES.map((lang) => {
            const active = lang.id === currentId;
            return (
              <button
                key={lang.id}
                type="button"
                onClick={() => {
                  if (!active) setLanguage(lang.id);
                }}
                aria-pressed={active}
                data-testid={`lang-${lang.id}`}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                  active
                    ? 'border-primary/60 bg-primary/15 ring-1 ring-inset ring-primary/40'
                    : 'border-border bg-card/40 hover:border-border hover:bg-accent',
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-sm font-semibold text-card-foreground">{lang.label}</span>
                  {active ? (
                    <Badge variant="outline">selected</Badge>
                  ) : lang.status === 'preview' ? (
                    <Badge variant="ghost">preview</Badge>
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground">{lang.tagline}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {lang.clientUrl}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewPage() {
  const status = useStatus();
  const connect = useAsync<ApiResult<any>>();
  const discover = useAsync<ApiResult<any>>();

  useEffect(() => {
    void connect.run(() => backend.connect());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CapabilityPage
      title="Overview & Discovery"
      chapter="Book Ch 6–11"
      description={
        <>
          The page drives an MCP <strong>client that runs in the backend</strong> (the SDK's client
          runtime, hosted server-side), connected to the Hono MCP server over{' '}
          <strong>Streamable HTTP</strong>. Every action you take streams its real JSON-RPC frames
          to the panel on the right.
        </>
      }
    >
      <LanguageSelector />

      <Card>
        <CardHeader>
          <CardTitle>Connection &amp; negotiated version</CardTitle>
          <CardDescription>
            The client performs the initialize handshake and negotiates a protocol version.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status.connected ? 'secondary' : 'ghost'}>
              {status.connected ? 'connected' : 'connecting…'}
            </Badge>
            {status.negotiatedVersion ? (
              <Badge variant="outline">protocol {status.negotiatedVersion}</Badge>
            ) : null}
            {status.serverInfo?.name ? (
              <Badge variant="ghost">{status.serverInfo.name}</Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            This client speaks <span className="font-mono">2026-07-28</span> — a stateless,
            handshake-less revision. The negotiated version is established by{' '}
            <span className="font-mono">server/discover</span> (below), not by an initialize
            handshake.
          </p>
          <Button
            onClick={() => connect.run(() => backend.connect())}
            disabled={connect.loading}
            data-testid="run-connect"
          >
            Reconnect
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>server/discover (Ch 9)</CardTitle>
          <CardDescription>
            In <span className="font-mono">2026-07-28</span>,{' '}
            <span className="font-mono">server/discover</span> replaces the initialize handshake:
            one round-trip returns the server's identity, capabilities, and supported revisions.
            Click below to see the live result.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={() => discover.run(() => backend.discover())}
            disabled={discover.loading}
            data-testid="run-discover"
          >
            Call server/discover
          </Button>
          <ApiResultView result={discover.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
