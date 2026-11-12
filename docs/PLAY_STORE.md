# Billy — Play Store listing

Copy these into Play Console. Check every answer against the app before submitting.

## Store listing

**App name** (30 chars max): `Billy: Split Bills with UPI`

**Short description** (80 chars max):
> Snap the bill, split it by item, and get paid on UPI. Every bill matters.

**Full description** (4000 chars max):

> Billy turns a photo of any restaurant bill into a fair split in under a minute.
>
> 📸 **Snap the bill.** Billy reads every item, tax and service charge for you. No typing.
>
> 🍽️ **Split it your way.** Equally, by item (who had what), or by amount. GST, service charge and discounts are shared fairly.
>
> ⚡ **Get paid on UPI.** Friends tap Pay and their UPI app opens with the exact amount. Billy confirms the payment automatically. Or show a QR code and they scan it.
>
> 🔗 **Share one link.** Send the bill to your WhatsApp group. Friends open it, pick their name and see exactly what they owe.
>
> 📄 **Upload a bill file.** Got the bill by email (Swiggy, Zomato, Amazon, a restaurant's invoice)? Upload the PDF, image, saved email, Word or Excel file and split it.
>
> 👥 **Groups and history.** Save your regular crew, see who still owes you, and look back at what you spent each month.
>
> 🔒 **Private by design.** Bills are shared only with the people on them. Billy never moves money and never sees your bank details. Delete your account and data any time from Profile.

**Category:** Finance  ·  **Tags:** bill splitting, expense sharing, UPI

**Contact email:** your support email  ·  **Privacy policy:** https://billy-ed9eb.web.app/privacy

**Graphics you need:**
- App icon 512 × 512 PNG
- Feature graphic 1024 × 500
- 2–8 phone screenshots (1080 × 1920 or similar): Home, scan → Review, item-wise split, bill page with Pay/QR, bill file upload

## Data safety form

| Question | Answer |
|---|---|
| Collects or shares user data? | Yes |
| Encrypted in transit? | Yes |
| Users can request deletion? | Yes — in the app (Profile → Delete account) and by email |

**Data collected** (all: *collected*, not *shared* for ads; purpose **App functionality** + **Account management**; not optional unless noted)

| Type | Item | Notes |
|---|---|---|
| Personal info | Name, Email address | Account |
| Personal info | Phone number | Optional |
| Personal info | User IDs | Firebase user ID |
| Financial info | Other financial info | UPI ID; bill amounts and payment status. (No card or bank numbers.) |
| Photos and videos | Photos | Receipt photos — processed (sent to Gemini), not stored on the server. Optional. |
| Contacts | Contacts | Only the people you pick are saved. Optional. |
| Files and docs | Files and docs | Bill files the user uploads (PDF, image, email, text, Office) — processed (sent to Gemini), not stored on the server. Optional. |

**Shared with third parties:** Receipt photos / uploaded bill files (or their text) go to Google's Gemini API for processing. Under Play's definitions, sending data to a service provider that processes it for you is not "sharing", but say so in the privacy policy (done).

## Content rating & other forms

- **Target audience:** 18+ (Finance apps with payments are simplest at 18+).
- **Ads:** No ads.
- **Financial features declaration:** Billy does not provide payments, loans or banking. It opens the user's own UPI app with a prefilled amount. Choose "My app doesn't provide any financial features" only if Play agrees; otherwise pick the closest option, "Other", and describe it the same way.

## Before you submit

1. App ID changed from `com.anonymous.mobile` (Step 6 in NEXT_STEPS).
2. Release signing key SHA-1/SHA-256 added to Firebase, the Android API key restriction and `web/public/.well-known/assetlinks.json`.
3. Privacy policy deployed: `cd web && npx firebase-tools deploy --only hosting`.
4. Test account deletion end to end on a release build.
