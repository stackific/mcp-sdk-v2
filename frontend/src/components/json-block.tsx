import { cn } from '@/lib/utils';

export function JsonBlock({ value, className }: { value: unknown; className?: string }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <pre
      className={cn(
        'max-h-80 overflow-auto rounded-md bg-slate-950/70 p-3 font-mono text-xs leading-relaxed text-slate-300 ring-1 ring-inset ring-slate-800',
        className,
      )}
    >
      {text}
    </pre>
  );
}
