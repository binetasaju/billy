# Billy — Next Steps

_Last updated: 11 Nov 2026 (night). Checked against the code on branch `feat/login-profile-ui`._

**Where we are:** the single-phone app is feature-complete and now has **real sign-in** (email + Google, Firebase free plan) and **shareable bill links**. The big missing piece is **cloud sync** — today every bill lives only on the phone that created it, so friends can't see it, payments don't update on other phones, and shared links only open on your own phone.

**Goal now:** save + test the current work, then build **cloud sync (Firestore)**.

---

## 1. Where Billy is now

| Area | Status | Notes |
|---|---|---|
| Project setup (Expo dev client, TypeScript, Expo Router) | 🟢 Done | Runs on a real Android phone over USB — see `CONNECT_PHONE.md` |
| Sign-in | 🟢 Done | **Email + password** with a verification email (app continues by itself once the link is clicked), forgot password, **Continue with Google** (colour G logo), Google profile photo. Same email = same Billy account. Login screen fits without scrolling |
| Phone OTP (SMS) | ⏸ Parked | Code kept (bubbles UI too). Real SMS needs the paid **Blaze** plan (`auth/billing-not-enabled`); test numbers work for free |
| Onboarding | 🟢 Done | Asks for the phone number when Google didn't give one; UPI ID optional |
| Profile | 🟢 Done | Photo, stats, edit name / phone / UPI, verified email, change password, **Report a problem** (emails binetasaju@gmail.com), version, privacy note |
| Bill capture | 🟢 Done | Add Bill sheet: Take Photo → Gallery → Enter Manually → Cancel. Preview → crop or AI auto-crop |
| OCR + parsing | 🟡 Works, needs real-receipt testing | ML Kit → rows from positions → Gemini (1 call per scan). Offline parser fallback. Taxes printed at 0% are dropped |
| Review | 🟢 Done | Edit items, add/remove taxes (✕ per line), totals checked against the printed total |
| Splits | 🟢 Done | Equal · Item-wise (**two steps**: assign items → Bill details → Create Bill) · Split an Amount (from a saved group, button under the group title) |
| Bill page | 🟢 Done | One **People** list (share, status, 🧾 items, Received / Pay / Mark paid), **Share bill** (one message + link), Report Error → Edit (before payments) / **Close Bill** (after a payment) / Delete & rescan |
| Shared bill links | 🟢 Done (own phone) | `https://billy-ed9eb.web.app/bill/<id>` — Android App Links **verified**; web fallback page with "Open in Billy". Only finds the bill on a phone that has it (needs cloud sync) |
| Payments | 🟡 Manual | UPI deep link + "Mark paid" / "Received" (one confirmation). **No automatic confirmation yet** |
| Home | 🟢 Done | Card: **You'll get \| You'll give** (all unpaid, exact amounts, Indian grouping). Pending + Recent show only your bills |
| Pay tab | 🟢 Done | Only bills where you still owe / are owed; your share is the big number |
| Groups | 🟢 Done | Balances, "Your settle-up", only the admin (creator) removes members |
| History | 🟢 Done | Monthly spent / received; settled and closed bills |
| Look & feel | 🟢 Done | Billy pop-ups, plain background, docked tab bar, smaller text, consistent page titles. Tagline: **"Every bill matters."** |
| iOS | 🟡 Prepared | Static frameworks + permission texts in `app.json`; `GoogleService-Info.plist` added (needs re-download for Google sign-in). Not built yet |
| Cloud sync / multi-user | 🔴 Not started | **Next big step** |
| Tests | 🟢 223 Jest tests | `cd mobile && npm test` |

---

## 2. What to do next (in order)

### Step 1 — Save today's work ✅ Done
Everything from 11 Nov is committed and pushed on branch `feat/login-profile-ui` (README, PROJECT and this file updated too).

### Step 2 — Test on the phone ⬅ **do this first**
Run `npx expo start --dev-client` (from `mobile/`) with the phone connected, then:

- [ ] **Sign up with email** → verification email → tap the link → Billy continues by itself
- [ ] **Log out → sign in** with email (email pre-filled) · **Forgot password** email arrives
- [ ] **Continue with Google** → account picker says "Continue to Billy" → new account asks for phone once
- [ ] Google **profile photo** on Home (top right) and Profile
- [ ] Profile: edit name / phone / UPI (bad values rejected) · Change password · **Report a problem** opens email
- [ ] Home card: **You'll get / You'll give** match the Pay tab totals exactly
- [ ] Split a bill → sheet order Take Photo, Gallery, Enter Manually, Cancel
- [ ] Extract Bill: big receipt preview, button at the bottom → "✓ Extracted successfully"
- [ ] Review: ✕ removes a tax; a 0% CGST/SGST line is not added; **+ Add Item Manually** is clearly visible
- [ ] Item-wise: assign → **Done** → Bill details → **Create Bill** (name it)
- [ ] Bill page: People list (no "…"), 🧾 shows items, **Received** / **Pay** / **Mark paid** ask once
- [ ] **Share bill** → WhatsApp → tap the link → opens this bill in Billy
- [ ] After a payment: Report Error → **Close Bill** → Closed badge, Start a new bill
- [ ] Group: Split an Amount under the title; only the admin sees ✕ on members
- [ ] Fully paid / closed bill appears in **History**

For a receipt that's read wrongly, paste the `[MLKIT] OCR Text` and `[parseBill] Response` lines from the Metro terminal.

### Step 3 — Merge to `main`
Open a PR from `feat/login-profile-ui` → `main` once Step 2 passes.

### Step 4 — Cloud sync with Firestore (free at Billy's size) ⬅ **next big feature**
1. **Data model:** `users/{uid}` (name, phone, UPI, photo), `bills/{billId}` (participants by uid/phone, items snapshot, settlements), `groups/{groupId}`.
2. **Offline-first:** keep AsyncStorage as the local copy; sync to Firestore when online (Firestore's offline cache does most of this).
3. **Security rules:** a bill is readable/writable only by its participants; only the payer of a row can mark it received, only the debtor can mark it paid; only a group's admin removes members.
4. **Finding friends:** match contacts to Billy users by phone number (that's why the phone is collected at sign-up).
5. **Live updates:** when Ravi taps "Paid", your screen updates — no "Mark as received" needed for in-app payments. Push notifications via Firebase Cloud Messaging (free).
6. **Shared links then work for everyone:** the link opens the same bill on a friend's phone.
7. **Migration:** upload the bills already on this phone the first time sync is switched on (old test-account bills stay local).

### Step 5 — Automatic UPI payment confirmation (Android)
- Billy can't move money itself (needs NPCI approval). It *can* launch the UPI app **for a result**: most UPI apps return `SUCCESS / FAILURE` + a transaction ID → auto-mark **"Paid via UPI"**.
- Small native module or a maintained UPI-intent library → one rebuild → test with GPay / PhonePe / Paytm.
- Also: show a **UPI QR** with the amount for the person paying you.

### Step 6 — Make receipt extraction reliable
1. **Test set:** 10–30 real receipts with the correct items/total → a script that scores extraction.
2. **ML Kit Document Scanner** for capture (edges, perspective, clean-up — free, on-device, needs a rebuild).
3. **Photo straight to Gemini** (image → JSON in one call) instead of OCR text → Gemini.
4. **Gemini structured output** (`responseSchema`) — no broken JSON.
5. Keep ML Kit + offline parser as the no-internet fallback.

### Step 7 — Security before any public release
- Move the **Gemini key** to a server (`backend/` or a Firebase Cloud Function) — `EXPO_PUBLIC_*` keys can be pulled out of the APK.
- Add the **release** signing key's SHA-1 / SHA-256 to Firebase (Google sign-in) and to `web/public/.well-known/assetlinks.json` (shared links), then redeploy: `cd web && npx firebase-tools deploy --only hosting`.
- Firestore security rules reviewed and tested (Step 4).
- **Account deletion** in Profile (Play Store requires it for apps with accounts).

### Step 8 — Gmail: import e-bills
- "Import from Gmail" → pick a Swiggy / Zomato / Amazon / BigBasket order email → Gemini parses it (same parser) → Review. No photo needed.
- `gmail.readonly` is a Google **restricted scope**: public release needs Google's verification + a security assessment (fine for ≤100 test users before that). Do the Gmail calls from the server, not the app.

### Step 9 — iOS
- Re-download **`GoogleService-Info.plist`** (now that Google sign-in is on — it adds the client IDs).
- `npx expo prebuild -p ios`, then build on a **Mac with Xcode** (`npx expo run:ios`) or with **EAS Build** (needs an Apple Developer account to install on a real iPhone).
- iOS shared links need **Universal Links** (an `apple-app-site-association` file on `billy-ed9eb.web.app` + Associated Domains).
- UPI on iOS: no app chooser — test with GPay / PhonePe.

### Step 10 — Play Store release
- Proper app id (e.g. `com.billy.app` instead of `com.anonymous.mobile`) — do this **before** release, since it changes Firebase apps, SHA keys and links.
- Release build signing, privacy policy page (can live on `billy-ed9eb.web.app`), store listing, screenshots.
- Clean up `console.log`s (see Housekeeping).

### Later
- Real SMS OTP (when Blaze billing is affordable — set a budget alert)
- Receipt dataset → custom receipt model
- Multi-currency
- Dark mode

---

## 3. Product decisions already made

- **The payer always shares the bill** (auto-ticked). For "I paid for my friends", use a group's **Split an Amount** and set your share to ₹0.
- **No "Owe someone" / debts without a bill** — every record in Billy comes from a bill.
- **Bills can be edited only by their creator, and only until the first payment.** After a payment, the creator can **Close** the bill (unpaid amounts cancelled, payments kept) and start a new one — Billy does not list who to repay.
- **You only see payments that involve you** — on a bill, in a group's settle-up, on the Pay tab and Home.
- **Home card = all unpaid bills** (You'll get / You'll give), not per month. Monthly figures live in History.
- **Marking paid / received asks once** — no payment-method question.
- **Only a group's admin (creator) can remove members.**
- **Saved bills are "bills", saved people-lists are "groups"** — the save button says **Create Bill**.
- **Sign-in is email or Google** (free); phone number is collected but not SMS-verified.
- **Tax-inclusive receipts:** if items already add up to the printed total, GST lines are a breakdown, not added on top. Taxes printed at 0% are dropped.
- **Tagline: "Every bill matters."** (no "Split bills, not friendships").

## 4. Known limitations

- **Everything is on one phone** until cloud sync (Step 4): friends don't see bills, payments don't update elsewhere, shared links open only on your phone.
- Development builds show Expo's launcher first when a link opens Billy cold; release builds go straight to the bill.
- Bills from an old account on the same phone are hidden from your totals but still stored (8 test bills from June/July).
- When editing a saved bill, the Save pop-up suggests the restaurant name, not the name chosen before.
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
   npm test           # settlement, balances, parsing, auth, formatting…
   ```
4. **One feature per prompt.** Name the files it may touch.
5. **Native changes need a rebuild** (`npx expo run:android`): new native packages, `app.json` plugins, `google-services.json`, Android manifest. JS-only changes just need a Metro reload.
6. **Style-only prompts for visual work**, e.g.:
   > "Update `app/login.tsx` to the new theme. Only change JSX layout, wrappers and `StyleSheet.create`. Do **not** change any `useState`, `useEffect`, `onPress` or service calls."

---

## 6. Done so far

**Fixes, tests & cleanup**
- TypeScript + ESLint clean (0 errors); Jest setup
- Phone numbers like `098765…` / `91…` match the same contact
- Status bar / navigation bar overlap fixed; receipt rows rebuilt from ML Kit positions
- Gemini numbers cleaned up; totals checked against the printed total; crop matches the selection

**Local MVP features**
- Manual bill entry · taxes / charges / discounts · 2+ sharers · edit/remove participant
- 1 Gemini call per scan · AI auto-crop · offline parser
- Split an Amount (GPay-style shares) · edit a bill until the first payment · "Settle up in N payments"

**11 Nov 2026 — branch `feat/login-profile-ui`**
- **Sign-in:** email + password with verification email (auto-continue), forgot password, remembered email, Continue with Google (colour logo), Google photo, phone in onboarding, plain error messages, no-scroll login, Firebase SHA-1/SHA-256 set up
- **Bills:** Close Bill after a mistake, only-your-payments everywhere, admin-only member removal, two-step item-wise split, "Create Bill" wording, 0% tax fix, ✕ on taxes, People list on the bill page, Share bill (one message + https link), Report a problem
- **Money display:** Home You'll get / You'll give (all unpaid, exact, Indian grouping), Pay tab share as the main number, old-account bills excluded
- **Look:** Billy pop-ups, Add Bill sheet, plain background, docked tab bar, ~20% smaller text, matching page titles, bigger Extract preview, "Every bill matters."
- **Links:** Firebase Hosting site `billy-ed9eb.web.app` (`web/`), Android App Links verified, bills load at app start
- **iOS prep:** static frameworks, permission texts, `GoogleService-Info.plist`

## 7. Housekeeping

- 63 `console.log` calls to clean up before release
- 12 lint warnings left (mostly "missing `router` dependency" — left on purpose)
- Delete `mobile/google-services.json.json` (duplicate download)
- Old test-account bills on the phone can be removed once sync is in place
