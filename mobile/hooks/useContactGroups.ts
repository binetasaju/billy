// ---------------------------------------------------------------------------
// hooks/useContactGroups.ts
//
// Reactive hook over contactGroupStore — mirrors useGroups().
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { contactGroupStore } from "../services/contactGroupStore";
import type { ContactGroup } from "../types/group";

interface ContactGroupsHookResult {
  groups: ContactGroup[];
  isLoading: boolean;
}

export function useContactGroups(): ContactGroupsHookResult {
  const [state, setState] = useState(contactGroupStore.get());

  useEffect(() => {
    setState(contactGroupStore.get());
    const unsubscribe = contactGroupStore.subscribe(() => {
      setState(contactGroupStore.get());
    });
    return unsubscribe;
  }, []);

  return state;
}
