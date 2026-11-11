// ---------------------------------------------------------------------------
// services/cloud/cloudDb.ts — the slice of Firestore Billy uses
//
// Screens and stores never import Firestore. The sync code talks to this small
// interface; the real implementation wraps @react-native-firebase/firestore
// (required lazily, like auth, so a build without it keeps working locally),
// and tests use an in-memory fake.
// ---------------------------------------------------------------------------

export type DocData = Record<string, any>;
export type Unsubscribe = () => void;

export type WriteOp =
  | { type: "set"; path: string; data: DocData; merge?: boolean }
  | { type: "update"; path: string; data: DocData }
  | { type: "delete"; path: string };

export interface CloudDb {
  get(path: string): Promise<DocData | null>;
  set(path: string, data: DocData, merge?: boolean): Promise<void>;
  update(path: string, data: DocData): Promise<void>;
  /** All-or-nothing write of several documents. */
  batch(ops: WriteOp[]): Promise<void>;
  /** Live docs in `collectionPath` where `field` array-contains `value`. */
  listenWhereContains(
    collectionPath: string,
    field: string,
    value: string,
    onDocs: (docs: { id: string; data: DocData }[]) => void,
    onError: (e: unknown) => void
  ): Unsubscribe;
  /** Live docs of a whole (sub)collection. */
  listenCollection(
    collectionPath: string,
    onDocs: (docs: { id: string; data: DocData }[]) => void,
    onError: (e: unknown) => void
  ): Unsubscribe;
  /** FieldValue for "add this to the array". */
  arrayUnion(value: string): unknown;
}

let cached: CloudDb | null | undefined;

/** The real Firestore, or null when the native module / config is missing. */
export function getCloudDb(): CloudDb | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("@react-native-firebase/firestore");
    const db = fs.getFirestore();
    const toDocs = (snap: any) => snap.docs.map((d: any) => ({ id: d.id, data: d.data() ?? {} }));
    cached = {
      async get(path) {
        const snap = await fs.getDoc(fs.doc(db, path));
        return snap.exists() ? (snap.data() ?? {}) : null;
      },
      async set(path, data, merge) {
        await fs.setDoc(fs.doc(db, path), data, merge ? { merge: true } : {});
      },
      async update(path, data) {
        await fs.updateDoc(fs.doc(db, path), data);
      },
      async batch(ops) {
        const b = fs.writeBatch(db);
        for (const op of ops) {
          const ref = fs.doc(db, op.path);
          if (op.type === "set") b.set(ref, op.data, op.merge ? { merge: true } : {});
          else if (op.type === "update") b.update(ref, op.data);
          else b.delete(ref);
        }
        await b.commit();
      },
      listenWhereContains(collectionPath, field, value, onDocs, onError) {
        const q = fs.query(fs.collection(db, collectionPath), fs.where(field, "array-contains", value));
        return fs.onSnapshot(q, (snap: any) => onDocs(toDocs(snap)), onError);
      },
      listenCollection(collectionPath, onDocs, onError) {
        return fs.onSnapshot(fs.collection(db, collectionPath), (snap: any) => onDocs(toDocs(snap)), onError);
      },
      arrayUnion(value) {
        return fs.arrayUnion(value);
      },
    };
  } catch (e) {
    console.warn("[cloud] Firestore unavailable — Billy stays on this phone only.", e instanceof Error ? e.message : e);
    cached = null;
  }
  return cached;
}
