# Billy — Next Steps

_Last updated: 11 Nov 2026 (evening). Checked against the code on `main`._

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
| Auth | 🟡 Email sign-in built (11 Nov 2026) | Firebase **email + password** with a verification email (free plan). Needs **Email/Password** enabled in Firebase → Authentication. Phone OTP code is kept but not used: real SMS needs the paid Blaze plan. Release build: add the release key's SHA-1/SHA-256 in Firebase |
| Firebase / Firestore / sync / push | 🔴 Not started | |
| Tests | 🟢 174 Jest tests | `cd mobile && npm test` |

**Not yet tested on the phone:** the local-MVP features now on `main` (see step 1 below).

---

## 2. What to do next (in order)

### Step 1 — Test the whole journey on the phone ⬅ **do this first**
Run `npx expo start --dev-client` (from `mobile/`) with the phone connected, then go through this checklist and note anything wrong:

- [ ] Scan a receipt → Preview → Adjust Crop → crop is exactly what you selected
- [ ] Auto-crop (AI) button works / says when it can't find a tighter crop
- [ ] Review: items and prices correct, Taxes & Charges arrow easy to tap, totals match the bill (or a clear warning)
- [ ] Review: add a tax/charge/discount; ✕ (or long-press) removes a charge; a 0% CGST/SGST line is not added
- [ ] Extract Bill: button turns green "✓ Extracted successfully", only "Building bill details..." below
- [ ] Home → Split a bill → sheet shows Take Photo, Choose From Gallery, Enter Manually, Cancel (in that order)
- [ ] Home → Add Bill → **Enter Manually** → add items + GST → continue
- [ ] Participants: no warning at first; pressing Continue with fewer than 2 people shows "Select at least 2 people sharing"; ⋮ → Edit name / Remove
- [ ] Split **Equally** → Save
- [ ] Split **Item-wise** → totals update live while assigning → Done (unassigned warning) → Save
- [ ] Groups → open/create a group → **Split an Amount** → title + total → tap a box (it clears), type a share, others re-balance; your share ₹0 works → Save
- [ ] Saved bill: Who had what, progress bar, **Request** (WhatsApp message has UPI link), **Pay**, **Received**
- [ ] Saved bill: "Your payments" lists only what you pay / receive; **Mark as paid** asks once ("Yes, paid"), no cash/UPI question
- [ ] Saved bill: **Edit** → change a price → save → shares recalculated; Edit disappears after a payment
- [ ] Saved group: balances + "Your settle-up" (only your payments)
- [ ] Fully paid bill appears in **History**
- [ ] Login rejects short / invalid numbers
- [ ] No screen content under the status bar or navigation bar; nothing visible below the tab bar
- [ ] Pop-ups are the new Billy style (white card, green / red / grey buttons); text size feels right everywhere

For any receipt that's read wrongly, paste the `[MLKIT] OCR Text` and `[parseBill] Response` lines from the Metro terminal.

### Step 2 — Merge to `main` and push ✅ Done
All local-MVP work is merged into `main` (PR #1).

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
1. Real auth — ✅ email + password with email verification (free). Phone OTP only once billing (Blaze) is affordable
2. Gemini server proxy (`backend/`)
3. Firestore data model + sync (offline-first: store locally, sync when online)
4. Group invites (phone number + link/QR)
5. Real-time updates ("Rahul ✓ Paid") + push notifications
   - **Goal:** when someone pays their share, it shows up on the receiver's screen automatically — no "Mark as received" tap. The payer's "Paid" (or the UPI result from Step 3) updates the shared bill in Firestore; the receiver's app listens and updates, with a push notification.
   - "Mark as received" stays only for cash / payments made outside Billy.

### Step 7 — Gmail
1. **Sign in with Google** — ✅ built (11 Nov 2026): "Continue with Google" on the login screen (`services/auth/googleSignIn.ts`), same email = same Billy account, onboarding asks for the phone number. Needs: Google provider enabled in Firebase, a fresh `google-services.json` (has the Web client ID), and one native rebuild.
2. **Import e-bills from Gmail** (Swiggy, Zomato, Amazon, BigBasket… order emails): user taps "Import from Gmail" → picks an email → Billy sends the email text to Gemini (same parser as receipts) → Review screen. No photo needed.
   - Gmail read access (`gmail.readonly`) is a Google **restricted scope**: a public release needs Google's app verification + a security assessment. Fine for testing with up to 100 test users before that.
   - Do the Gmail API calls from `backend/` (with the Gemini proxy), never with keys in the app.
3. Optional: share the payment request by email as well as WhatsApp/SMS (already possible through the share sheet).

### iOS
- Code is cross-platform; `app.json` now has static frameworks (needed by Firebase) and camera / photos permission texts.
- Still needed: **`mobile/GoogleService-Info.plist`** (Firebase → add an iOS app with bundle ID `com.anonymous.mobile` → download).
- Then `npx expo prebuild -p ios` to refresh `ios/`, and build on a **Mac with Xcode** (`npx expo run:ios`) — or in the cloud with **EAS Build** (`eas build -p ios`, needs an Apple Developer account to install on a real iPhone).
- UPI on iOS: no app chooser like Android — `upi://` opens one installed UPI app; test with GPay / PhonePe.

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
- **Payments are self-reported** (Pay → UPI app → Mark as paid / Received) until Step 3 is done. Marking paid / received asks once — no payment-method question.
- **You only see your own payments** on a bill and in a group's settle-up, not what other people owe each other.
- **Tax-inclusive receipts:** if items already add up to the printed total, GST lines are treated as a breakdown and not added on top.

## 4. Known limitations

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

**Fixes, tests & cleanup**
- Fixed TypeScript + ESLint errors; Jest test setup
- Phone numbers like `098765…` / `91…` match the same contact
- Status bar / navigation bar overlap fixed on every screen
- Receipt rows rebuilt from ML Kit positions (names stay with their prices)
- Gemini numbers cleaned up; totals checked against the printed total; no phantom GST
- Crop now matches exactly what you select (incl. after rotating)
- `CONNECT_PHONE.md`, `GITHUB_STEPS.md`, this file

**Local MVP features**
- Bigger GST toggle · real 10-digit login check · 2+ sharers · edit/remove participant
- 1 Gemini call per scan · AI auto-crop button · no retries on quota errors · offline note
- Manual bill entry · add/remove taxes, charges, discounts
- Item-wise split on one screen with live totals
- Split an Amount (inside a saved group, GPay-style shares) · payment Request with UPI link
- Who had what · payment progress · duplicate "paid" taps ignored
- Edit a bill until the first payment
- "Settle up in N payments"
- Offline parser keeps GST / charges / total + realistic receipt tests

**11 Nov 2026**
- Add Bill sheet in a fixed order (Take Photo → Gallery → Enter Manually) with Cancel
- Billy-styled pop-ups everywhere (`components/ui/AppAlert.tsx` replaces `Alert.alert`)
- Extract Bill: "✓ Extracted successfully" on the button, only "Building bill details..." below
- Taxes printed at 0% are dropped (no phantom CGST/SGST); ✕ button on each tax / charge line
- Bills and groups show only your own payments
- Mark as paid: one confirmation, no cash / UPI question
- Tab bar docked to the bottom edge; all text ~10% smaller

## 7. Housekeeping

- ~64 `console.log` calls to clean up before release
- 12 lint warnings left (mostly "missing `router` dependency" — left on purpose)
