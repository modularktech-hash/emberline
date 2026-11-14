"use client";

import { useEffect, useState } from "react";

/**
 * Run an async data-layer query (from src/lib/queries.ts) and track it.
 *
 * Deliberately knows nothing about Parquet: it takes any `() => Promise<T>`.
 * `key` must encode every input `run` closes over. When the key changes the
 * state resets to loading during render, so a new area never briefly shows
 * the previous area's data, and a stale response is dropped.
 */

export interface QueryState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

const LOADING = { data: null, error: null, loading: true } as const;

export function useParquet<T>(run: () => Promise<T>, key: string): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>(LOADING);
  const [activeKey, setActiveKey] = useState(key);

  if (key !== activeKey) {
    setActiveKey(key);
    setState(LOADING);
  }

  useEffect(() => {
    let cancelled = false;
    run()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            error: error instanceof Error ? error : new Error(String(error)),
            loading: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
    // `run` closes over the same values `key` encodes, so `key` is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
