/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';

import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

interface Item {
  id: number;
  name: string;
}

export function PaginationPage() {
  const call = useAsync<ApiResult<any>>();
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(false);

  async function loadPage(reset: boolean) {
    const useCursor = reset ? undefined : cursor;
    const res = await call.run(() =>
      backend.callTool('list_catalog', useCursor ? { cursor: useCursor } : {}),
    );
    if (!res || !res.ok) return;
    const sc = (res.result as any)?.structuredContent ?? {};
    const page: Item[] = sc.items ?? [];
    setItems(reset ? page : [...items, ...page]);
    setCursor(sc.nextCursor);
    setDone(!sc.nextCursor);
  }

  return (
    <CapabilityPage
      title="Pagination"
      chapter="Book Ch 30"
      description="Large lists are returned one page at a time. Each result carries an opaque nextCursor; pass it back to fetch the next page. No nextCursor means you've reached the end. Watch the cursor travel on the wire."
      wireFilter={(f) => f.method === 'tools/call' || f.kind === 'response'}
    >
      <Card>
        <CardHeader>
          <CardTitle>list_catalog</CardTitle>
          <CardDescription>23 items, 5 per page, opaque base64 cursors.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setItems([]);
                setDone(false);
                void loadPage(true);
              }}
              disabled={call.loading}
              data-testid="run-pagination"
            >
              Load first page
            </Button>
            <Button
              variant="outline"
              onClick={() => loadPage(false)}
              disabled={call.loading || done || items.length === 0}
              data-testid="run-next-page"
            >
              {done ? 'No more pages' : 'Load next page'}
            </Button>
          </div>

          {items.length > 0 ? (
            <div
              className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm"
              data-testid="paged-items"
            >
              <div className="mb-1 text-xs text-slate-500">
                {items.length} loaded{cursor ? ` · next cursor: ${cursor}` : done ? ' · end' : ''}
              </div>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-xs text-slate-300">
                {items.map((it) => (
                  <li key={it.id}>
                    #{it.id} {it.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ApiResultView result={call.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
