import { type ComponentProps, useState } from 'react';

import { ChevronRight } from 'lucide-react';

import { clearFrames, type Frame, useFrames } from '@/lib/debug';
import { cn } from '@/lib/utils';

import { JsonBlock } from './json-block';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

function dirArrow(d: Frame['dir']): string {
  return d === 'send' ? '→' : d === 'recv' ? '←' : '•';
}

function kindVariant(k: Frame['kind']): ComponentProps<typeof Badge>['variant'] {
  switch (k) {
    case 'request':
      return 'outline';
    case 'response':
      return 'secondary';
    case 'error':
      return 'destructive';
    case 'notification':
    case 'elicitation':
      return 'destructive';
    default:
      return 'ghost';
  }
}

function FrameRow({ f }: { f: Frame }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted"
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
        />
        <span className="w-4 shrink-0 text-center text-muted-foreground">{dirArrow(f.dir)}</span>
        <Badge variant={kindVariant(f.kind)}>{f.kind}</Badge>
        <span className="truncate font-mono text-xs text-card-foreground">
          {f.method ?? f.summary}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
          #{f.seq}
        </span>
      </button>
      {open && f.payload != null ? (
        <div className="px-3 pb-2">
          <JsonBlock value={f.payload} />
        </div>
      ) : null}
    </div>
  );
}

export function WireDebug({
  filter,
  title = 'Live wire — JSON-RPC frames',
}: {
  filter?: (f: Frame) => boolean;
  title?: string;
}) {
  const frames = useFrames();
  const shown = filter ? frames.filter(filter) : frames;
  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card text-card-foreground mt-0.75">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-card-foreground">{title}</span>
          <Badge variant="ghost">{shown.length}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={() => clearFrames()}>
          Clear
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" data-testid="wire-frames">
        {shown.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            No frames yet. Trigger an action to watch the wire traffic.
          </p>
        ) : (
          shown.map((f) => <FrameRow key={f.seq} f={f} />)
        )}
      </div>
    </div>
  );
}
