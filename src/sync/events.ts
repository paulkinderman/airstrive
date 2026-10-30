import { useEffect, useState } from 'react';

/** Tells screens that data in SQLite changed, from a sync pull or a local edit, so they can reload. */
const listeners = new Set<() => void>();
let version = 0;

export function emitDataChanged() {
  version++;
  for (const l of listeners) l();
}

/** A number that changes whenever a pull or a local edit changes data. Add it to a screen's reload deps. */
export function useDataVersion() {
  const [v, setV] = useState(version);
  useEffect(() => {
    const l = () => setV(version);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return v;
}
