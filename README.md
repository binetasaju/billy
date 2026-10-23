# Billy — AI-Powered Bill Splitting for India

<div align="center">

<img src="assets/billy-demo.gif" alt="Billy mobile application walkthrough" width="300" />

### Every Bill Matters. Split bills, not friendships.

**Snap a receipt. Split by item. Settle over UPI.**

Billy is a mobile-first expense-splitting application designed to make sharing restaurant bills fairer and easier. It combines AI-assisted receipt processing, flexible expense allocation, group balance tracking, and UPI payment handoffs in one application.

[Features](#-features) · [Architecture](#-architecture) · [Setup](#-getting-started) · [Limitations](#-current-limitations)

<br />

![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?style=flat-square&logo=react&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-54-000020?style=flat-square&logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Google Gemini](https://img.shields.io/badge/AI-Google_Gemini-8E75B2?style=flat-square&logo=googlegemini&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase_Auth-Integration-FFCA28?style=flat-square&logo=firebase&logoColor=black)
![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS-3DDC84?style=flat-square&logo=android&logoColor=white)

</div>

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

## 🍽️ The Problem

When friends dine together, one person often pays the entire restaurant bill. Splitting it afterward can involve:

- Manually entering every food item and its price.
- Figuring out who ordered what and which items were shared.
- Distributing GST, service charges, and other fees fairly.
- Calculating individual shares without rounding discrepancies.
- Tracking who owes money and who has settled their share.

Equal splitting is convenient, but it may be unfair when people order items of different prices.

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

### 📊 Group Balances and History

- Review active bills and outstanding settlements.
- Aggregate balances across bills associated with a reusable group.
- Track individual amounts owed and amounts receivable.
- Review historical bills and their settlement status.
- Mark settlements as paid after confirmation.

### 💸 UPI Payment Handoff

- Generate UPI deep links with the payee, amount, currency, and payment note.
- Open compatible UPI applications when installed.
- Provide a fallback when a UPI app cannot be opened.
- Record the selected payment method and payment timestamp when a settlement is marked paid.
- Update a bill group's status when all its settlement entries are marked paid.

**Important:** UPI deep linking initiates a payment handoff. Billy does not independently verify bank transactions.

### 🔐 Authentication Foundation

- Modular authentication-provider interface.
- Local authentication provider for on-device use.
- Firebase Authentication integration.
- Persistent identity mapping designed to preserve existing local bill history when authentication providers change.

The application currently defaults to local authentication. Firebase phone OTP requires the appropriate configuration and activation.

## 🧰 Technology Stack

| Area | Technologies |
|---|---|
| Mobile application | React Native, Expo |
| Language | TypeScript, JavaScript |
| Navigation | Expo Router |
| AI and parsing | Google Gemini API |
| OCR | ML Kit Text Recognition, optional Google Cloud Vision |
| Authentication | Local authentication provider, Firebase Authentication integration |
| Local persistence | AsyncStorage, custom stores |
| Payments | UPI URI deep linking, Expo Linking |
| Device features | Camera, image picker, contacts |
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

For native Firebase integration:

1. Create or select a Firebase project.
2. Register the appropriate Android application.
3. Download its `google-services.json` configuration file.
4. Place the configuration file at the path expected by the project's Expo and Android configuration.
5. Configure Firebase Authentication if you intend to enable phone OTP.

For iOS builds, configure the corresponding iOS application and its `GoogleService-Info.plist` file.

Check the current Expo configuration before adding or duplicating native configuration files.

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
| `npm run check:auth` | Run the authentication identity regression checks |
| `npm run web` | Start the web development target, subject to native-module limitations |

The available scripts are defined in `mobile/package.json`. Native functionality may not work in the web target.

## ⚠️ Current Limitations

Billy is an evolving project. The following boundaries are important to understand.

### Local-first data storage

Bills, contact groups, settlements, and related records are currently stored locally using AsyncStorage. Cloud synchronization across users and devices is not yet deployed.

### Payment verification

UPI integration opens compatible payment applications using deep links. Billy does not verify bank transactions through a payment provider. Settlement status is updated based on user confirmation.

### Authentication

The application currently defaults to local authentication. Firebase phone OTP is integrated at the code level but requires explicit configuration and activation before it can be used as the active authentication flow.

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

The following are planned improvements, not claims of currently deployed functionality.

- [ ] Cloud Firestore synchronization across participants and devices.
- [ ] Backend proxy for secure Gemini API requests.
- [ ] Activation and testing of Firebase phone OTP authentication.
- [ ] QR-code-based bill joining.
- [ ] Push notifications for bill and settlement updates.
- [ ] Automated unit tests for settlement calculations, group balances, and bill parsing.
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
│   │   ├── auth/            # Authentication providers
│   │   ├── ocr.ts           # Receipt text extraction
│   │   ├── parseBill.ts     # Structured bill parsing
│   │   ├── calculateSettlement.ts
│   │   ├── recalculateBillTotals.ts
│   │   ├── groupBalances.ts
│   │   └── upi.ts           # UPI payment links
│   ├── types/               # TypeScript domain models
│   ├── utils/               # Shared utilities
│   └── package.json
├── assets/
│   └── billy-demo.gif       # Application walkthrough
├── docs/                    # Supporting documentation
├── Billy.pdf                # Project pitch deck
├── PROJECT.md               # Project notes
└── README.md
```

## 👩‍💻 Project Information

**Project:** Billy — AI-Powered Bill Splitting for India

**Lead developer:** Bineta Saju

**Guiding principle:** *Every Bill Matters — Split bills, not friendships.*

**Repository:** [github.com/binetasaju/billy](https://github.com/binetasaju/billy)

**Pitch deck:** [Billy.pdf](Billy.pdf)

Built with React Native, Expo, TypeScript, and Google Gemini to explore a simpler way to split restaurant expenses.

---

<div align="center">

**Made to make splitting bills a little less awkward. 💚**

*Every bill matters. Every share should be fair.*

</div>
