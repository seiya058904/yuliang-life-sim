import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

const ViewMemoryContext = createContext<Map<string, unknown> | null>(null);

/** Presentation only: a new game remounts this provider, and nothing enters the save. */
export function ViewMemory({ children }: { children: ReactNode }) {
  const memory = useRef(new Map<string, unknown>());
  return <ViewMemoryContext.Provider value={memory.current}>{children}</ViewMemoryContext.Provider>;
}

export function useViewState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const memory = useContext(ViewMemoryContext);
  const [value, setValue] = useState<T>(() => memory?.has(key)
    ? memory.get(key) as T
    : typeof initial === 'function' ? (initial as () => T)() : initial);
  useEffect(() => { memory?.set(key, value); }, [key, memory, value]);
  return [value, setValue];
}
