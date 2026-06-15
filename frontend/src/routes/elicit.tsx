import { useParams } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';

export function ElicitConfirmPage() {
  const { id } = useParams({ from: '/elicit/$id' });

  function respond(action: 'accept' | 'decline') {
    if (window.opener) {
      window.opener.postMessage({ source: 'mcp-url-elicitation', elicitationId: id, action }, '*');
    }
    window.close();
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h1 className="text-lg font-semibold text-slate-100">Out-of-band confirmation</h1>
        <p className="mt-2 text-sm text-slate-400">
          This page stands in for a sensitive interaction (payment, OAuth consent, …) that the
          server requested via URL elicitation (book Ch 20).
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Elicitation id: <span className="font-mono text-slate-300">{id}</span>
        </p>
        <div className="mt-5 flex gap-2">
          <Button onClick={() => respond('accept')} data-testid="confirm-accept">
            Confirm
          </Button>
          <Button variant="outline" onClick={() => respond('decline')}>
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}
