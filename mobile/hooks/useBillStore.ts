import { useState, useEffect } from "react";
import { billStore } from "../services/billStore";

export function useBillStore() {
  const [state, setState] = useState(() => billStore.get());

  useEffect(() => {
    const unsubscribe = billStore.subscribe(() => {
      setState(billStore.get());
    });
    return unsubscribe;
  }, []);

  return state;
}
