"use client";

import { useState } from "react";

type UseAsyncActionResult = {
  error: string | null;
  runningKey: string | null;
  setError: (message: string | null) => void;
  run: <T>(key: string, action: () => Promise<T>, fallbackMessage: string) => Promise<T | null>;
};

export function useAsyncAction(): UseAsyncActionResult {
  const [error, setError] = useState<string | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);

  async function run<T>(key: string, action: () => Promise<T>, fallbackMessage: string): Promise<T | null> {
    setError(null);
    setRunningKey(key);

    try {
      return await action();
    } catch {
      setError(fallbackMessage);
      return null;
    } finally {
      setRunningKey(null);
    }
  }

  return {
    error,
    runningKey,
    setError,
    run,
  };
}