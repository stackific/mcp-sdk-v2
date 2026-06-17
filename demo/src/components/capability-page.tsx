import { type ReactNode } from 'react';

import { useLocation } from '@tanstack/react-router';

import { type Frame } from '@/lib/debug';
import { getLanguage } from '@/lib/languages';
import { patternDocUrl } from '@/lib/patterns';

import { Badge } from './ui/badge';
import { WireDebug } from './wire-debug';

export function CapabilityPage({
  title,
  chapter,
  story,
  description,
  children,
  wireFilter,
  deprecated,
}: {
  title: string;
  chapter?: string;
  story?: string;
  description?: ReactNode;
  children: ReactNode;
  wireFilter?: (f: Frame) => boolean;
  /** When set, marks the feature Deprecated (§27.3); a string is shown as the migration note. */
  deprecated?: boolean | string;
}) {
  // Link this page to its implementation pattern doc for the currently selected language stack.
  const pathname = useLocation({ select: (l) => l.pathname });
  const docUrl = patternDocUrl(pathname);
  const language = getLanguage();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {chapter ? <Badge variant="outline">{chapter}</Badge> : null}
          {story ? <Badge variant="ghost">{story}</Badge> : null}
          {deprecated ? <Badge variant="destructive">Deprecated</Badge> : null}
        </div>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
        {typeof deprecated === 'string' ? (
          <p className="mt-1 max-w-3xl text-sm text-amber-400">
            ⚠ Deprecated (§27.3): {deprecated} It stays fully functional and behaves exactly as
            specified until removed; new implementations SHOULD NOT adopt it.
          </p>
        ) : null}
        {docUrl ? (
          <a
            href={docUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="pattern-doc-link"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
          >
            View the {language.label} implementation pattern ↗
          </a>
        ) : null}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-h-0 space-y-4 overflow-auto p-1">{children}</div>
        <div className="min-h-0">
          <WireDebug filter={wireFilter} />
        </div>
      </div>
    </div>
  );
}
