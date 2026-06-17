/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';

import { backend } from '@/lib/api';
import { type PendingElicitation, removePending, usePending } from '@/lib/debug';

import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

function coerce(
  values: Record<string, unknown>,
  props: Record<string, any>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === '' || v == null) continue;
    const t = props[k]?.type;
    out[k] =
      t === 'number'
        ? Number(v)
        : t === 'integer'
          ? parseInt(String(v), 10)
          : t === 'boolean'
            ? Boolean(v)
            : v;
  }
  return out;
}

function FormElicitation({ p }: { p: PendingElicitation }) {
  const schema = p.params.requestedSchema ?? { properties: {}, required: [] };
  const props: Record<string, any> = schema.properties ?? {};
  const required: string[] = schema.required ?? [];
  const [values, setValues] = useState<Record<string, any>>({});
  const set = (k: string, v: any) => setValues((s) => ({ ...s, [k]: v }));

  async function submit(action: 'accept' | 'decline' | 'cancel') {
    const content = action === 'accept' ? coerce(values, props) : undefined;
    await backend.resolveElicitation(p.pendingId, { action, content });
    removePending(p.pendingId);
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">{p.params.message}</p>
      <div className="space-y-3">
        {Object.entries(props).map(([name, sch]) => (
          <div key={name}>
            <Label htmlFor={`elicit-${name}`}>
              {sch.title ?? name}
              {required.includes(name) ? <span className="text-destructive"> *</span> : null}
            </Label>
            {sch.type === 'boolean' ? (
              <div className="mt-1">
                <input
                  id={`elicit-${name}`}
                  type="checkbox"
                  checked={!!values[name]}
                  onChange={(e) => set(name, e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              </div>
            ) : sch.enum ? (
              <select
                id={`elicit-${name}`}
                value={values[name] ?? ''}
                onChange={(e) => set(name, e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-border bg-background/50 px-2 text-sm text-foreground"
              >
                <option value="">—</option>
                {sch.enum.map((o: string) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`elicit-${name}`}
                type={sch.type === 'number' || sch.type === 'integer' ? 'number' : 'text'}
                value={values[name] ?? ''}
                onChange={(e) => set(name, e.target.value)}
                placeholder={sch.description}
                className="mt-1"
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={() => submit('accept')} data-testid="elicit-accept">
          Submit
        </Button>
        <Button variant="outline" onClick={() => submit('decline')}>
          Decline
        </Button>
        <Button variant="ghost" onClick={() => submit('cancel')}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function UrlElicitation({ p }: { p: PendingElicitation }) {
  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      if (
        e.data?.source === 'mcp-url-elicitation' &&
        e.data.elicitationId === p.params.elicitationId
      ) {
        await backend.resolveElicitation(p.pendingId, { action: e.data.action });
        removePending(p.pendingId);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [p]);

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">{p.params.message}</p>
      <p className="mb-3 break-all font-mono text-xs text-muted-foreground">{p.params.url}</p>
      <div className="flex gap-2">
        <Button
          onClick={() => window.open(p.params.url, 'mcp-elicit', 'width=480,height=440')}
          data-testid="elicit-open-url"
        >
          Open confirmation page
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await backend.resolveElicitation(p.pendingId, { action: 'cancel' });
            removePending(p.pendingId);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function ElicitationHost() {
  const pending = usePending();
  const p = pending[0];
  if (!p) return null;
  const mode = p.params?.mode ?? 'form';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      data-testid="elicitation-modal"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card text-card-foreground p-5 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm font-semibold text-card-foreground">Server elicitation</span>
          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
            {mode} mode
          </span>
        </div>
        {mode === 'url' ? <UrlElicitation p={p} /> : <FormElicitation p={p} />}
      </div>
    </div>
  );
}
