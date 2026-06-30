// ---------------------------------------------------------------------------
// hooks/useAuth.ts
//
// Reactive hook over authStore.
//
// Usage:
//   const { user, isLoading } = useAuth();
//
// Returns the current auth state and re-renders whenever it changes.
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { authStore } from "../services/authStore";
import type { User } from "../types/user";

interface AuthHookResult {
  user: User | null;
  isLoading: boolean;
}

export function useAuth(): AuthHookResult {
  const [state, setState] = useState(authStore.get());

  useEffect(() => {
    // Sync with any changes that happened before mount
    setState(authStore.get());

    // Subscribe to future changes
    const unsubscribe = authStore.subscribe(() => {
      setState(authStore.get());
    });

    return unsubscribe;
  }, []);

  return state;
}
