"use client";

import { useEffect, useState } from "react";
import type { QueryResult } from "@/lib/queries";

/**
 * Minimal async-query hook, keyed by a string.
 *
 * Deliberately not a data-fetching library: the app makes a handful of RPC
 * calls that all key off the selected area. Swap in TanStack Query if caching
 * across views becomes worth the weight.
 *
 * The key resets the state during render rather than in an effect, so changing
 * the area shows "loading" on the same pass instead of briefly re-showing the
 * previous area's data.
 */

export type RpcState<T> = { status: "loading" } | QueryResult<T>;

export function useRpc<T>(
  run: () => Promise<QueryResult<T>>,
  key: string,
): RpcState<T> {
  const [state, setState] = useState<RpcState<T>>({ status: "loading" });
  const [activeKey, setActiveKey] = useState(key);

  if (key !== activeKey) {
    setActiveKey(key);
    setState({ status: "loading" });
  }

  useEffect(() => {
    let cancelled = false;

    run()
      .then((result) => {
        // Guard against an earlier request resolving after a later one.
        if (!cancelled) setState(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
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
