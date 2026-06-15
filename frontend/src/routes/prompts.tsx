/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';

import { CapabilityPage } from '@/components/capability-page';
import { ApiResultView } from '@/components/result-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { backend, type ApiResult } from '@/lib/api';
import { useAsync } from '@/lib/use-async';

export function PromptsPage() {
  const list = useAsync<ApiResult<any>>();
  const get = useAsync<ApiResult<any>>();
  const [pname, setPname] = useState('Ada');
  const [lang, setLang] = useState('english');

  useEffect(() => {
    void list.run(() => backend.listPrompts());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prompts = list.data?.ok ? (list.data.result.prompts as any[]) : [];

  return (
    <CapabilityPage
      title="Prompts"
      chapter="Book Ch 16"
      description="Prompts are the user-controlled primitive: reusable, server-authored message templates a user invokes. List them, then expand the 'greeting' prompt with arguments."
      wireFilter={(f) => f.method?.startsWith('prompts/') || f.kind === 'response'}
    >
      <Card>
        <CardHeader>
          <CardTitle>prompts/list</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => list.run(() => backend.listPrompts())}
          >
            Refresh
          </Button>
          <div className="mt-2 space-y-1">
            {prompts.map((p) => (
              <div key={p.name} className="text-xs text-slate-300">
                <span className="font-mono">{p.name}</span> — {p.description}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>prompts/get — greeting</CardTitle>
          <CardDescription>The expanded messages are ready to feed to a model.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="p-name">name</Label>
              <Input
                id="p-name"
                value={pname}
                onChange={(e) => setPname(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="p-lang">language</Label>
              <Input
                id="p-lang"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <Button
            onClick={() =>
              get.run(() => backend.getPrompt('greeting', { name: pname, language: lang }))
            }
            disabled={get.loading}
            data-testid="run-prompt"
          >
            Get prompt
          </Button>
          <ApiResultView result={get.data} />
        </CardContent>
      </Card>
    </CapabilityPage>
  );
}
