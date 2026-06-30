import { useState, useEffect } from "react";
import { groupStore } from "../services/groupStore";
import type { BillGroup } from "../types/group";

interface GroupsHookResult {
  groups: BillGroup[];
  isLoading: boolean;
}

export function useGroups(): GroupsHookResult {
  const [state, setState] = useState(groupStore.get());

  useEffect(() => {
    setState(groupStore.get());
    const unsubscribe = groupStore.subscribe(() => {
      setState(groupStore.get());
    });
    return unsubscribe;
  }, []);

  return state;
}
