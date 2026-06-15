import { useState } from 'react';

export function useAsync<T = unknown>() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<T>): Promise<T | undefined> {
    setLoading(true);
    setError(null);
    try {
      const d = await fn();
      setData(d);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    data,
    error,
    run,
    reset: () => {
      setData(null);
      setError(null);
    },
  };
}
