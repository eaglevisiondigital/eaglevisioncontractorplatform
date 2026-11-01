import { useEffect, useState, useCallback } from 'react';
export function useResource<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (active) {
          setLoading(true);
          setError('');
        }
        return loader();
      })
      .then(
        (result) => {
          if (active) {
            setData(result);
            setLoading(false);
          }
        },
        (e) => {
          if (active) {
            setData(undefined);
            setLoading(false);
            setError(e instanceof Error ? e.message : 'Unable to load');
          }
        },
      );
    return () => {
      active = false;
    };
  }, [loader, version]);
  return { data, error, loading, reload };
}
export function useTask() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(work: () => Promise<void>, success = 'Changes saved') {
    setBusy(true);
    setMessage('');
    try {
      await work();
      setMessage(success);
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Operation failed');
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { message, busy, run };
}
export const options = (values: string[]) =>
  values.map((value) => ({ value, label: value.replaceAll('_', ' ') }));
