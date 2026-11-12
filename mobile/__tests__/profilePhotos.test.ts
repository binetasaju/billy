import {
  _resetProfilePhotos,
  accountsFromBills,
  getProfilePhoto,
  requestProfilePhoto,
  subscribeProfilePhotos,
} from "../services/profilePhotos";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("profilePhotos", () => {
  it("fetches a Billy account's photo once and tells listeners", async () => {
    const get = jest.fn(async (path: string) => (path === "users/u1" ? { photoUrl: "https://x/p.jpg" } : { name: "No photo" }));
    _resetProfilePhotos({ get } as any);
    const heard = jest.fn();
    const unsub = subscribeProfilePhotos(heard);

    requestProfilePhoto("u1");
    requestProfilePhoto("u1"); // already loading — no second read
    await flush();
    expect(getProfilePhoto("u1")).toBe("https://x/p.jpg");
    requestProfilePhoto("u1"); // cached — no read
    expect(get).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalled();

    requestProfilePhoto("u2");
    await flush();
    expect(getProfilePhoto("u2")).toBeUndefined(); // account without a photo
    unsub();
  });

  it("retries later when the read fails", async () => {
    const get = jest.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ photoUrl: "https://x/q.jpg" });
    _resetProfilePhotos({ get } as any);
    requestProfilePhoto("u3");
    await flush();
    expect(getProfilePhoto("u3")).toBeUndefined();
    requestProfilePhoto("u3");
    await flush();
    expect(getProfilePhoto("u3")).toBe("https://x/q.jpg");
  });

  it("does nothing without a cloud database", () => {
    _resetProfilePhotos(null);
    expect(() => requestProfilePhoto("u4")).not.toThrow();
    expect(getProfilePhoto(undefined)).toBeUndefined();
  });

  it("learns members' Billy accounts from bills", () => {
    expect(
      accountsFromBills([
        { participants: [{ id: "a", authUid: "uidA" }, { id: "b" }] },
        { participants: [{ id: "b", authUid: "uidB" }, { id: "a", authUid: "other" }] },
      ])
    ).toEqual({ a: "uidA", b: "uidB" });
  });
});
