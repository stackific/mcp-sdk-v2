import { useState } from 'react';

import { ChevronRight } from 'lucide-react';

import { clearFrames, type Frame, useFrames } from '@/lib/debug';
import { cn } from '@/lib/utils';

import { JsonBlock } from './json-block';
import { Badge, type BadgeProps } from './ui/badge';
import { Button } from './ui/button';

function dirArrow(d: Frame['dir']): string {
  return d === 'send' ? '→' : d === 'recv' ? '←' : '•';
}

function kindVariant(k: Frame['kind']): BadgeProps['variant'] {
  switch (k) {
    case 'request':
      return 'blue';
    case 'response':
      return 'green';
    case 'error':
      return 'red';
    case 'notification':
    case 'elicitation':
      return 'amber';
    default:
      return 'slate';
  }
}

function FrameRow({ f }: { f: Frame }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-800/60 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-800/40"
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform',
            open && 'rotate-90',
          )}
        />
        <span className="w-4 shrink-0 text-center text-slate-500">{dirArrow(f.dir)}</span>
        <Badge variant={kindVariant(f.kind)}>{f.kind}</Badge>
        <span className="truncate font-mono text-xs text-slate-200">{f.method ?? f.summary}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-600">#{f.seq}</span>
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
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-800 bg-slate-900/60">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-200">{title}</span>
          <Badge variant="slate">{shown.length}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={() => clearFrames()}>
          Clear
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" data-testid="wire-frames">
        {shown.length === 0 ? (
          <p className="p-4 text-xs text-slate-500">
            No frames yet. Trigger an action to watch the wire traffic.
          </p>
        ) : (
          shown.map((f) => <FrameRow key={f.seq} f={f} />)
        )}
      </div>
    </div>
  );
}
