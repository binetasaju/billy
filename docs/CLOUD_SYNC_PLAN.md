# Billy — Cloud Sync Plan (Firestore)

_Approved 11 Nov 2026 (option C: accounts first, phone optional) · Step 4 in `NEXT_STEPS.md`_

## Goal

Today every bill lives only on the phone that made it. After this work:

- Friends on the bill **see the same bill on their own phones**.
- When someone taps **Paid**, the person they owe **sees it update live** — no "Mark as received" for payments made in Billy.
- **Shared bill links open the bill on anyone's phone** (after they join).
- Billy **keeps working offline** and syncs when the internet is back.
- Your **existing bills move to the cloud** the first time.
- Everything stays on Firebase's **free (Spark) plan**.

## Two facts that shape the design

1. **People on a bill are phone contacts, not accounts.** A participant's id is the contact's id on the creator's phone. Most friends aren't on Billy yet.
2. **Phone numbers are not verified** (email / Google sign-in; SMS needs the paid plan). So "my number is on this bill" **can't** be the security check — anyone could type someone else's number.

➡ **Joining a bill uses the share link** (it already exists). The link carries a secret invite code; opening it lets that person join the bill and say which participant they are. Billy suggests the right one by matching their profile phone number, but the invite code is what grants access.

Also: **Cloud Functions need the paid plan**, so everything below is done with the app + Firestore **security rules** only (no server code).

## Adding people — accounts first (option C)

1. **Billy accounts first:** add someone **by email**, or pick from **people you've split with on Billy**. They are linked to the bill immediately and see it on their phone — no join step.
2. **Contacts as a fallback:** friends who aren't on Billy (or whose email you don't know) are added from contacts by name, and join later with the share link.
3. **Phone number is optional** at onboarding — only a convenience for contacts.

Billy never links an account to a bill just because a phone number matches (numbers aren't verified).

## Data in Firestore

```
users/{authUid}                 name, email, phone, upiId, photoUrl, updatedAt
                                → anyone signed in can get one profile by uid (no listing)
emails/{lower-case email}       { uid } — "add by email" lookup (get only, no listing)
invites/{inviteCode}            billId, title, payer name, participants (names)
                                → lets someone with the link see who to join as

bills/{billId}                  title, createdBy (authUid), createdAt, updatedAt,
                                status (active | settled | closed), closedAt,
                                totalAmount, splitMethod, customAmounts,
                                billSnapshot (items, charges…),
                                participants: [{ id, name, phone, color, upiId, itemIds }],
                                participantUids: { participantId: authUid },  ← linked accounts
                                memberUids: [authUid…],           ← who can see the bill
                                createdByPid,                     ← creator's participant id
                                inviteCode                        ← secret, in the share link

bills/{billId}/payments/{id}    fromId, toId (participant ids), fromUid?, toUid?,
                                amount, status (pending | paid | cancelled),
                                paidAt, markedBy

users/{authUid}/groups/{id}     saved groups of people (private to you for now)
```

Payments are separate documents so the rules can say exactly who may change each one.

`authUid` = the Firebase sign-in id. Billy's own `uid` (which existing bills point at) is kept as the participant `id`, so nothing in your current bills has to be renumbered.

## Who can do what (security rules)

| Action | Allowed for |
|---|---|
| Read a bill and its payments | its members (`memberUids`) |
| Create a bill | any signed-in user (they become creator + member) |
| Edit / close / delete a bill | the creator only (edit only before the first payment — same as today) |
| Join a bill | anyone with the bill's `inviteCode`: may add **only themselves** to `memberUids` and set **only their own** participant's `authUid` (and only if it's still empty) |
| Mark a payment **paid** | the person who owes it (`fromUid`) or the person owed (`toUid`) |
| Mark a payment **received** | the person owed (`toUid`) |
| Read a profile | any signed-in user, one at a time (needed to show names / UPI IDs) |
| Change a profile | its owner |
| Saved groups | only their owner |

Rules live in `firestore.rules` in the repo, are deployed with the Firebase CLI (already logged in), and get automated tests against the Firebase emulator.

## How the app changes

- **Same screens, same stores.** `groupStore` keeps its API, so screens barely change. Underneath, it listens to "bills where I'm a member" in Firestore and writes changes there. Firestore's offline cache keeps everything usable without internet; AsyncStorage stays as a fallback.
- **New package:** `@react-native-firebase/firestore` (same version as auth) → **one rebuild**.
- **Join screen:** opening a shared link for a bill you're not on shows *"Join Dinner? Which one are you?"* with the participant matching your phone pre-selected.
- **Share bill** adds the invite code to the link.
- **Live payments:** Ravi taps Paid → your People list, Home card and Pay tab update within seconds. "Mark as received" stays for cash / payments outside Billy.
- **Profile:** your name / phone / UPI / photo are saved to `users/{authUid}` so friends see your current UPI ID.
- **Sign out:** stops listening; bills stay cached on the phone.

## Moving your existing bills

The first time you sign in with sync on:

1. Billy uploads the bills **you are on** (not the old test-account bills), keeping their ids, payments and history. You become creator + member.
2. Your participant on each bill gets your `authUid`; friends stay as names/phones until they join via a link.
3. A one-time flag records that this phone has been migrated, so it never uploads twice.

## Build order (each step is usable and tested on its own)

1. **Setup:** create the Firestore database (region **asia-south1 / Mumbai** — permanent choice), add the package, rebuild, deploy locked-down starter rules.
2. **Profiles:** write `users/{authUid}` on sign-in and on Profile edits.
3. **My bills in the cloud:** creating / editing / closing / paying writes to Firestore; the store listens. Works across your own devices.
4. **Migration** of the bills already on the phone.
5. **Joining via link:** invite code in Share bill, join screen, "which one are you?".
6. **Live payments between people:** paid / received sync for both sides.
7. **Saved groups** backed up to your account.
8. **Rules tests + docs**, then merge.

Rough size: steps 1–4 are one solid session; 5–6 another; 7–8 a shorter one.

## Not in this round

- **Push notifications** when the app is closed — sending them needs a server (Cloud Functions = paid plan). In-app live updates work without it. Revisit with Blaze.
- **Shared groups** (everyone sees and edits the same "Flatmates" group) — groups stay private to each user for now.
- **QR code to join** — easy add-on after step 5.
- **Receipt photos in the cloud** (Firebase Storage) — later.

## Free-plan limits (comfortable for Billy)

Firestore Spark: 1 GiB storage, 50,000 reads / 20,000 writes / 20,000 deletes per day. A bill is a few KB; one person opening the app reads roughly one document per bill.

## Decisions (approved)

1. **Region:** asia-south1 (Mumbai).
2. **Accounts first:** add by email / Billy friends (linked immediately); contacts join by link. Never by phone match.
3. **Phone number optional.**
4. **Push notifications later** (paid plan); live updates inside the app now.
5. **Saved groups private** to each person for this round.
