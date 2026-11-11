<div align="center">

# Billy — AI-Powered Item-Wise Expense Splitting

### Every Bill Matters.

**Scan a bill. Split by item. Pay your share.**

[Features](#-features) · [Architecture](#-architecture) · [Setup](#-getting-started) · [Roadmap](#-future-roadmap)

<br />

![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?style=flat-square&logo=react&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-54-000020?style=flat-square&logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Google Gemini](https://img.shields.io/badge/AI-Google_Gemini-8E75B2?style=flat-square&logo=googlegemini&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Auth_%26_Hosting-FFCA28?style=flat-square&logo=firebase&logoColor=black)
![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS-3DDC84?style=flat-square&logo=android&logoColor=white)

</div>

Billy is an AI-powered expense-splitting mobile application designed to make shared purchases fair, transparent, and easy to settle. From restaurant bills and grocery shopping to household essentials and group purchases, Billy helps people pay for what they actually bought or consumed instead of dividing every expense equally.

By combining AI-assisted receipt processing, flexible item-wise allocation, automatic expense calculations, group balance tracking, and UPI payment links, Billy aims to make splitting expenses simpler for everyone.

---

## 📌 Table of Contents

- [The Problem](#-the-problem)
- [The Solution](#-the-solution)
- [Features](#-features)
- [Technology Stack](#-technology-stack)
- [Architecture](#-architecture)
- [AI Receipt Processing](#-ai-receipt-processing)
- [Expense Calculation](#-expense-calculation)
- [Getting Started](#-getting-started)
- [Environment Configuration](#-environment-configuration)
- [Available Commands](#-available-commands)
- [Current Limitations](#-current-limitations)
- [Security Considerations](#-security-considerations)
- [Future Roadmap](#-future-roadmap)
- [Project Structure](#-project-structure)
- [Project Information](#-project-information)

---

## 🍃 The Problem

When people buy things together, splitting the total equally is not always fair.

- **Groceries:** Everyone buys different products or quantities.
- **Shopping:** Friends purchase items at different prices.
- **Household expenses:** Flatmates share some items but purchase others individually.
- **Group purchases:** Multiple people contribute toward a combined order.
- **Restaurant bills:** Each person orders different dishes, with shared items and additional charges.

Manually reading receipts, assigning items, calculating each person's share, distributing taxes, and tracking repayments can be tedious and error-prone.

## 💡 The Solution

Billy aims to simplify this process through a mobile-first workflow:

1. **Capture:** Take a receipt photo or select one from the gallery.
2. **Extract:** Use AI-assisted processing to identify bill details, items, quantities, and amounts.
3. **Review:** Check, edit, add, or remove extracted items.
4. **Split:** Divide the bill equally or assign individual items to the people who consumed them.
5. **Calculate:** Allocate applicable charges and calculate each participant's share.
6. **Settle:** Generate UPI payment links and track settlement status.

The goal is to reduce manual work while giving users control over the final bill and its calculations.

## ✨ Features

### 📸 Receipt Capture and Editing

- Capture receipts using the device camera or select images from the gallery.
- Resize images before processing to reduce upload size.
- Preview and manually crop, rotate, and zoom into receipt images.
- Review extracted items alongside the original receipt.
- Edit item names, quantities, and prices before splitting.

### 🤖 AI-Assisted Receipt Processing

- Use Google Gemini to extract receipt text and transform it into structured bill data.
- Separate text extraction from structured parsing.
- Validate whether an image appears to contain a bill.
- Flag lower-confidence extracted items for review.
- Use local OCR and regex-based parsing as fallback mechanisms where supported.
- Optionally use Google Cloud Vision for OCR bounding boxes and visual item matching.
- Retry certain transient network failures with backoff.

AI-extracted information is editable so users can correct recognition errors before calculating settlements.

### ⚖️ Flexible Expense Splitting

- **Equal split:** Divide the bill across all participants.
- **Item-wise split:** Assign items to the people who consumed them.
- **Shared items:** Divide an item's cost among its assigned participants.
- **Charge allocation:** Distribute supported taxes and charges proportionally to item subtotals.
- **Remainder correction:** Account for rounding differences so calculated shares reconcile with the bill total.
- **Payer selection:** Identify who paid the original restaurant bill and calculate who owes them money.

### 👥 Contacts and Reusable Groups

- Select participants from device contacts.
- Search and filter contacts.
- Normalize phone numbers and remove duplicate contacts where possible.
- Create reusable groups for friends, flatmates, or colleagues.
- Preserve participant details in historical bill records.

### 🧾 Bills, Balances and History

- **Home card:** what you'll get and what you'll give across all unpaid bills, side by side (exact amounts, Indian digit grouping).
- **Pay tab:** only bills where you still owe or are owed money, with your share as the main number.
- **Bill page:** one **People** list — each person's share, their payment status (where it involves you), a 🧾 button to review their items, and **Received** / **Pay** / **Mark paid** actions.
- **Share bill:** one message for the whole bill (shares, who has paid, the payer's UPI ID) with a link that opens the bill in Billy.
- **Mistakes:** edit a bill until the first payment; after that the creator can **close** it (unpaid amounts cancelled, payments kept) and start a corrected bill.
- **Groups:** reusable groups with balances and a "your settle-up" suggestion; only the group's admin (creator) can remove members.
- **History:** spent and received per month, plus settled and closed bills.
- You only see payments that involve you — never what other people owe each other.

### 💸 UPI Payment Handoff

- Generate UPI deep links with the payee, amount, currency, and payment note.
- Open compatible UPI applications when installed.
- Provide a fallback when a UPI app cannot be opened.
- Mark payments as paid / received with a single confirmation and a timestamp.
- Update a bill's status when all its payments are marked paid.

**Important:** UPI deep linking initiates a payment handoff. Billy does not independently verify bank transactions.

### 🔐 Sign-in and Profile

- **Email + password** with a verification email — Billy continues by itself once the link is clicked; forgot-password emails.
- **Continue with Google** (Firebase), including the Google profile photo.
- The same email always opens the same Billy account, so bills stay attached.
- The phone number is collected at sign-up / onboarding (used to match people from contacts); the UPI ID is optional.
- **Profile:** edit name, phone and UPI ID, change password, quick stats, and **Report a problem** (opens a pre-filled email).
- Phone (SMS) OTP is implemented but parked — real SMS needs Firebase's paid plan.

### 🔗 Shareable Bill Links

- Shared bills include `https://billy-ed9eb.web.app/bill/<id>`, tappable in WhatsApp.
- Android **App Links** (verified through `assetlinks.json`) open the link straight in Billy; otherwise a small web page offers **Open in Billy**.
- The web page is hosted for free on **Firebase Hosting** (`web/`).

## 🧰 Technology Stack

| Area | Technologies |
|---|---|
| Mobile application | React Native, Expo |
| Language | TypeScript, JavaScript |
| Navigation | Expo Router |
| AI and parsing | Google Gemini API |
| OCR | ML Kit Text Recognition, optional Google Cloud Vision |
| Authentication | Firebase Authentication (email + password, Google sign-in), local fallback provider |
| Links | Firebase Hosting, Android App Links, Expo Router deep links |
| Local persistence | AsyncStorage, custom stores |
| Payments | UPI URI deep linking, Expo Linking |
| Device features | Camera, image picker, contacts, share sheet |
| Testing | Jest (200+ tests: settlement, balances, parsing, auth, formatting) |
| Development | Node.js, npm, Git, Android development tools |

## 🏗️ Architecture

Billy separates its user interface, application state, business logic, and external integrations to make core functionality easier to maintain.

```text
┌─────────────────────────────────────┐
│        React Native UI              │
│  Screens · Forms · Components       │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│         Hooks and Stores             │
│  Auth · Bills · Groups · Contacts   │
└─────────┬─────────────────┬─────────┘
          │                 │
┌─────────▼────────┐  ┌─────▼─────────────┐
│ Local Persistence│  │ Application       │
│ AsyncStorage     │  │ Service Layer     │
└─────────────────┘  └─────┬─────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
         Gemini API     OCR Fallback    UPI Links
         Bill Parsing   and Matching    Payment Handoff
```

### Design decisions

- **Service-layer separation:** Keep core calculations and parsing logic outside UI components wherever possible.
- **Typed data contracts:** Use TypeScript interfaces for parsed bills, participants, contact groups, and settlements.
- **Reusable stores:** Centralize application state and persistence behind reusable store interfaces and hooks.
- **Deterministic calculations:** Keep settlement calculations predictable and independent of external API responses.
- **Editable AI output:** Treat extracted bill data as a starting point that users can review and correct.

## 🧠 AI Receipt Processing

Billy uses a multi-stage approach to separate text extraction from structured data parsing.

```text
       Receipt Image
             │
             ▼
   ┌───────────────────┐
   │ Gemini OCR Stage  │
   │ Extract raw text  │
   └─────────┬─────────┘
             │
             ▼
   ┌───────────────────┐
   │ Structured Parser │
   │ Gemini + Schema   │
   └─────────┬─────────┘
             │
             ▼
   ┌───────────────────┐
   │ Parsed Bill Data  │
   │ Items, Prices,    │
   │ Charges, Totals   │
   └─────────┬─────────┘
             │
             ▼
   User Review and Editing
             │
             ▼
      Settlement Engine
```

### Why use two stages?

Receipt text extraction and structured parsing are different tasks. Separating them makes it possible to process the extracted text into a consistent TypeScript data structure and handle parsing failures independently.

Additional fallback paths include:

- On-device ML Kit text recognition.
- Local regex-based parsing for supported receipt formats.
- Optional Google Cloud Vision OCR bounding boxes.
- Retry handling for selected network errors.

The final result depends on receipt quality, model output, connectivity, and the receipt's formatting. Users should verify extracted values before completing a split.

## 🧮 Expense Calculation

Billy supports equal and item-wise allocation, with special handling for rounding and shared items.

### 1. Equal splitting

The total is divided across participants. Any rounding remainder is allocated so the participant shares add up to the original total.

### 2. Item-wise splitting

Each participant is charged according to the items assigned to them. If multiple participants share an item, its cost is divided among those participants.

### 3. Proportional charges

For supported charges, the allocation is based on each participant's share of the item subtotal.

Conceptually:

```text
Participant Ratio =
    Participant Item Subtotal / Bill Item Subtotal

Participant Charge =
    Participant Ratio × Total Charge
```

### 4. Rounding correction

Amounts are rounded to two decimal places. The final participant's amount can be adjusted to reconcile the calculated shares with the total.

This calculation approach helps avoid small discrepancies caused by splitting amounts into fractional paise.

## 🚀 Getting Started

### Prerequisites

Install the following tools before running Billy:

- Node.js 20 or later.
- npm 10 or later.
- Android Studio and Android SDK for Android development.
- Java Development Kit 17 for the Android build environment.
- A compatible Android device or emulator.
- API credentials for the external services you intend to use.

A native development build is required because Billy uses native modules that are not available in the standard Expo Go environment.

### 1. Clone the repository

```bash
git clone https://github.com/binetasaju/billy.git
cd billy/mobile
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file inside the `mobile/` directory and configure the API keys described below.

### 4. Configure Firebase

Billy uses Firebase on the free (Spark) plan:

1. Create or select a Firebase project and register the Android app (`com.anonymous.mobile`).
2. Add the **SHA-1 and SHA-256** fingerprints of your signing key (debug key for development, release key for store builds) in **Project settings → Your apps**.
3. In **Authentication → Sign-in method**, enable **Email/Password** and **Google**.
4. Download `google-services.json` and place it in **both** `mobile/google-services.json` and `mobile/android/app/google-services.json`. Download it again after enabling Google — the new file contains the Web client ID Google sign-in needs.
5. For iOS, register the iOS app and place `GoogleService-Info.plist` in `mobile/`.
6. Native configuration changed → rebuild once with `npx expo run:android`.

**Shared bill links (optional):** the `web/` folder is a Firebase Hosting site. Put your signing key's SHA-256 in `web/public/.well-known/assetlinks.json`, then:

```bash
cd web
npx firebase-tools login
npx firebase-tools deploy --only hosting
```

### 5. Run the Android application

Connect an Android device with USB debugging enabled or launch an emulator.

```bash
adb devices
npx expo run:android
```

This builds and launches the native Android application.

Once the native application has been installed, you can start the development server separately:

```bash
npx expo start
```

## 🔑 Environment Configuration

The application uses Expo environment variables for client-side configuration.

| Variable | Required | Purpose |
|---|---|---|
| `EXPO_PUBLIC_GEMINI_API_KEY` | For the current Gemini integration | Used by the receipt-processing pipeline |
| `EXPO_PUBLIC_VISION_API_KEY` | Optional | Google Cloud Vision OCR and bounding boxes |

Example `.env` configuration:

```dotenv
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key
EXPO_PUBLIC_VISION_API_KEY=your_vision_api_key
```

Replace the example values with your own credentials. Never commit real secrets to GitHub.

**Security note:** Variables prefixed with `EXPO_PUBLIC_` are bundled into the client application and must not be treated as secret. Before distributing Billy publicly, move Gemini API requests behind a backend that stores the API key securely.

## 🧪 Available Commands

Run these commands from the `mobile/` directory.

| Command | Purpose |
|---|---|
| `npm install` | Install project dependencies |
| `npm run start` | Start the Expo development server |
| `npm run android` | Build and launch the Android application |
| `npm run ios` | Build and launch the iOS application on macOS |
| `npm run lint` | Run the configured lint command |
| `npm test` | Run the Jest unit tests (settlement maths, balances, receipt parsing, crop, editing…) |
| `npm run check:auth` | Run the authentication identity regression checks |
| `npm run web` | Start the web development target, subject to native-module limitations |

The available scripts are defined in `mobile/package.json`. Native functionality may not work in the web target.

## ⚠️ Current Limitations

Billy is an evolving project. The following boundaries are important to understand.

### Local-first data storage

Bills, contact groups, settlements, and related records are currently stored locally using AsyncStorage. Cloud synchronization across users and devices is not yet deployed, so friends don't see a bill on their own phones yet and shared bill links only open on a phone that has the bill.

### Payment verification

UPI integration opens compatible payment applications using deep links. Billy does not verify bank transactions through a payment provider. Settlement status is updated based on user confirmation.

### Authentication

Sign-in uses Firebase email + password (with email verification) and Google sign-in. Phone numbers are collected but not verified by SMS — SMS OTP is implemented but needs Firebase's paid plan. If the Firebase native module or configuration is missing, Billy falls back to a local, on-device sign-in for development.

### Receipt recognition

Faded, damaged, poorly lit, or unusually formatted receipts can produce incorrect extraction results. Review and edit the extracted bill before confirming the split.

### Production readiness

Billy is a development project and should not be treated as a production financial service. Authentication, API security, data synchronization, transaction verification, and broader automated testing require further work.

## 🔒 Security Considerations

- Do not commit API keys, private credentials, or personal receipt data.
- Restrict Google API keys to the services and applications that need them.
- Move AI API requests to a secured backend before public distribution.
- Configure Firebase Authentication and any database security rules before enabling cloud services.
- Do not treat a locally marked payment as proof of a successful bank transfer.
- Avoid sharing real phone numbers, UPI IDs, or private receipt information in public issues and screenshots.

Firebase client configuration is not equivalent to a server-side secret, but it still needs appropriate API restrictions and service security controls.

## 🗺️ Future Roadmap

The following are planned improvements, not claims of currently deployed functionality. See `NEXT_STEPS.md` for the detailed, ordered plan.

- [x] Firebase sign-in (email + password, Google).
- [x] Automated tests for settlement calculations, group balances, bill parsing and sign-in.
- [x] Shareable bill links that open the app.
- [ ] Cloud Firestore synchronization across participants and devices, with live payment updates.
- [ ] Push notifications for bill and payment updates.
- [ ] Automatic UPI payment confirmation (Android).
- [ ] More reliable receipt extraction (document scanner, image → Gemini, structured output).
- [ ] Backend proxy for secure Gemini API requests.
- [ ] Import e-bills from Gmail.
- [ ] iOS build.
- [ ] Phone (SMS) OTP once billing is enabled.
- [ ] Receipt image storage for historical bills.
- [ ] Multi-currency expense splitting.

## 📂 Project Structure

```text
billy/
├── mobile/
│   ├── app/                 # Expo Router screens and navigation
│   ├── components/          # Reusable UI components
│   ├── hooks/               # React hooks and store bridges
│   ├── services/            # Business logic and API integrations
│   │   ├── auth/            # Sign-in providers (Firebase email/Google, local), errors
│   │   ├── ocr.ts           # Receipt text extraction
│   │   ├── parseBill.ts     # Structured bill parsing
│   │   ├── calculateSettlement.ts
│   │   ├── recalculateBillTotals.ts
│   │   ├── groupBalances.ts
│   │   ├── homeSummary.ts   # Home card / Pending / Recent
│   │   └── upi.ts           # UPI links, share-bill message, bill links
│   ├── types/               # TypeScript domain models
│   ├── utils/               # Shared utilities (phone numbers, ₹ formatting…)
│   ├── __tests__/           # Jest tests
│   └── package.json
├── web/                     # Firebase Hosting: bill links + Android App Links
├── backend/                 # Planned server (Gemini proxy)
├── docs/                    # Supporting documentation
├── Billy.pdf                # Project pitch deck
├── PROJECT.md               # Project notes
├── NEXT_STEPS.md            # Current status and ordered plan
└── README.md
```

## 👩‍💻 Project Information

**Project:** Billy — AI-Powered Bill Splitting for India

**Lead developer:** Bineta Saju

**Guiding principle:** *Every Bill Matters.*

**Repository:** [github.com/binetasaju/billy](https://github.com/binetasaju/billy)

**Pitch deck:** [Billy.pdf](Billy.pdf)

Built with React Native, Expo, TypeScript, and Google Gemini to explore a simpler way to split restaurant expenses.

---

<div align="center">

**Made to make splitting bills a little less awkward. 💚**

*Every bill matters. Every share should be fair.*

</div>
