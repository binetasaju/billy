// In-memory stand-in for Firestore used by sync tests (no security rules —
// those are tested against the real emulator in web/test/rules.test.js).
import type { CloudDb, DocData } from "../../services/cloud/cloudDb";

const UNION = Symbol("arrayUnion");

export function createFakeCloud() {
  const docs = new Map<string, DocData>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  const parent = (path: string) => path.slice(0, path.lastIndexOf("/"));
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

  const applyUpdate = (path: string, patch: DocData) => {
    const cur = docs.get(path);
    if (!cur) throw new Error(`No document to update: ${path}`);
    const next = clone(cur);
    for (const [k, v] of Object.entries(patch)) {
      const keys = k.split(".");
      let obj: any = next;
      for (const key of keys.slice(0, -1)) obj = obj[key] ??= {};
      const last = keys[keys.length - 1];
      if (v && typeof v === "object" && (v as any)[UNION] !== undefined) {
        const arr: unknown[] = obj[last] ?? [];
        if (!arr.includes((v as any)[UNION])) arr.push((v as any)[UNION]);
        obj[last] = arr;
      } else obj[last] = clone(v);
    }
    docs.set(path, next);
  };

  /** A connection as one signed-in phone (no rules, shared data). */
  const connect = (): CloudDb => ({
    async get(path) {
      const d = docs.get(path);
      return d ? clone(d) : null;
    },
    async set(path, data, merge) {
      docs.set(path, clone(merge ? { ...(docs.get(path) ?? {}), ...data } : data));
      notify();
    },
    async update(path, data) {
      applyUpdate(path, data);
      notify();
    },
    async batch(ops) {
      for (const op of ops) {
        if (op.type === "set") docs.set(op.path, clone(op.merge ? { ...(docs.get(op.path) ?? {}), ...op.data } : op.data));
        else if (op.type === "update") applyUpdate(op.path, op.data);
        else docs.delete(op.path);
      }
      notify();
    },
    listenWhereContains(col, field, value, onDocs) {
      const run = () =>
        onDocs(
          [...docs.entries()]
            .filter(([p, d]) => parent(p) === col && Array.isArray(d[field]) && d[field].includes(value))
            .map(([p, d]) => ({ id: p.slice(col.length + 1), data: clone(d) }))
        );
      listeners.add(run);
      run();
      return () => listeners.delete(run);
    },
    listenCollection(col, onDocs) {
      const run = () =>
        onDocs([...docs.entries()].filter(([p]) => parent(p) === col).map(([p, d]) => ({ id: p.slice(col.length + 1), data: clone(d) })));
      listeners.add(run);
      run();
      return () => listeners.delete(run);
    },
    arrayUnion(value) {
      return { [UNION]: value };
    },
  });

  return { docs, connect };
}
