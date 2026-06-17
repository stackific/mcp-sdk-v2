/* eslint-disable @typescript-eslint/no-explicit-any */
import { type ApiResult } from '@/lib/api';

import { JsonBlock } from './json-block';

export function ApiResultView({
  result,
  label = 'Result',
}: {
  result: ApiResult<any> | null;
  label?: string;
}) {
  if (!result) return null;
  if (result.ok) {
    return (
      <div data-testid="result-ok">
        <div className="mb-1 text-xs font-medium text-emerald-300">{label}</div>
        <JsonBlock value={result.result} />
      </div>
    );
  }
  return (
    <div
      className="rounded-md border border-destructive/40 bg-destructive/10 p-3"
      data-testid="result-error"
    >
      <div className="text-sm font-semibold text-destructive">
        Protocol error{' '}
        {result.error.code != null ? (
          <span className="font-mono">({result.error.code})</span>
        ) : null}
      </div>
      <div className="text-sm text-destructive">{result.error.message}</div>
      {result.error.data != null ? <JsonBlock value={result.error.data} className="mt-2" /> : null}
    </div>
  );
}
