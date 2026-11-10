# Billy — Next Steps

_Last updated: 10 Nov 2026. Checked against the code, not just past notes._

**Goal right now:** finish the **local, single-phone MVP** before adding Firebase.

> Can one person take a real receipt, correct it, add friends, split it, see exactly what everyone owes, send the UPI payment, mark payments, and find that bill later?

Once that whole journey works reliably on a real phone, move to cloud / multi-user Billy.



## 1. Where Billy actually is

| Area | Status | Notes |
|---|---|---|
| Project setup, Expo dev client, TypeScript, Expo Router | 🟢 Done | Runs on a real Android phone over USB (see `mobile/CONNECT_PHONE.md`) |
| Bill capture + OCR | 🟢 Mostly done | ML Kit on-device OCR + Gemini parsing |
| Review / edit items | 🟢 Done | Add / edit / delete items, edit title, charges |
| Participants + equal split + item-wise split | 🟢 Done | Item assignment lives on the *Choose split method* screen |
| Settlement engine (`services/calculateSettlement.ts`) | 🟢 Done + **tested** | Jest tests cover rounding (₹100/3), shared items, GST, service charge, unassigned items |
| UPI pay (deep link) + manual "mark as paid" | 🟡 MVP | No automatic payment verification |
| History | 🟡 Partial | |
| Groups + group balances (`services/groupBalances.ts`) | 🟡 Partial | Net balances per group **already exist**; no "minimum payments" simplification yet |
| Auth | 🟡 Local only | Firebase phone OTP not switched on |
| Firebase / Firestore / sync / push | 🔴 Not started | |
| Android status-bar overlap | 🟢 Fixed | All screens now use `react-native-safe-area-context` |

**Corrections to the older roadmap notes:**
- State is plain service stores (`billStore`, `groupStore`, `authStore`) + AsyncStorage — **not Zustand**.
- Group balances are **partly built** (Phase 9 is not "future").
- Settlement unit tests are **done**; parser tests are still missing.
- Each scan currently makes **2 Gemini calls**: `optimizer.ts` (find the receipt edges, `gemini-2.0-flash`) and `parseBill.ts` (structure the text, `gemini-flash-lite-latest`). OCR itself is on-device (ML Kit).

---

## 2. Your list — what each item means and what to do

Ordered from quickest / most important to biggest.

### 2.1 GST ▾ toggle is too small — _tiny_
- **Where:** `app/review-items.tsx` (~line 425) — the charges section uses a text `▴ / ▾` character.
- **Do:** replace it with an `Ionicons` `chevron-down` / `chevron-up` icon (size ~20) and make the whole row tappable with a `hitSlop`.

### 2.2 10-digit phone number issue — _small_
- **Where:** `app/login.tsx` line ~49 checks `norm.length < 10`, but `norm` is `+91XXXXXXXXXX`, so a **7-digit** number passes and too-long numbers are also accepted.
- **Do:**
  - Add `isValidIndianMobile(phone)` in `utils/normalizePhoneNumber.ts`: after normalising, must be exactly `+91` + 10 digits starting with 6–9.
  - Use it on login, in the contact picker, and when adding a person manually.
  - Show a clear inline error ("Enter a 10-digit mobile number").
  - Add Jest tests next to the existing `normalizePhoneNumber` tests.
- _Already fixed:_ numbers saved as `098765…`, `0091…` or `91…` now normalise to the same `+91…`.

### 2.3 Minimum 2 people to split — _small_
- **Problem:** `app/participants.tsx` only requires `sharingIds.size > 0`, so you can "split" a bill with just one person. The 2-person check only exists in the **remove participant** handler, and that handler is **not wired to any button**.
- **Do:**
  - Require **at least 2 people sharing** before *Continue* is enabled (show "Add at least 2 people to split").
  - Wire up the existing `handleRemoveParticipant` and `handleEditName` (the edit-name modal already exists) to the participant card — e.g. long-press → Edit name / Remove.
  - Decide: can the payer be someone who isn't sharing? (e.g. you pay for 2 friends). Recommended: **yes**, but there must still be ≥ 2 people involved in total.

### 2.4 Manually add items (bill without scanning) — _small/medium_
- **Today:** "+ Add Item Manually" exists, but only *after* a scan on the review screen.
- **Do:** add an **"Enter manually"** option on Home next to Camera / Gallery that opens the review screen with an empty bill (title, items, prices, GST, service charge). No Gemini call → also saves quota.

### 2.5 Combine "assign items" and "item-wise split" into one page — _medium_
- **Today:** items are assigned on `choose-split-method.tsx` (via `ItemAssignmentSection`), then you go to a separate `itemwise-split-summary.tsx`.
- **Do:** one screen: items list with people chips on top, **live per-person totals** updating at the bottom as you assign, then *Save / Pay*. Keep `calculateSettlement` as the only place doing the maths (call it on every change). Then remove the extra step.

### 2.6 Group: show what items each person had — _small_
- **Today:** `app/group/[id].tsx` already has an items breakdown modal per person (`itemsModal`).
- **Do:** make it obvious — show a short item list under each person in the bill detail ("Rahul — Burger, ½ Fries") instead of hiding it behind a tap. For equal-split bills show "Equal share".

### 2.7 "Owe someone" (record a debt without a bill) — _medium_
- **Meaning:** "I owe Rahul ₹300" / "Anu owes me ₹200" without scanning anything (like a cash loan or a cab fare).
- **Do:** create it as a small `BillGroup` with no items and a single settlement row. That way **group balances, History and UPI pay all work automatically** with no new data model.
- UI: a "+ Add expense / I owe / Owes me" button on the group screen and on Home.

### 2.8 "Split exactly like GPay" — _medium_
GPay's split works like this: enter one total → pick people → it splits equally → you can **edit each person's amount** (the rest re-balances) → each person gets a request to pay you.
- **Do (Billy's own version, not a copy of GPay's screens):**
  - Add a third split method: **"Custom amounts"** next to Equal and Item-wise. Each person's amount is editable; show "₹X left to assign" until it adds up to the total; *Continue* only when it matches exactly.
  - Add `splitMethod: "custom"` support to `calculateSettlement` + tests.
  - **"Request"** button per person → shares a message on WhatsApp/SMS with the amount and a UPI link (`upi://pay?pa=you@bank&am=…`) so they can pay you in one tap.

### 2.9 "Make Billy a UPI payment app" — _important to understand first_
- Billy **cannot move money itself** unless it becomes an NPCI-approved UPI app (TPAP) with a sponsor bank — that's a company-level licensing process, not code.
- What Billy *can* do (and mostly does already): open GPay / PhonePe / Paytm with the amount filled in.
- **Realistic upgrade (Android):** launch UPI as an *intent for result*. Most UPI apps return `Status=SUCCESS / FAILURE` plus a transaction ID. Billy can then **auto-mark the payment as "Paid (via UPI)"** and store the reference — still self-reported, but much smoother. Needs a small native module or a maintained UPI intent library.
- Also: when you're the one being paid, let the payer **scan a Billy QR** (UPI QR with amount) — easy with `upi://pay` encoded into a QR code.

---

## 3. Gemini quota (429 RESOURCE_EXHAUSTED)

The free tier is about **20 requests/day per model**, and each scan uses 2 calls.

Short-term:
- Restart with a fresh key if needed: update `EXPO_PUBLIC_GEMINI_API_KEY` in `mobile/.env`, then `npx expo start --dev-client --clear`.

Fix properly (in this order):
1. **Skip the Gemini crop step by default** — the user already has a manual crop in *Edit Image*. Only call `optimizer.ts` when the user taps "Auto-crop".
2. **Try the local parser first**; call Gemini only when the local result looks bad (no items, or items don't add up to the total).
3. **Show a friendly message on 429** ("Daily AI limit reached — enter items manually or try later") and drop straight into manual entry (2.4).
4. Before any public release: move the key to a **server proxy** (`backend/`), since keys in `EXPO_PUBLIC_*` can be extracted from the APK.

---

## 4. Order to do things in

### Now — finish the local MVP
1. Quick fixes: GST toggle (2.1), 10-digit phone (2.2), minimum 2 people + edit/remove participant (2.3)
2. Gemini quota fixes (section 3, steps 1–3)
3. Manual bill entry (2.4)
4. One-page item-wise split (2.5)
5. Custom-amount split + payment request (2.8)
6. "Owe someone" debts (2.7)
7. Group: who ate what (2.6)
8. **Bill editing before the first payment** — edit an item price → settlement recalculated; lock editing once any payment is marked paid
9. **Payment tracking polish** — clear Paid / Pending per person, prevent double "mark as paid", bill auto-settles when all are paid
10. **History** — bill list → bill detail (items, people, settlement, payments)
11. UPI intent-for-result auto-confirmation (2.9)
12. Group "minimum payments" (simplify debts: A→B→C becomes A→C)
13. Parser tests (`parseBill` local fallback) with real receipt text samples

### After the local MVP works end-to-end
14. Firebase phone OTP (real auth)
15. Gemini server proxy (`backend/`)
16. Firestore data model + sync
17. Group invites (phone number + link/QR)
18. Real-time updates + push notifications

### Later
19. Better auto receipt crop (on-device edge detection)
20. Receipt dataset → custom receipt model
21. Analytics (spent / owed / received per month)
22. Multi-currency
23. Production hardening + Play Store release

---

## 5. Rules for working with AI on Billy (so it doesn't break things)

1. **Commit before every big change.** If something breaks: `git restore .` (or `git reset --hard` to the last commit) and retry with a stricter prompt.
2. **Logic stays in `services/`.** UI screens should only call services and render. All money maths goes through `calculateSettlement.ts`.
3. **Run checks after every change** (from `mobile/`):
   ```bash
   npx tsc --noEmit   # types
   npm run lint       # lint
   npm test           # settlement / balance / phone tests
   ```
4. **One feature per prompt.** Name the files it may touch.
5. **UI redesign later = design system first:** build `components/ui/` (`Card`, `Button`, `TextInput`, …), test them on one screen, then swap screens over one at a time.
6. **Style-only prompts for visual work**, e.g.:
   > "Update `app/login.tsx` to the new theme. Only change JSX layout, wrappers and `StyleSheet.create`. Do **not** change any `useState`, `useEffect`, `onPress` or service calls."

---

## 6. Recently done

- Fixed TypeScript + ESLint errors
- Jest set up with 40 tests (settlement, group balances, phone numbers, UPI ID, bill totals) — run `npm test`
- Phone numbers like `098765…` / `91…` now match the same contact
- Removed the `test-models` debug screen and unused imports
- Fixed status bar / navigation bar overlap on every screen (Android edge-to-edge)
- Added `mobile/CONNECT_PHONE.md` (USB / Wi-Fi debugging guide)

**Open housekeeping:**
- Delete the empty nested repo: `rm -rf mobile/.git`
- `app/split.tsx` is not used by any screen — delete or reuse
- 64 `console.log` calls to clean up before release
