/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';

import { CapabilityPage } from '@/components/capability-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function CompletionPage() {
  const complete = useAsync<ApiResult<any>>();
  const [value, setValue] = useState('e');

  async function suggest(v: string) {
    setValue(v);
    await complete.run(() =>
      backend.complete(
        { type: 'ref/prompt', name: 'greeting' },
        { name: 'language', value: v },
        { arguments: {} },
      ),
    );
  }

  const values: string[] = complete.data?.ok ? (complete.data.result.completion?.values ?? []) : [];

  return (
    <CapabilityPage
      title="Completion"
      chapter="Book Ch 17"
      description="completion/complete is server-driven autocomplete for prompt arguments and template variables. As you type into the 'language' argument of the greeting prompt, the server suggests matching values."
    >
      <Card>
        <CardHeader>
          <CardTitle>completion/complete</CardTitle>
          <CardDescription>ref = ref/prompt greeting, argument = language</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="c-val">language (type to get suggestions)</Label>
            <Input
              id="c-val"
              value={value}
              onChange={(e) => suggest(e.target.value)}
              className="mt-1"
              data-testid="completion-input"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => suggest(value)}
            data-testid="run-complete"
          >
            Request suggestions
          </Button>
          <div className="flex flex-wrap gap-2" data-testid="completion-values">
            {values.length === 0 ? (
              <span className="text-xs text-slate-500">No suggestions.</span>
            ) : (
              values.map((v) => (
                <Badge key={v} variant="blue" data-testid="completion-value">
                  {v}
                </Badge>
              ))
            )}
          </div>
          {!complete.data?.ok && complete.data ? (
            <p className="text-xs text-red-300">{complete.data.error.message}</p>
          ) : null}
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
