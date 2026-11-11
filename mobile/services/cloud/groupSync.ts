// ---------------------------------------------------------------------------
// services/cloud/groupSync.ts — my saved groups backed up to my account
//
//   users/{authUid}/groups/{groupId}   private to me (firestore.rules)
// ---------------------------------------------------------------------------

import type { ContactGroup } from "../../types/group";
import { contactGroupStore } from "../contactGroupStore";
import type { CloudDb } from "./cloudDb";
import { stripUndefined } from "./billMapping";

export interface GroupSync {
  stop(): void;
  saveGroup(group: ContactGroup): Promise<void>;
  deleteGroup(id: string): Promise<void>;
}

export function startGroupSync(db: CloudDb, authUid: string): GroupSync {
  const path = `users/${authUid}/groups`;
  const stop = db.listenCollection(
    path,
    (docs) => {
      void contactGroupStore.applyCloud(docs.map((d) => ({ ...(d.data as ContactGroup), id: d.id })));
    },
    (e) => console.warn("[cloud] groups sync error:", e)
  );
  return {
    stop,
    async saveGroup(group) {
      const { inCloud: _ignored, ...data } = group;
      await db.set(`${path}/${group.id}`, stripUndefined(data));
    },
    async deleteGroup(id) {
      await db.batch([{ type: "delete", path: `${path}/${id}` }]);
    },
  };
}
