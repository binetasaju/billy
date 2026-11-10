# Billy — Next Steps

_Last updated: 10 Nov 2026. Checked against the code on branch `feat/local-mvp-next`._

**Goal right now:** finish the **local, single-phone MVP** before adding Firebase.

> Can one person take a real receipt, correct it, add friends, split it, see exactly what everyone owes, send the UPI payment, mark payments, and find that bill later?

Almost every piece of that journey is now built. What's left is **proving it works on a real phone**, making receipt extraction reliable, and then moving to cloud / multi-user Billy.

---

## 1. Where Billy is now

| Area | Status | Notes |
|---|---|---|
| Project setup (Expo dev client, TypeScript, Expo Router) | 🟢 Done | Runs on a real Android phone over USB — see `CONNECT_PHONE.md` |
| Bill capture | 🟢 Done | Camera / gallery → Preview → manual crop (fixed) or **AI auto-crop button** |
| OCR + parsing | 🟡 Works, needs real-receipt testing | ML Kit on-device → rows rebuilt from positions → Gemini (1 call per scan). Offline parser fallback keeps items, GST, charges and total |
| Receipt checks | 🟢 Done | Totals checked against the printed total; tax-inclusive bills don't get GST added twice; GSTIN ignored; mismatch warning on Review |
| Manual bill entry | 🟢 Done | Home → Add Bill → Enter Manually; add/remove tax, charge, discount lines |
| Participants | 🟢 Done | 2+ sharers, payer always sharing, edit name / remove (⋮ or long-press) |
| Split methods | 🟢 Done | Scanned bills: **Equal** or **Item-wise** (one screen, live totals). Saved group → **Split an Amount**: type a total, set each share (GPay-style re-balance) |
| Settlement engine (`services/calculateSettlement.ts`) | 🟢 Done + tested | Rounding, shared/unassigned items, GST, service charge, custom amounts |
| Saved bills | 🟢 Done | Who had what, payment progress, edit until first payment, Request (WhatsApp/SMS + UPI link) |
| Payments | 🟡 MVP | UPI deep link + manual "mark as paid" (duplicate taps ignored). **No automatic confirmation yet** |
| Groups + balances | 🟢 Done | Net balances + "Settle up in N payments" suggestion |
| History | 🟢 Done | Settled bills → full bill detail |
| Auth | 🟡 Local only | Firebase phone OTP not switched on |
| Firebase / Firestore / sync / push | 🔴 Not started | |
| Tests | 🟢 149 Jest tests | `cd mobile && npm test` |

**Not yet tested on the phone:** everything on `feat/local-mvp-next` (see step 1 below).

---

## 2. What to do next (in order)

### Step 1 — Test the whole journey on the phone ⬅ **do this first**
Run `npx expo start --dev-client` (from `mobile/`) with the phone connected, then go through this checklist and note anything wrong:

- [ ] Scan a receipt → Preview → Adjust Crop → crop is exactly what you selected
- [ ] Auto-crop (AI) button works / says when it can't find a tighter crop
- [ ] Review: items and prices correct, Taxes & Charges arrow easy to tap, totals match the bill (or a clear warning)
- [ ] Review: add a tax/charge/discount; long-press a charge to remove it
- [ ] Home → Add Bill → **Enter Manually** → add items + GST → continue
- [ ] Participants: no warning at first; pressing Continue with fewer than 2 people shows "Select at least 2 people sharing"; ⋮ → Edit name / Remove
- [ ] Split **Equally** → Save
- [ ] Split **Item-wise** → totals update live while assigning → Done (unassigned warning) → Save
- [ ] Groups → open/create a group → **Split an Amount** → title + total → tap a box (it clears), type a share, others re-balance; your share ₹0 works → Save
- [ ] Saved bill: Who had what, progress bar, **Request** (WhatsApp message has UPI link), **Pay**, **Received**
- [ ] Saved bill: **Edit** → change a price → save → shares recalculated; Edit disappears after a payment
- [ ] Saved group: balances + "Settle up in N payments"
- [ ] Fully paid bill appears in **History**
- [ ] Login rejects short / invalid numbers
- [ ] No screen content under the status bar or navigation bar

For any receipt that's read wrongly, paste the `[MLKIT] OCR Text` and `[parseBill] Response` lines from the Metro terminal.

### Step 2 — Merge to `main` and push
See `GITHUB_STEPS.md`. Merge `chore/fixes-tests-cleanup` first, then `feat/local-mvp-next`.

### Step 3 — Automatic UPI payment confirmation (Android)
- Billy **cannot move money itself** without becoming an NPCI-approved UPI app (a licensing process, not code).
- What it *can* do: launch the UPI app as an **intent for result**. Most UPI apps return `Status=SUCCESS / FAILURE` + a transaction ID → Billy auto-marks **"Paid (via UPI)"** and stores the reference.
- Needs a small native Android module (or a maintained UPI-intent library) → one `npx expo run:android` rebuild → test with GPay / PhonePe / Paytm.
- Also possible: show a **UPI QR** (amount filled in) for the person paying you.

### Step 4 — Make receipt extraction reliable
1. **Collect a test set:** 10–30 real receipts (restaurant, grocery, handwritten, long) with the correct items/total written down → a script that scores extraction. This makes "is it better?" measurable.
2. **ML Kit Document Scanner** for capture: edge detection, perspective correction, clean-up — fixes bad photos at the source (free, on-device, needs a rebuild).
3. **Send the photo directly to Gemini** (one call, image → JSON) instead of OCR text → Gemini. Gemini sees the real columns and "incl. GST" notes.
4. **Gemini structured output** (`responseSchema`) — no more broken JSON or prices as text.
5. Keep ML Kit + the offline parser as the no-internet / quota-exhausted fallback.

### Step 5 — Gemini quota & key safety
- ✅ Done: 1 call per scan, no retries on 429, offline note on Review.
- Optional: try the offline parser first and only call Gemini when its result doesn't match the printed total (saves more quota).
- **Before any public release:** move the Gemini key to a server proxy (`backend/`). Keys in `EXPO_PUBLIC_*` can be extracted from the APK.

### Step 6 — Cloud / multi-user Billy (after the local MVP is solid)
1. Firebase phone OTP (real auth)
2. Gemini server proxy (`backend/`)
3. Firestore data model + sync (offline-first: store locally, sync when online)
4. Group invites (phone number + link/QR)
5. Real-time updates ("Rahul ✓ Paid") + push notifications

### Later
- Receipt dataset → custom receipt model
- Analytics (spent / owed / received per month)
- Multi-currency
- UI redesign (design system first — see rules below)
- Production hardening + Play Store release

---

## 3. Product decisions already made

- **The payer always shares the bill** (auto-ticked). For "I paid for my friends", use a group's **Split an Amount** and set your share to ₹0.
- **No "Owe someone" / debts without a bill** — removed on purpose; every record in Billy comes from a bill.
- **Bills can be edited only by their creator, and only until the first payment.** After that: delete & rescan.
- **"Settle up in N payments"** is a suggestion only — payments are still marked per bill.
- **Payments are self-reported** (Pay → UPI app → Mark as paid / Received) until Step 3 is done.
- **Tax-inclusive receipts:** if items already add up to the printed total, GST lines are treated as a breakdown and not added on top.

## 4. Known limitations

- Android pop-ups show at most 3 buttons, so **Add Bill has no Cancel** — tap outside to close.
- When editing a saved bill, the Save pop-up suggests the restaurant name, not the group name you chose before.
- Editing a bill that came from a photo doesn't keep the photo (the bill data is kept).
- **Split an Amount** uses the group's members — add people to the group first. You are always the one who paid.

---

## 5. Rules for working with AI on Billy (so it doesn't break things)

1. **Commit before every big change.** If something breaks: `git restore .` (or `git reset --hard` to the last commit) and retry with a stricter prompt.
2. **Logic stays in `services/`.** Screens only call services and render. All money maths goes through `calculateSettlement.ts`.
3. **Run checks after every change** (from `mobile/`):
   ```bash
   npx tsc --noEmit   # types
   npm run lint       # lint
   npm test           # settlement, balances, parsing, crop, editing…
   ```
4. **One feature per prompt.** Name the files it may touch.
5. **UI redesign = design system first:** build `components/ui/` (`Card`, `Button`, `TextInput`, …), test on one screen, then swap screens over one at a time.
6. **Style-only prompts for visual work**, e.g.:
   > "Update `app/login.tsx` to the new theme. Only change JSX layout, wrappers and `StyleSheet.create`. Do **not** change any `useState`, `useEffect`, `onPress` or service calls."

---

## 6. Done so far

**Branch `chore/fixes-tests-cleanup`**
- Fixed TypeScript + ESLint errors; Jest test setup
- Phone numbers like `098765…` / `91…` match the same contact
- Status bar / navigation bar overlap fixed on every screen
- Receipt rows rebuilt from ML Kit positions (names stay with their prices)
- Gemini numbers cleaned up; totals checked against the printed total; no phantom GST
- Crop now matches exactly what you select (incl. after rotating)
- `CONNECT_PHONE.md`, `GITHUB_STEPS.md`, this file

**Branch `feat/local-mvp-next`**
- Bigger GST toggle · real 10-digit login check · 2+ sharers · edit/remove participant
- 1 Gemini call per scan · AI auto-crop button · no retries on quota errors · offline note
- Manual bill entry · add/remove taxes, charges, discounts
- Item-wise split on one screen with live totals
- Split an Amount (inside a saved group, GPay-style shares) · payment Request with UPI link
- Who had what · payment progress · duplicate "paid" taps ignored
- Edit a bill until the first payment
- "Settle up in N payments"
- Offline parser keeps GST / charges / total + realistic receipt tests

## 7. Housekeeping

- Delete the empty nested repo: `rm -rf mobile/.git`
- `app/split.tsx` isn't used by any screen — delete or reuse
- ~64 `console.log` calls to clean up before release
- 13 lint warnings left (mostly "missing `router` dependency" — left on purpose)
