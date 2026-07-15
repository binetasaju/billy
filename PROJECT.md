# Billy

**Billy** is a mobile-first expense splitting app that turns a photo of any restaurant receipt into itemized, per-person settlements with one-tap UPI payments. Built with React Native (Expo), powered by Gemini AI for OCR and bill parsing, and architected for an eventual Firebase backend — Billy eliminates the mental math, awkward conversations, and manual data entry that plague every group dining experience.

> *Split bills, not friendships.*

---

## Problem Statement

### Why existing apps fall short

Every expense splitting app on the market — Splitwise, Settle Up, Tricount — requires **manual entry**. You finish a meal, pull out your phone, and start typing each item, each price, each person. It's tedious, error-prone, and nobody wants to be *that person* at the table.

The pain points are real:

- **Manual data entry** — Typing 15+ line items from a receipt is slow and frustrating.
- **No item-level granularity** — Most apps only support equal splits. If someone ordered water and someone else ordered lobster, tough luck.
- **Tax and charge ambiguity** — Indian bills have GST, CGST, SGST, service charges, packaging fees, round-off adjustments. Existing apps ignore all of it.
- **Payment friction** — After calculating who owes what, you still need to open a separate UPI app, type in the amount, and hope you got the decimal right.
- **No receipt verification** — There's no way for participants to verify what they're being charged for. Trust, but no way to verify.

### Why Billy exists

Billy was built to solve a simple question: *"Why can't I just take a photo of the bill and be done with it?"*

With Billy, the entire flow — from receipt photo to settled payments — takes under 60 seconds. AI handles the OCR and parsing. The user reviews, assigns items, and triggers UPI payments without ever leaving the app. No typing. No spreadsheets. No arguments.

---

## Features

### Authentication

- Phone number + name registration with local persistence
- Session management via `AsyncStorage` (survives app restarts)
- Auth-gated navigation — unauthenticated users are redirected to login
- Onboarding flow for optional UPI ID collection
- Logout with confirmation dialog
- Architecture designed for drop-in Firebase Auth migration

### Receipt Processing

- Capture receipts via **camera** or **gallery** picker
- AI-powered **document detection** — Gemini identifies the receipt region in the image and auto-crops with padding
- **Image editing** — pinch-to-zoom, crop, and rotate before scanning
- Image compression to 1200px wide at JPEG 0.8 quality (optimized for OCR accuracy)
- Full-screen image viewer with zoomable view

### OCR

- **Gemini Vision** (`gemini-2.0-flash`) extracts raw text from receipt images — every line, every number, every character
- **Google Cloud Vision API** (optional) provides word-level bounding boxes for item ↔ image highlight synchronization
- **ML Kit Text Recognition** as an on-device fallback for offline scenarios
- Retry strategy with exponential backoff (2s → 4s → 8s, up to 4 attempts) for 429/503/504 errors
- Abort controller support for cancellable OCR requests

### Bill Review

- **Gemini Flash Lite** (`gemini-flash-lite-latest`) parses raw OCR text into structured JSON — items, quantities, prices, taxes, charges, and totals
- Local **regex fallback parser** when Gemini is unavailable (4 pattern matchers covering common Indian receipt formats)
- Editable item list — add, edit, delete, rename any line item
- Automatic **bill recalculation** — subtotal, charges, and total update in real-time on every mutation
- Restaurant name extraction with duplicate-word deduplication
- Legal entity name separation (e.g., "PLAN B" vs. "V&RO HOSPITALITY PVT LTD")
- Parent-child item grouping (combo meals, platters with sub-items)
- Modifier support for priced add-ons
- Low-confidence item flagging (items below 0.8 confidence are visually highlighted)
- Charges normalization — canonical `charges[]` array with legacy field back-fill for backward compatibility
- **Bill validation** — rejects non-receipt images (selfies, screenshots, random photos) via `isBill` detection

### Bill Splitting

- **Equal split** — total divided evenly among all participants with penny-rounding correction on the last person
- **Item-wise split** — assign specific items to specific people, with shared items split proportionally
- **Assign by person** — select a participant and tap items they consumed
- **Assign by item** — select an item and tap participants who shared it
- Proportional tax/charge distribution — GST, service charge, and additional fees distributed based on each person's item subtotal
- Unassigned items automatically split equally among all participants
- Choose split method screen with clear UX guidance

### Groups

- Create settlement groups from any completed split
- Group detail screen with bill summary, participant list, and settlement breakdown
- Settlement status tracking — `pending` → `paid` per transaction
- Group-level status — `active` → `settled` (auto-transitions when all settlements are paid)
- **Item breakdown modal** — any participant can view exactly which items contribute to a settlement amount
- **Report Error flow** — permission-gated bill deletion (only the bill creator can delete and rescan)
- Persistent storage via `AsyncStorage` with Firestore-ready data model

### Payments

- **UPI deep linking** — opens the user's preferred UPI app (GPay, PhonePe, Paytm) with pre-filled amount, receiver, and note
- Graceful fallback when no UPI app is installed — copies UPI ID to clipboard
- **Payment confirmation modal** — "Did payment complete?" with success/failure options to prevent duplicate payments
- Copy-to-clipboard for UPI IDs
- Payment method tracking (`upi`, `cash`, `other`)
- Payment timestamp recording

### History

- Settled groups archive with total spent/received statistics
- Bills settled counter
- Date-sorted group list

### Profile

- Avatar with user initial
- Phone number display
- Editable UPI ID with bottom-sheet modal
- User ID display (monospace)
- Logout with destructive confirmation

---

## Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| **React Native** 0.81 | Cross-platform mobile framework |
| **Expo** 54 (managed → dev client) | Build tooling, native module management |
| **Expo Router** 6 | File-based routing with deep linking |
| **TypeScript** 5.9 | Type safety across the entire codebase |
| **React Navigation** 7 | Tab and stack navigation |
| **Reanimated** 4 | Performant animations |
| **Gesture Handler** 2.28 | Touch interactions, swipe gestures |
| **Bottom Sheet** (Gorhom) | Modal sheets for bill actions |
| **Expo Image Manipulator** | Image compression, cropping, rotation |
| **Expo Contacts** | Device contact book integration |
| **Expo Clipboard** | Copy UPI IDs to clipboard |
| **Expo Haptics** | Tactile feedback on interactions |

### AI

| Technology | Purpose |
|---|---|
| **Gemini 2.0 Flash** | Vision-based OCR — image → raw text |
| **Gemini Flash Lite** | Text-based bill parsing — raw text → structured JSON |
| **Google Cloud Vision API** | Word-level bounding boxes for item highlighting (optional) |
| **ML Kit Text Recognition** 2.0 | On-device OCR fallback |

### Storage

| Technology | Purpose |
|---|---|
| **AsyncStorage** | Persistent local storage for auth, groups, and settings |
| **In-memory singletons** | Session state for active bill processing pipeline |

### Architecture

| Pattern | Purpose |
|---|---|
| **Module-level singletons** | State management without React Context overhead |
| **Subscriber pattern** | Reactive updates — stores notify listeners on mutation |
| **React hooks** | Thin bridge between singleton stores and React components |
| **Pure calculation engine** | Stateless settlement math — deterministic, testable |
| **Service layer separation** | Business logic isolated from UI components |

### Payments

| Technology | Purpose |
|---|---|
| **UPI deep linking** | Native payment app integration via `upi://pay` URI scheme |
| **Expo Linking** | URL scheme handling for UPI |

### Future Backend

| Technology | Purpose |
|---|---|
| **Firebase Auth** | Phone OTP authentication (replacing mock login) |
| **Cloud Firestore** | Real-time group sync across devices |
| **Firebase Cloud Messaging** | Push notifications for payment reminders |
| **Firebase Storage** | Receipt image storage |

---

## Project Structure

```
billy/
├── mobile/                        # React Native application root
│   ├── app/                       # Expo Router file-based screens
│   │   ├── (tabs)/                # Bottom tab navigator
│   │   │   ├── _layout.tsx        # Tab bar configuration
│   │   │   ├── index.tsx          # Home — scan bill or join group
│   │   │   ├── pay-bills.tsx      # Active groups & pending settlements
│   │   │   ├── history.tsx        # Settled groups archive
│   │   │   └── profile.tsx        # User profile & settings
│   │   ├── group/
│   │   │   └── [id].tsx           # Dynamic group detail screen
│   │   ├── _layout.tsx            # Root layout with auth guard
│   │   ├── login.tsx              # Phone + name registration
│   │   ├── onboarding.tsx         # Optional UPI ID setup
│   │   ├── optimizing.tsx         # AI document detection loading
│   │   ├── preview.tsx            # Image preview before OCR
│   │   ├── edit-image.tsx         # Crop, zoom, rotate receipt
│   │   ├── ocr.tsx                # OCR scanning screen with progress
│   │   ├── review-items.tsx       # Editable parsed bill items
│   │   ├── participants.tsx       # Add participants from contacts
│   │   ├── who-paid.tsx           # Select who paid the bill
│   │   ├── choose-split-method.tsx # Equal vs. item-wise split
│   │   ├── split.tsx              # Split configuration
│   │   ├── assign-items.tsx       # Item-wise: assign items to people
│   │   ├── assign-by-person.tsx   # Item-wise: assign by person view
│   │   ├── equal-split-summary.tsx # Equal split results
│   │   ├── itemwise-split-summary.tsx # Item-wise split results
│   │   └── test-models.tsx        # Developer tool for model testing
│   │
│   ├── components/                # Reusable UI components
│   │   ├── ContactPickerModal.tsx # Full-screen contact picker with search
│   │   ├── BillImagePanel.tsx     # Receipt image display with highlights
│   │   ├── FullScreenViewer.tsx   # Zoomable full-screen image viewer
│   │   ├── AddBillSheet.tsx       # Bottom sheet for adding bills
│   │   └── ui/                    # Base UI primitives
│   │
│   ├── services/                  # Business logic layer (framework-agnostic)
│   │   ├── authStore.ts           # Authentication state singleton
│   │   ├── billStore.ts           # Active bill session state singleton
│   │   ├── groupStore.ts          # Groups state with AsyncStorage persistence
│   │   ├── ocr.ts                 # Gemini Vision OCR — image → raw text
│   │   ├── parseBill.ts           # Gemini Flash Lite — raw text → structured JSON
│   │   ├── visionOcr.ts           # Google Cloud Vision API — bounding boxes
│   │   ├── mlkitOcr.ts            # ML Kit on-device OCR fallback
│   │   ├── matchItems.ts          # Fuzzy-match items to OCR blocks for highlighting
│   │   ├── calculateSettlement.ts # Pure settlement calculation engine
│   │   ├── recalculateBillTotals.ts # Pure bill total recalculation
│   │   ├── optimizer.ts           # AI document detection and auto-crop
│   │   └── upi.ts                 # UPI deep linking for payments
│   │
│   ├── hooks/                     # React hooks (thin store bridges)
│   │   ├── useAuth.ts             # Reactive hook over authStore
│   │   ├── useBillStore.ts        # Reactive hook over billStore
│   │   └── useGroups.ts           # Reactive hook over groupStore
│   │
│   ├── types/                     # TypeScript type definitions
│   │   ├── bill.ts                # BillItem, ParsedBill, Person, BoundingBox, OcrBlock
│   │   ├── group.ts               # BillGroup, GroupSettlement
│   │   └── user.ts                # User model (Firebase-ready)
│   │
│   ├── utils/                     # Pure utility functions
│   │   ├── nanoid.ts              # Collision-resistant ID generator (no deps)
│   │   └── normalizePhoneNumber.ts # E.164 phone normalization (India default)
│   │
│   ├── android/                   # Android native project
│   ├── ios/                       # iOS native project
│   ├── assets/                    # Static assets (images, fonts)
│   ├── constants/                 # App-wide constants
│   └── scripts/                   # Build and utility scripts
│
├── backend/                       # Future backend (placeholder)
├── docs/                          # Documentation (placeholder)
└── PROJECT.md                     # ← You are here
```

---

## Current Workflow

```
┌─────────────────────────────────────────────────────┐
│                     USER FLOW                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│   📸 Receipt                                        │
│    │  Camera or Gallery                             │
│    ▼                                                │
│   🔍 Optimize                                       │
│    │  AI document detection + auto-crop             │
│    ▼                                                │
│   👁️ Preview                                        │
│    │  Review image, edit if needed                  │
│    ▼                                                │
│   🤖 OCR                                            │
│    │  Gemini Vision → raw text                      │
│    │  Vision API → bounding boxes (optional)        │
│    ▼                                                │
│   📝 Parse                                          │
│    │  Gemini Flash Lite → structured JSON           │
│    │  Regex fallback if Gemini unavailable           │
│    ▼                                                │
│   ✏️ Review Items                                    │
│    │  Edit, add, delete items                       │
│    │  Verify totals and charges                     │
│    ▼                                                │
│   👥 Participants                                   │
│    │  Add from contacts or manually                 │
│    ▼                                                │
│   💰 Who Paid?                                      │
│    │  Select the person who paid the bill           │
│    ▼                                                │
│   ⚖️ Split Method                                    │
│    │  Equal or Item-wise                            │
│    ▼                                                │
│   📊 Summary                                        │
│    │  Per-person breakdown with charges             │
│    ▼                                                │
│   📁 Create Group                                   │
│    │  Persist settlements to AsyncStorage           │
│    ▼                                                │
│   💸 Payments                                       │
│       UPI deep link → confirm → mark paid           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Current Architecture

### State Management

Billy uses **module-level singletons** with a subscriber pattern — a deliberate alternative to React Context or Redux. Each store is a plain TypeScript module that holds state in a closure and exposes a `subscribe()` method for reactive updates.

#### `billStore`

The active bill processing session. Holds the parsed bill, original image URI, OCR blocks, participants, payer selection, and split method. This is an **in-memory singleton** — it exists only during an active scanning session and is cleared when the user completes or abandons the flow.

Key responsibilities:
- Source of truth for all bill mutations (add/edit/delete items)
- Triggers `recalculateBillTotals()` on every item mutation
- Stores both the current and original bill (for reset capability)
- Tracks bounding box availability for image highlighting

#### `groupStore`

Persistent group state. Manages the lifecycle of settlement groups from creation through payment completion. Persisted to `AsyncStorage` under the `@billy_groups` key.

Key responsibilities:
- CRUD operations on groups with automatic timestamp management
- Settlement payment tracking (`pending` → `paid`)
- Group status transitions (`active` → `settled`)
- Sorted retrieval (most recently updated first)
- Firestore-ready data model (IDs map to document IDs)

#### `authStore`

Authentication session state. Manages the current user with `AsyncStorage` persistence. Designed with explicit Firebase migration comments in the source code.

Key responsibilities:
- Session restore on app start (called once from `_layout.tsx`)
- Login/logout with persistence
- User profile updates (e.g., adding UPI ID post-onboarding)
- Firebase-ready API surface (login/logout/restore map directly to Firebase Auth)

### Hooks

Three thin React hooks bridge the singleton stores to component lifecycle:

- **`useAuth()`** — returns `{ user, isLoading }`, re-renders on auth state changes
- **`useBillStore()`** — returns the current bill session state or `null`
- **`useGroups()`** — returns `{ groups, isLoading }`, re-renders on group mutations

Each hook follows the same pattern: `useState` + `useEffect` with `store.subscribe()` and cleanup via the returned unsubscribe function.

### Services

The service layer is **framework-agnostic** — no React imports, no JSX, no hooks. Pure TypeScript modules that can be tested independently.

- **`ocr.ts`** — Image → raw text via Gemini Vision. Handles compression, retry logic, abort signals.
- **`parseBill.ts`** — Raw text → `ParsedBill` JSON via Gemini Flash Lite. Includes a complete local regex fallback parser.
- **`visionOcr.ts`** — Optional Google Cloud Vision API for word-level bounding boxes.
- **`mlkitOcr.ts`** — On-device ML Kit OCR for offline scenarios.
- **`matchItems.ts`** — Fuzzy-matches parsed items to OCR blocks using LCS-based similarity scoring.
- **`optimizer.ts`** — AI-powered document detection and auto-crop.
- **`upi.ts`** — UPI payment deep linking with fallback clipboard copy.

### Pure Calculation Engine

**`calculateSettlement.ts`** is a stateless, pure function. Given a `SettlementInput` (payer, method, participants, items, charges), it returns a `SettlementSummary` with per-person totals and peer-to-peer settlement transactions.

Design properties:
- **Zero side effects** — no state mutation, no network calls, no storage access
- **Deterministic** — same input always produces same output
- **Penny-precise** — rounding correction applied to the last participant to ensure the sum equals the bill total exactly
- **Proportional charges** — taxes and fees distributed based on each person's item subtotal, not equally

---

## Design Philosophy

### Logic first

Every feature begins as a pure TypeScript function in `services/`. The settlement engine, bill parser, and OCR pipeline were all built and validated before any UI existed. This ensures correctness is independent of rendering.

### UI second

Screens are intentionally thin. They read from stores, call service functions, and render results. A screen should never contain business logic — only presentation logic (formatting, layout, navigation).

### Reusable services

The entire `services/` directory has zero React dependencies. These modules can be reused in a Node.js backend, a web app, or a CLI tool without modification. This was a deliberate architectural choice to future-proof the codebase.

### Pure functions

Core calculations (`calculateSettlement`, `recalculateBillTotals`, `matchItems`, `normalizePhoneNumber`) are pure functions with no side effects. They are the easiest code to test, the hardest code to break, and the most portable across platforms.

---

## Future Roadmap

Listed in priority order:

| Priority | Feature | Description |
|---|---|---|
| 🔴 P0 | **Firebase Auth** | Replace mock login with phone OTP verification via Firebase Authentication |
| 🔴 P0 | **Realtime Groups** | Sync groups to Cloud Firestore — all participants see live settlement updates |
| 🟡 P1 | **Push Notifications** | Firebase Cloud Messaging for payment reminders and group invites |
| 🟡 P1 | **QR Join** | Generate QR codes for groups — scan to join without contact exchange |
| 🟡 P1 | **Payment Verification** | Server-side UPI payment confirmation instead of self-reported status |
| 🟢 P2 | **Cloud Sync** | Receipt images stored in Firebase Storage, accessible from any device |
| 🟢 P2 | **UI Redesign** | Design system overhaul with Reanimated-driven animations and haptic feedback |
| 🟢 P2 | **Multi-currency** | Support for non-INR currencies with exchange rate handling |
| 🔵 P3 | **Web Dashboard** | React web app for viewing settlement history on desktop |
| 🔵 P3 | **Recurring Groups** | Persistent groups for roommates or regular dining partners |

---

## Challenges Solved

### OCR Accuracy

**Problem:** Gemini Vision's `response_mime_type: "application/json"` mode caused the model to *interpret* the receipt and produce a minimal JSON summary (121 characters) instead of performing full line-by-line OCR.

**Solution:** Split the pipeline into two stages. Stage 1 (`ocr.ts`) uses Gemini Vision in **raw text mode** — no JSON schema, no `maxOutputTokens` cap — to extract every visible character. Stage 2 (`parseBill.ts`) uses Gemini Flash Lite in **JSON mode** to structure the raw text. This separation increased OCR completeness from ~40% to ~98% of line items.

### Bill Recalculation

**Problem:** When users edit, add, or delete items after OCR, the subtotal, charges, and grand total become inconsistent. Manually tracking which fields to update was error-prone.

**Solution:** `recalculateBillTotals.ts` — a pure function that recomputes the entire bill from items + charges on every mutation. Called automatically by `billStore` on every `updateBill`, `addItem`, `editItem`, and `removeItem` operation. Includes negative-total protection and legacy field back-fill.

### Settlement Precision

**Problem:** Splitting ₹100 three ways yields ₹33.33 per person — but 3 × ₹33.33 = ₹99.99, losing ₹0.01. Over multiple charges, these rounding errors compound.

**Solution:** The settlement engine rounds each participant's total to 2 decimal places, then assigns the remainder (positive or negative) to the last participant. This guarantees that `sum(participantTotals) === billTotal` to the penny, regardless of the number of participants or split method.

### Duplicate Contacts

**Problem:** Device contact books contain duplicates — same person with multiple phone number entries, contacts with blank names, entries with the literal string "null", and identical IDs.

**Solution:** `ContactPickerModal.tsx` implements a three-layer deduplication strategy: (1) skip contacts with blank/null names, (2) deduplicate by contact ID, (3) deduplicate by normalized phone number. The `normalizePhoneNumber` utility strips all formatting and applies E.164 normalization before comparison.

### Architecture Separation

**Problem:** Early prototypes mixed business logic into React components. State lived in `useState`, calculations happened in event handlers, and API calls were inline. This made the code untestable and created tight coupling between UI and logic.

**Solution:** Introduced the singleton store pattern (`billStore`, `groupStore`, `authStore`) with framework-agnostic services. React components now import stores via hooks (`useAuth`, `useBillStore`, `useGroups`) that provide reactive updates without React Context. The service layer has zero React dependencies.

### UPI Deep Linking

**Problem:** UPI payment links (`upi://pay?...`) require specific URL encoding, amount formatting (exactly 2 decimal places), and graceful handling when no UPI app is installed.

**Solution:** `upi.ts` constructs spec-compliant UPI URIs with proper `encodeURIComponent` encoding, `toFixed(2)` amount formatting, and a `Linking.canOpenURL` check before attempting to open. When no UPI app is found, it copies the receiver's UPI ID to the clipboard and shows an explanatory alert.

### AsyncStorage Persistence

**Problem:** Group and auth data needed to survive app restarts, but `AsyncStorage` is async — creating a timing gap between app launch and data availability where the UI would flash incorrect state.

**Solution:** Each store (`authStore`, `groupStore`) initializes with `isLoading: true` and exposes a `restore()` method called once from the root layout. The auth guard in `_layout.tsx` shows a full-screen spinner while `isLoading` is true, preventing flash-of-unauthenticated-content. Only after `restore()` resolves does the actual routing logic execute.

### Native Module Integration

**Problem:** ML Kit Text Recognition requires native module linking. The JavaScript package (`@react-native-ml-kit/text-recognition`) always exports a non-null object, but `NativeModules.TextRecognition` is `null` when the native side isn't linked — causing runtime crashes.

**Solution:** `mlkitOcr.ts` checks `NativeModules.TextRecognition` (not the JS export) at module load time and logs diagnostic information. The `try/catch` in `extractTextWithMLKit` detects "doesn't seem to be linked" and "Native module cannot be null" errors and throws a user-friendly message instructing to rebuild the Android app.

---

## Lessons Learned

### Why calculations are centralized

Early versions had split calculations scattered across three different screen components. When a bug was found in tax distribution, it had to be fixed in three places. Centralizing all math into `calculateSettlement.ts` created a single source of truth that is testable in isolation and impossible to accidentally diverge.

### Why stores exist

React Context works for simple state, but it forces re-renders on every consumer when any part of the state changes. Module-level singletons with selective subscriptions give us the reactivity of Context with the performance of direct state access. The stores also exist outside React's lifecycle — they can be read synchronously from service functions without hooks.

### Why UI should remain thin

The thinnest screens in the codebase are the most reliable. `history.tsx` (72 lines) has never had a bug. `group/[id].tsx` (535 lines) has had several. The correlation is direct: more UI logic means more surface area for defects. The ideal screen reads state from a hook, calls a service function on user action, and renders the result. Nothing more.

---

## Resume Highlights

Billy demonstrates the following software engineering concepts:

| Concept | Implementation |
|---|---|
| **AI/ML Integration** | Multi-model Gemini pipeline (Vision for OCR, Flash Lite for parsing), Google Cloud Vision API, ML Kit on-device inference |
| **Mobile Development** | Production React Native app with Expo, native module integration, platform-specific behavior (Android/iOS) |
| **State Management** | Custom singleton store pattern with subscriber-based reactivity — no Redux, no Context |
| **Type Safety** | End-to-end TypeScript with strict typing across 3 type definition files and 12 service modules |
| **API Design** | Retry logic with exponential backoff, abort controller support, graceful degradation across 3 OCR providers |
| **Algorithm Design** | Fuzzy string matching (LCS similarity), proportional charge distribution, penny-precise rounding correction |
| **Payment Integration** | UPI deep linking with URI spec compliance, clipboard fallbacks, and payment confirmation flows |
| **Data Modeling** | Firebase-ready schemas with local-first persistence, migration-path annotations in source code |
| **Separation of Concerns** | Framework-agnostic service layer, pure calculation engine, thin UI components |
| **Error Handling** | Multi-layer fallbacks (Gemini → regex parser, Vision API → line estimation, UPI app → clipboard), user-friendly error messages |
| **Architecture Patterns** | Singleton stores, subscriber/observer pattern, custom React hooks as store bridges, pure functions for core logic |
| **DevOps** | Expo managed → dev client migration, native build configuration, environment variable management |
