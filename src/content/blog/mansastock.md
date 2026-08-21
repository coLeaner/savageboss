---
title: "The Technical Depth of MansaStock"
description: "A full architectural teardown of MansaStock — how the multi-tenant POS platform was built, from Convex schema to the data-driven RBAC model."
date: 2026-07-23
tags: ["AI", "Building", "Speculative"]
draft: false
---

## Table of Contents

1. [Introduction & System Overview](#1-introduction--system-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Use Case Diagram](#4-use-case-diagram)
5. [Data Flow Diagrams](#5-data-flow-diagrams)
6. [Entity Relationship Diagram (Database Schema)](#6-entity-relationship-diagram-database-schema)
7. [Class Diagram (Domain Model)](#7-class-diagram-domain-model)
8. [State Chart Diagrams](#8-state-chart-diagrams)
9. [Sequence Diagrams](#9-sequence-diagrams)
10. [Communication Diagram — Sale Processing](#10-communication-diagram--sale-processing)
11. [Activity Diagram — Sale & Inventory Update Flow](#11-activity-diagram--sale--inventory-update-flow)
12. [Access Control (RBAC) Model](#12-access-control-rbac-model)
13. [Appendix A — Convex Backend Module Reference](#13-appendix-a--convex-backend-module-reference)
14. [Appendix B — Glossary](#14-appendix-b--glossary)

---

## 1. Introduction & System Overview

**MansaStock** is a multi-tenant Point-of-Sale (POS) and inventory-management SaaS platform for small and medium retail businesses. Each customer business operates as an isolated **organization** (tenant), with role-based staff accounts, a product catalog, a POS checkout terminal, sales/refund history, low-stock alerting, and a public QR-code ordering storefront for their own customers.

The system is delivered through **three client surfaces sharing one backend**:

| Surface | Technology | Purpose |
|---|---|---|
| Web application | Next.js (App Router) | Full admin/manager/cashier dashboard + browser-based POS terminal |
| Android TWA shell | Bubblewrap-wrapped web app | Installs the web POS as a Play Store app with no browser chrome (thin wrapper, no separate business logic) |
| Native mobile app | Expo / React Native (iOS + Android) | Full native POS with offline-first sales queueing, camera/HID barcode scanning, and receipt printing |
| Public storefront | Next.js public route (`/order/[storeSlug]`) | Unauthenticated customer-facing QR ordering menu |

All four surfaces read and write the **same Convex backend deployment** — there is one database, one set of business rules, and one authorization model shared across web, TWA, and native mobile.

---

## 2. Technology Stack

### 2.1 Web Application (`mansa-stock`)

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js 16** (React 19), App Router | Route groups: `app/(app)/` (authenticated dashboard), `app/(pos)/` (POS terminal), `app/order/` (public storefront) |
| Language | TypeScript 5 | Strict typing across frontend and Convex functions |
| Backend-as-a-Service | **Convex 1.31** | Reactive database + serverless functions (queries/mutations/actions), shared with the mobile app |
| Authentication | **Clerk** (`@clerk/nextjs`, Clerk Organizations) | Multi-tenant identity provider; one Clerk Organization ≈ one MansaStock business |
| Styling | Tailwind CSS 4, Radix UI / Base UI primitives, shadcn-generated components | `class-variance-authority`, `lucide-react` icons, `cmdk` command palette, `sonner` toasts |
| Animation | `motion` (Framer Motion's successor), GSAP | Page/section transitions, POS cart animations |
| Data tables & charts | `@tanstack/react-table`, `recharts` | Inventory/sales tables, dashboard analytics |
| Barcode scanning | `@zxing/browser`, native `BarcodeDetector` API (feature-detected) | Camera-based scan in POS and inventory forms; falls back to zxing on unsupported browsers |
| Voice input | Web Speech API (`SpeechRecognition`) | Dictation in the AI assistant composer |
| Spreadsheet I/O | `xlsx` | Bulk product import, report export |
| Image handling | `browser-image-compression`, `heic2any` | Client-side compression + iPhone HEIC→JPEG conversion before upload |
| QR codes | `qrcode` | Generates the storefront's ordering QR code |
| AI assistant | `streamdown` (streaming markdown) | Conversational analytics assistant panel |
| Observability | `posthog-js`, `@posthog/nextjs-config`, `@vercel/analytics`, `@vercel/speed-insights` | See §2.6 |

### 2.2 Mobile Application (`MansaStock-Mobile`)

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Expo SDK 54**, React Native 0.81, React 19 | `expo-router` file-based navigation; route groups `(auth)/` and `(pos)/(tabs)/` |
| Language | TypeScript | Shared conventions with the web repo |
| Backend | **Convex 1.35** JS client | Generated client (`convex/_generated/`) mirrors the *same* deployment as the web app — no separate functions live in the mobile repo |
| Authentication | `@clerk/expo` + `expo-secure-store` token cache, `ConvexProviderWithClerk` | Identical Clerk org/JWT model as web, wired directly into the Convex React client |
| Styling | `nativewind` (Tailwind-in-React-Native), Tailwind CSS 4 | Mirrors the web app's design tokens |
| Animation/gestures | `react-native-reanimated`, `react-native-gesture-handler` | Swipe/cart interactions |
| Offline persistence | `@react-native-async-storage/async-storage`, `@react-native-community/netinfo` | Custom offline-first layers: `offline-sales-storage.ts`, `active-cart-storage.ts`, `held-sales-storage.ts` — sales made while offline are queued and synced with an idempotent `clientSaleId` |
| Camera / hardware | `expo-camera` (barcode/QR scanning), `expo-print` (receipts), `expo-notifications` + Firebase (native push) | |
| Biometrics | `expo-local-authentication` | Device app-lock |
| Build/deploy | **EAS Build** (`development`/`preview`/`production` profiles), native `android/` Gradle project | Genuine native app via Expo/EAS — **not** a TWA wrapper (that's the separate web-based distribution channel) |

### 2.3 Backend-as-a-Service: Convex

Convex provides the entire backend: a reactive document database, serverless TypeScript functions (`query` / `mutation` / `action`), file storage, and cron scheduling — all in one deployment shared by both client apps. Key architectural facts:

- **24 tables**, almost every one indexed on `organizationId` (multi-tenant partition key) — see §6.
- Functions are organized into **domain modules** (`products.ts`, `sales.ts`, `access.ts`, `rbac.ts`, `dashboard.ts`, …) — see Appendix A.
- **No decorator-based auth** — every query/mutation calls `requireOrganizationMembership()` or `requirePermission()` as the first line of its handler (see §12).
- Reactive queries mean the UI subscribes to live data; when a mutation writes, every open subscription that reads the affected rows re-renders automatically (both on web and mobile) — no manual polling/refetching.

### 2.4 Authentication & Multi-Tenancy

- **Clerk Organizations** model tenants: one Clerk Organization = one MansaStock business. A user can belong to multiple organizations (multi-store staff).
- **Web edge middleware** (`proxy.ts`, Next.js 16's renamed `middleware.ts`) wraps `clerkMiddleware`; only `/`, `/login`, `/signup`, `/accept-invitation`, `/order` (public storefront), and `/contact` are unauthenticated — everything else calls `auth.protect()`.
- **Convex identity mapping** (`convex/auth.config.ts`) registers Clerk as the JWT issuer, so `ctx.auth.getUserIdentity()` inside any Convex function returns the decoded Clerk claims (user id, active org id/role).
- **Clerk → Convex sync**: a Clerk webhook (`app/api/webhooks/clerk/route.ts`) pushes org-membership/role changes into Convex's own `userRoles`/`pendingUserInvites` tables via a secret-guarded server-to-server call — Convex's RBAC tables, not the live Clerk role, are the durable source of truth for authorization (see §12).
- **Mobile** uses the identical Clerk session model via `@clerk/expo`, feeding the same Convex backend — one identity graph, two clients.

### 2.5 Deployment & Infrastructure

- **Web hosting**: **Vercel** (Next.js-native hosting + edge middleware).
- **CI/CD** (`.github/workflows/ci.yml`): (1) lint + typecheck on every PR, (2) `npx convex deploy` on merge to `main` (Convex backend deploys are driven by CI, independent of Vercel's build step), (3) automatic GitHub release tagging.
- **Android TWA**: the web POS is packaged via **Bubblewrap** as a Trusted Web Activity, launching directly into `/pos`, distributed through Google Play under package id `com.mansastock.pos`. Requires `/manifest.webmanifest` and `/.well-known/assetlinks.json` (Digital Asset Links) served from production so Chrome removes browser chrome. This is a thin wrapper with **no duplicated business logic** — a second distribution channel for the same web app, distinct from the native mobile app below.
- **Native mobile distribution**: **EAS Build/Submit** produces store binaries for Google Play and the Apple App Store from the Expo/React Native codebase.
- **Push notifications**: Convex actions call the **Expo Push Service**, which relays to **Firebase Cloud Messaging** for Android delivery.

### 2.6 Observability & Analytics

- **PostHog** is the sole analytics/error-tracking pipeline (no separate Sentry integration found in code).
  - **Client** (`posthog-js`): initialized with `api_host: "/ingest"` — never calls PostHog's domain directly. `next.config.ts` rewrites `/ingest/*` to PostHog's ingestion hosts, defeating ad-blockers and keeping analytics traffic out of Clerk's auth matcher.
  - **Identity**: `distinctId` = the Clerk user id, set via `posthog.identify()` on sign-in and reset on sign-out.
  - **Server-side** (`@posthog/convex` component, registered in `convex.config.ts`): Convex mutations/actions call `reportException()` from `convex/posthog.ts` inside `catch` blocks to forward exceptions to PostHog Error Tracking without ever throwing itself.
  - **Source maps**: `withPostHogConfig` uploads build-time source maps tagged with the Vercel git commit SHA, so production stack traces de-minify to real source.
  - Session replay is enabled with `maskAllInputs: true`.
- The **mobile app has no PostHog/analytics dependency** — observability is currently web-only (a noted gap for future work).
- `@vercel/analytics` / `@vercel/speed-insights` provide Vercel's own pageview and Core Web Vitals beacons.

---

## 3. System Architecture

### 3.1 High-Level Architecture

```mermaid
flowchart TB
    subgraph Clients["Client Applications"]
        WebApp["Next.js Web App<br/>(Admin / Manager / Cashier Dashboard + POS)"]
        TWA["Android TWA Shell<br/>(Bubblewrap wrapper of Web POS)"]
        MobileApp["Expo / React Native App<br/>(iOS + Android native POS)"]
        Storefront["Public QR Storefront<br/>(/order/[storeSlug], unauthenticated)"]
    end

    subgraph Auth["Identity Provider"]
        Clerk["Clerk<br/>Organizations, Users, JWT Sessions"]
    end

    subgraph Backend["Convex Backend (single shared deployment)"]
        Functions["Convex Functions<br/>Queries / Mutations / Actions"]
        RTDB[("Convex Reactive Database<br/>24 tables")]
        FileStorage[("Convex File Storage<br/>product images")]
        Cron["Convex Cron Jobs<br/>notification purge"]
        PostHogComponent["@posthog/convex component"]
    end

    subgraph External["External Services"]
        PostHog["PostHog Cloud<br/>Analytics, Session Replay, Error Tracking"]
        Expo["Expo Push Service"]
        FCM["Firebase Cloud Messaging"]
    end

    subgraph Hosting["Hosting & Distribution"]
        Vercel["Vercel<br/>Next.js hosting + Edge Middleware"]
        PlayStore["Google Play Store"]
        AppStore["Apple App Store"]
    end

    WebApp -->|HTTPS| Vercel
    Vercel -->|Reactive WebSocket / HTTPS| Functions
    TWA -->|wraps| WebApp
    MobileApp -->|Reactive WebSocket / HTTPS| Functions
    Storefront -->|HTTPS| Vercel

    WebApp -.->|Clerk SDK| Clerk
    MobileApp -.->|Clerk Expo SDK| Clerk
    Vercel -->|clerkMiddleware / proxy.ts| Clerk
    Clerk -->|JWT issuer, webhooks| Vercel
    Functions -->|ctx.auth.getUserIdentity| Clerk

    Functions --> RTDB
    Functions --> FileStorage
    Cron --> Functions
    Functions --> PostHogComponent --> PostHog
    WebApp -.->|posthog-js via /ingest proxy| PostHog

    Functions -->|sendAdminPushNotifications| Expo --> FCM --> MobileApp

    Vercel --> PlayStore
    MobileApp --> PlayStore
    MobileApp --> AppStore
```

### 3.2 Deployment Diagram (Runtime / Physical View)

```mermaid
flowchart TB
    subgraph BrowserNode["Runtime Node: User's Browser"]
        BrowserProc["Next.js React Client<br/>(Web Dashboard / POS)"]
    end

    subgraph MobileNode["Runtime Node: iOS / Android Device"]
        MobileProc["Expo React Native App"]
        TWAProc["TWA Shell (Android only)"]
    end

    subgraph VercelEdge["Deployment Node: Vercel"]
        SSR["Next.js SSR / Route Handlers"]
        Middleware["Edge Middleware (proxy.ts)"]
        IngestProxy["/ingest Reverse Proxy"]
    end

    subgraph ConvexCloud["Deployment Node: Convex Cloud"]
        ConvexFn["Function Runtime<br/>(Queries / Mutations / Actions)"]
        ConvexDB[("Document Database<br/>24 tables, indexes")]
        ConvexStorage[("File Storage")]
        ConvexCron["Cron Scheduler"]
    end

    subgraph ClerkCloud["Deployment Node: Clerk Cloud"]
        ClerkAuth["Organizations, Sessions, JWT Issuer"]
    end

    subgraph PostHogCloud["Deployment Node: PostHog Cloud"]
        PHIngest["Ingestion API"]
        PHReplay["Session Replay Storage"]
    end

    subgraph GoogleCloud["Deployment Node: Firebase"]
        FCMSvc["Cloud Messaging"]
    end

    subgraph CI["CI/CD: GitHub Actions"]
        CIPipeline["lint → typecheck → convex deploy → release"]
    end

    BrowserProc -->|HTTPS| SSR
    SSR --> Middleware --> ClerkAuth
    BrowserProc -->|WebSocket| ConvexFn
    MobileProc -->|WebSocket| ConvexFn
    TWAProc -.->|wraps| BrowserProc
    MobileProc --> ClerkAuth
    ConvexFn --> ConvexDB
    ConvexFn --> ConvexStorage
    ConvexCron --> ConvexFn
    ConvexFn -->|ctx.auth| ClerkAuth
    BrowserProc -->|via IngestProxy| PHIngest
    ConvexFn --> PHIngest
    PHIngest --> PHReplay
    ConvexFn -->|push| FCMSvc --> MobileProc
    CIPipeline -->|npx convex deploy| ConvexCloud
    CIPipeline -.->|triggers| VercelEdge
```

### 3.3 Component Diagram

```mermaid
flowchart LR
    subgraph WebComponents["Web App — Logical Components"]
        AppRouter["app/ — Route Segments<br/>(app), (pos), api/webhooks, order/"]
        UIComponents["components/<br/>ai-assistant, barcode, dashboard,<br/>inventory, layout, pos, sales, settings, ui"]
        HooksLib["hooks/ + lib/<br/>client utilities, offline, receipts"]
    end

    subgraph MobileComponents["Mobile App — Logical Components"]
        MobileRouter["app/ — expo-router screens<br/>(auth), (pos)/(tabs)"]
        MobileUI["components/<br/>pos, offline, notifications, auth"]
        MobileLib["hooks/ + lib/ + store/<br/>offline storage, cart, printer"]
    end

    subgraph ConvexModules["Convex Backend — Function Modules"]
        AccessMod["access.ts / rbac.ts<br/>Authorization"]
        ProductsMod["products.ts<br/>Catalog CRUD"]
        SalesMod["sales.ts<br/>POS + Customer Orders"]
        ReportingMod["reporting.ts, reports_*.ts,<br/>analytics.ts, dashboard.ts"]
        NotifMod["notifications.ts,<br/>push_notifications.ts"]
        SettingsMod["settings.ts,<br/>organizations.ts"]
        SupportMod["stock_thresholds.ts, business_date.ts,<br/>crons.ts, migrations.ts"]
    end

    AppRouter --> UIComponents --> HooksLib
    MobileRouter --> MobileUI --> MobileLib
    HooksLib -->|convex/react| ConvexModules
    MobileLib -->|convex/react-clerk| ConvexModules
    AccessMod --- ProductsMod
    AccessMod --- SalesMod
    AccessMod --- ReportingMod
    AccessMod --- NotifMod
    AccessMod --- SettingsMod
    SalesMod --> NotifMod
    SalesMod --> SupportMod
    ProductsMod --> SupportMod
```

---

## 4. Use Case Diagram

> Mermaid has no native use-case diagram type; actors are drawn as stadium nodes and use cases as circle/oval nodes inside a system-boundary subgraph — the standard textual workaround.

```mermaid
flowchart LR
    Administrator(["👤 Administrator"])
    Manager(["👤 Manager"])
    Cashier(["👤 Cashier"])
    Customer(["👤 Customer"])
    SystemActor(["⚙️ System"])

    subgraph MansaStock["MansaStock POS & Inventory System"]
        UC1(("Process Sale / POS Checkout"))
        UC2(("Scan Barcode"))
        UC3(("View Sales History"))
        UC4(("Process Refund"))
        UC5(("Manage Inventory / Products"))
        UC6(("Adjust Stock"))
        UC7(("View Inventory"))
        UC8(("Manage Employees"))
        UC9(("Manage Users & Roles"))
        UC10(("Edit Company Settings"))
        UC11(("View Dashboard / Reports"))
        UC12(("Export Reports"))
        UC13(("Manage QR Orders<br/>Prepare / Ready / Confirm / Cancel"))
        UC14(("Configure QR Ordering Menu"))
        UC15(("Browse Storefront Menu"))
        UC16(("Place QR Order"))
        UC17(("Track Order Status"))
        UC18(("Send Stock / Sale Notifications"))
    end

    Administrator --> UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UC7 & UC8 & UC9 & UC10 & UC11 & UC12 & UC13 & UC14
    Manager --> UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UC7 & UC8 & UC10 & UC11 & UC12 & UC13 & UC14
    Cashier --> UC1 & UC2 & UC3 & UC7 & UC13
    Customer --> UC15 & UC16 & UC17
    SystemActor --> UC18
    UC1 -.->|"«include»"| UC18
    UC4 -.->|"«include»"| UC18
    UC13 -.->|"«include»"| UC1
```

### Use Case Descriptions

| Use Case | Primary Actor | Preconditions | Trigger | Postcondition |
|---|---|---|---|---|
| Process Sale / POS Checkout | Cashier, Manager, Administrator | Has `sales_create`; cart non-empty | Tap "Finalize Sale" | Sale recorded, stock decremented, receipt issued |
| Scan Barcode | Cashier, Manager, Administrator | Camera or HID scanner available | Scan a product code | Matched product added to cart / SKU field filled |
| View Sales History | Cashier, Manager, Administrator | Has `sales_view` | Open Sales page | List of past transactions displayed |
| Process Refund | Manager, Administrator | Has `sales_refund`; sale not already fully refunded | Select sale, choose lines/quantities | Refund recorded, stock restored, sale status updated |
| Manage Inventory / Products | Manager, Administrator | Has `inventory_manage` | Add/edit/import product | Product catalog updated |
| Adjust Stock | Manager, Administrator | Has `inventory_adjust` | Manual stock correction | `products.stock` patched |
| View Inventory | All staff roles | Has `inventory_view` | Open Inventory page | Catalog with stock levels displayed |
| Manage Employees | Manager, Administrator | Has `employees_manage` | Invite/edit staff member | `userRoles` / `pendingUserInvites` updated |
| Manage Users & Roles | Administrator only | Has `settings_users` | Edit role-permission matrix | `rolePermissions` updated |
| Edit Company Settings | Manager, Administrator | Has `settings_company` | Update business profile | `companySettings` updated |
| View Dashboard / Reports | Manager, Administrator | Has `reports_view` | Open Dashboard/Reports page | Analytics rendered |
| Export Reports | Manager, Administrator | Has `reports_export` | Click export | CSV/PDF generated |
| Manage QR Orders | Cashier, Manager, Administrator | Has `sales_create` | Order arrives / staff acts on it | Order status transitions (see §8.3) |
| Configure QR Ordering Menu | Manager, Administrator | Has `sales_create` + `settings_company` (feature toggle) | Generate/enable menu | `customerOrderMenus` created/enabled |
| Browse Storefront Menu | Customer | Menu enabled | Scan store QR code | Product menu displayed |
| Place QR Order | Customer | Menu enabled, products in stock | Submit cart + contact info | `customerOrders` created (status `pending`) |
| Track Order Status | Customer | Has order number/link | Open tracking link | Live order status displayed |
| Send Stock / Sale Notifications | System | Sale/refund crosses a threshold | Stock decrement/increment or sale event | Admin notification created + optional push |

---

## 5. Data Flow Diagrams

### 5.1 Context Diagram (Level 0)

```mermaid
flowchart TB
    Cashier["Cashier / Manager / Administrator"]
    Customer["Customer"]
    ClerkExt["Clerk (Identity Provider)"]
    PostHogExt["PostHog (Analytics)"]
    FCMExt["Firebase / Expo Push"]

    System(("0<br/>MansaStock<br/>POS & Inventory System"))

    Cashier -->|"Login, sale input,<br/>product data, role assignments"| System
    System -->|"Receipts, dashboards,<br/>reports, notifications"| Cashier
    Customer -->|"Order selections,<br/>name & phone"| System
    System -->|"Order status, menu"| Customer
    System <-->|"JWT / session verification,<br/>webhooks"| ClerkExt
    System -->|"Events, exceptions"| PostHogExt
    System -->|"Push payloads"| FCMExt
    FCMExt -->|"Delivery receipts"| System
```

### 5.2 Level 1 Data Flow Diagram

```mermaid
flowchart TB
    Cashier(["Cashier / Manager / Admin"])
    Customer(["Customer"])

    P1(("1.0<br/>Authentication &<br/>Access Control"))
    P2(("2.0<br/>Catalog<br/>Management"))
    P3(("3.0<br/>POS Sales<br/>Processing"))
    P4(("4.0<br/>QR Customer<br/>Ordering"))
    P5(("5.0<br/>Refund<br/>Processing"))
    P6(("6.0<br/>Reporting &<br/>Analytics"))
    P7(("7.0<br/>Notification<br/>Management"))

    D1[("D1  userRoles / accessRoles /<br/>rolePermissions")]
    D2[("D2  products / categories /<br/>skuCounters")]
    D3[("D3  sales / saleLineItems /<br/>receiptCounters / salesAggregates")]
    D4[("D4  customerOrders / customerOrderItems /<br/>customerOrderMenus")]
    D5[("D5  refunds / refundLineItems /<br/>refundCounters")]
    D6[("D6  notifications /<br/>pushNotificationTokens")]

    Cashier --> P1 --> D1
    Cashier --> P2 --> D2
    Cashier --> P3
    P3 --> D2
    P3 --> D3
    Customer --> P4 --> D4
    P4 --> D2
    P4 -.->|"confirm → creates sale"| P3
    Cashier --> P5 --> D5
    P5 --> D3
    P5 --> D2
    Cashier --> P6
    P6 --> D3
    P6 --> D2
    P6 --> D4
    P3 --> P7
    P5 --> P7
    P1 --> P7
    P7 --> D6
    P7 -.->|"push / in-app"| Cashier
```

---

## 6. Entity Relationship Diagram (Database Schema)

The Convex schema (`convex/schema.ts`) defines **24 tables**. Almost every table carries an `organizationId: string` field (the multi-tenant partition key) indexed as the first component of its primary index — this is the dominant relationship across the whole schema and is called out once here rather than repeated on every cluster diagram below. There is **no `users` table**: identity lives entirely in Clerk; only role/preference/token *projections* are stored locally (`userRoles`, `personalSettings`, `pushNotificationTokens`).

Convex references (`v.id("otherTable")`) are the closest equivalent to a foreign key and are shown as solid relationship lines below. Several relationships are **logical only** (matched by string/enum value, not `v.id()`) — e.g. `organizations.organizationId` to every tenant-scoped table, `rolePermissions.roleId` ↔ `accessRoles.roleId`, and `customerOrders.menuSlug` ↔ `customerOrderMenus.slug`. These are noted in prose rather than drawn as `v.id()` edges, to keep the diagrams accurate to the type system.

The ER diagram is split into four domain clusters for readability, followed by a complete field-by-field reference (§6.5).

### 6.1 Cluster A — Organization, Identity & Access Control

```mermaid
erDiagram
    ORGANIZATIONS {
        string organizationId PK
        string name
        string status
        string setupStatus
        boolean customerOrderingEnabled
    }
    USERROLES {
        string organizationId FK
        string clerkUserId
        string appRole
        string clerkRole
    }
    PENDINGUSERINVITES {
        string organizationId FK
        string email
        string appRole
        string status
    }
    ACCESSROLES {
        string organizationId FK
        string roleId
        string name
        boolean isSystem
    }
    ACCESSPERMISSIONS {
        string organizationId FK
        string permissionId
        string groupId
        string name
    }
    ROLEPERMISSIONS {
        string organizationId FK
        string roleId "logical FK -> accessRoles.roleId"
        string permissionId "logical FK -> accessPermissions.permissionId"
    }
    COMPANYSETTINGS {
        string organizationId FK
        string companyName
        string currency
        number globalDiscountPercent
    }
    PERSONALSETTINGS {
        string clerkUserId PK
        string language
        string themeMode
    }

    ORGANIZATIONS ||--o{ USERROLES : "has members"
    ORGANIZATIONS ||--o{ PENDINGUSERINVITES : "has invites"
    ORGANIZATIONS ||--o{ ACCESSROLES : "defines"
    ORGANIZATIONS ||--o{ ACCESSPERMISSIONS : "defines"
    ORGANIZATIONS ||--o{ ROLEPERMISSIONS : "grants"
    ORGANIZATIONS ||--|| COMPANYSETTINGS : "configured by"
```

`PERSONALSETTINGS` is deliberately not linked to `ORGANIZATIONS` — it is the **only** table with no `organizationId`, keyed solely by `clerkUserId` (per-user, cross-org preferences).

### 6.2 Cluster B — Catalog & Inventory

```mermaid
erDiagram
    CATEGORIES {
        string organizationId FK
        string name
    }
    SKUCOUNTERS {
        string organizationId FK
        id categoryId FK
        number lastId
    }
    PRODUCTS {
        string organizationId FK
        string name
        string sku
        string barcode
        id categoryId FK
        number retailPrice
        number wholesalePrice
        number costPrice
        number stock
        number lowStockThreshold
        string status
    }

    CATEGORIES ||--o{ SKUCOUNTERS : "categoryId"
    CATEGORIES ||--o{ PRODUCTS : "categoryId"
```

### 6.3 Cluster C — Sales & Refunds

```mermaid
erDiagram
    PRODUCTS {
        string sku
        number stock
    }
    SALES {
        string organizationId FK
        string receiptNo
        string cashierUserId
        string paymentMethod
        number total
        string status
        string businessDate
    }
    SALELINEITEMS {
        id saleId FK
        id productId FK
        number qty
        number unitPrice
        number refundedQty
    }
    RECEIPTCOUNTERS {
        string organizationId FK
        number lastId
    }
    SALESAGGREGATES {
        string organizationId FK
        number grossSales
        number refundTotal
        number completedOrders
    }
    REFUNDS {
        id saleId FK
        string refundNo
        string processedByUserId
        number total
    }
    REFUNDLINEITEMS {
        id refundId FK
        id saleId FK
        id saleLineItemId FK
        id productId FK
        number qty
    }
    REFUNDCOUNTERS {
        string organizationId FK
        number lastId
    }

    SALES ||--o{ SALELINEITEMS : "saleId"
    PRODUCTS ||--o{ SALELINEITEMS : "productId"
    SALES ||--o{ REFUNDS : "saleId"
    REFUNDS ||--o{ REFUNDLINEITEMS : "refundId"
    SALES ||--o{ REFUNDLINEITEMS : "saleId"
    SALELINEITEMS ||--o{ REFUNDLINEITEMS : "saleLineItemId"
    PRODUCTS ||--o{ REFUNDLINEITEMS : "productId"
```

### 6.4 Cluster D — Customer Ordering & Notifications

```mermaid
erDiagram
    PRODUCTS {
        string sku
    }
    SALES {
        string receiptNo
    }
    CUSTOMERORDERMENUS {
        string organizationId FK
        string slug
        boolean enabled
    }
    CUSTOMERORDERCOUNTERS {
        string organizationId FK
        number lastId
    }
    CUSTOMERORDERS {
        string organizationId FK
        string orderNo
        string menuSlug "logical FK -> customerOrderMenus.slug"
        string status
        string customerName
        string customerPhone
        number total
        id completedSaleId FK
    }
    CUSTOMERORDERITEMS {
        id customerOrderId FK
        id productId FK
        number qty
        number unitPrice
    }
    NOTIFICATIONS {
        string organizationId FK
        string recipientUserId
        string eventType
        id saleId FK
        boolean isRead
    }
    PUSHNOTIFICATIONTOKENS {
        string organizationId FK
        string clerkUserId
        string token
        string platform
        boolean enabled
    }

    CUSTOMERORDERS ||--o{ CUSTOMERORDERITEMS : "customerOrderId"
    PRODUCTS ||--o{ CUSTOMERORDERITEMS : "productId"
    CUSTOMERORDERS ||--o| SALES : "completedSaleId"
    SALES ||--o{ NOTIFICATIONS : "saleId (optional)"
```

### 6.5 Full Schema Reference

<details>
<summary><strong>Click to expand the complete field-by-field schema (all 24 tables)</strong></summary>

#### organizations
| Field | Type | Notes |
|---|---|---|
| organizationId | string | Clerk org id (not a Convex `v.id`) |
| name | string | |
| slug | string? | |
| imageUrl | string? | |
| status | `"active"｜"inactive"｜"deleted"` | |
| setupStatus | `"new"｜"company_ready"｜"catalog_ready"｜"pos_ready"` | Onboarding progress |
| hasCompanySettings / hasProducts / hasAccessSeeded | boolean | Onboarding flags |
| customerOrderingEnabled | boolean | |
| businessType | string? | |
| onboardingCompletedAt | number? | |
| createdAt / updatedAt / deletedAt | number / number / number? | |

Indexes: `by_organizationId`, `by_status`, `by_setupStatus`, `by_updatedAt`

#### userRoles
| Field | Type |
|---|---|
| organizationId | string |
| clerkUserId | string |
| appRole | `"administrator"｜"manager"｜"cashier"` |
| clerkRole | string |
| email / name | string? |
| updatedAt | number |

Indexes: `by_organizationId`, `by_organizationId_and_clerkUserId`, `by_organizationId_and_appRole`

#### pendingUserInvites
| Field | Type |
|---|---|
| organizationId | string |
| email | string |
| appRole | `"administrator"｜"manager"｜"cashier"` |
| clerkRole | string |
| invitationId / status | string? |
| invitedAt / updatedAt | number |

Indexes: `by_organizationId`, `by_organizationId_and_email`

#### accessRoles
| Field | Type |
|---|---|
| organizationId | string |
| roleId | `"administrator"｜"manager"｜"cashier"` |
| name | string |
| isSystem | boolean |
| createdAt | number |

Indexes: `by_organizationId`, `by_organizationId_and_roleId`

#### accessPermissions
| Field | Type |
|---|---|
| organizationId | string |
| permissionId | string |
| groupId / groupLabel | string |
| name / description | string |
| createdAt | number |

Indexes: `by_organizationId`, `by_organizationId_and_permissionId`, `by_organizationId_and_groupId`

#### rolePermissions
| Field | Type |
|---|---|
| organizationId | string |
| roleId | `"administrator"｜"manager"｜"cashier"` |
| permissionId | string |
| createdAt | number |

Indexes: `by_organizationId`, `by_organizationId_and_roleId`, `by_organizationId_and_roleId_and_permissionId`

#### companySettings
| Field | Type |
|---|---|
| organizationId | string |
| companyName / legalName / taxId | string |
| supportEmail / supportPhone / website | string |
| address / city / country | string |
| currency / timezone | string |
| theme / primaryColor / accentColor | string / string / string? |
| receiptFooter | string |
| globalDiscountPercent | number? |
| customerOrderingEnabled | boolean? |
| updatedAt | number |

Index: `by_organizationId`

#### personalSettings
| Field | Type |
|---|---|
| clerkUserId | string (only key — no organizationId) |
| language | `"en"｜"fr"` |
| textSize | `"compact"｜"default"｜"large"` |
| themeMode | `"light"｜"dark"｜"system"` |
| density | `"comfortable"｜"compact"` |
| reduceMotion / highContrast | boolean |
| timeFormat | `"12h"｜"24h"` |
| dateFormat | `"dd/mm/yyyy"｜"mm/dd/yyyy"｜"yyyy-mm-dd"` |
| defaultStartPage | union? |
| sidebarDefault / notificationDisplay | union? |
| updatedAt | number |

Index: `by_clerkUserId`

#### categories
| Field | Type |
|---|---|
| name | string |
| organizationId | string |

Indexes: `by_organizationId`, `by_organizationId_and_name`

#### skuCounters
| Field | Type |
|---|---|
| organizationId | string |
| categoryId | `id("categories")` **FK** |
| lastId | number |

Index: `by_organizationId_and_categoryId`

#### products
| Field | Type |
|---|---|
| name | string |
| sku | string |
| barcode | string? — dedicated scan code, distinct from SKU; unique per org when set, stored trim+UPPERCASE |
| categoryId | `id("categories")` **FK** |
| retailPrice / wholesalePrice | number |
| costPrice | number? |
| stock | number |
| imageUrl / imageStorageId / imageStorageUrl | string? / `id("_storage")`? **FK** / string? (denormalized resolved URL) |
| lowStockThreshold | number? (default 10 when unset) |
| organizationId | string |
| status | `"active"｜"inactive"` |

Indexes: `by_organizationId`, `by_organizationId_and_sku`, `by_organizationId_and_barcode`, `by_organizationId_and_categoryId`; search index `search_name` (filtered by `organizationId`)

#### sales
| Field | Type |
|---|---|
| organizationId | string |
| receiptNo | string |
| clientSaleId | string? — offline-sync idempotency key |
| cashierUserId | string (Clerk id) |
| paymentMethod | `"cash"｜"card"｜"transfer"` |
| subtotal / total | number |
| discountPercent / discountTotal / tax | number? |
| status | `"completed"｜"voided"｜"refunded"` |
| refundedTotal / refundedAt / refundedByUserId / refundReason | number? / number? / string? / string? |
| createdAt | number |
| businessDate / businessTimezone | string? |

Indexes: `by_organizationId`, `by_organizationId_and_receiptNo`, `by_organizationId_and_clientSaleId`, `by_organizationId_and_createdAt`, `by_organizationId_and_businessDate`

#### salesAggregates
| Field | Type |
|---|---|
| organizationId | string |
| grossSales / refundTotal | number |
| completedOrders | number |
| updatedAt | number |

Index: `by_organizationId` — a single running-totals row per org, maintained incrementally so dashboard reads avoid full-table scans.

#### notifications
| Field | Type |
|---|---|
| organizationId | string |
| recipientUserId / actorUserId | string |
| eventType | `"sale_completed"｜"sale_refunded"｜"stock_low"｜"stock_out"｜"user_invited"｜"user_role_changed"｜"user_removed"`? |
| type | string? |
| title / message | string |
| saleId | `id("sales")`? **FK** |
| entityId / entityType | string? |
| amount | number? |
| receiptNo | string? |
| isRead | boolean? |
| createdAt / readAt | number / number? |

Indexes: `by_organizationId`, `by_organizationId_and_recipientUserId`, `by_organizationId_and_recipientUserId_and_createdAt`, `by_organizationId_and_recipientUserId_and_isRead_and_createdAt`

#### pushNotificationTokens
| Field | Type |
|---|---|
| organizationId / clerkUserId | string |
| token | string |
| platform | `"ios"｜"android"｜"web"｜"unknown"` |
| deviceName | string? |
| enabled | boolean |
| createdAt / updatedAt / lastRegisteredAt | number |
| lastPushAttemptAt / lastPushStatus / lastPushError | number? / string? / string? |
| disabledAt | number? |

Indexes: `by_token`, `by_organizationId_and_token`, `by_organizationId_and_clerkUserId`, `by_organizationId_and_clerkUserId_and_enabled`

#### receiptCounters
| Field | Type |
|---|---|
| organizationId | string |
| lastId | number |

Index: `by_organizationId`

#### saleLineItems
| Field | Type |
|---|---|
| organizationId | string |
| saleId | `id("sales")` **FK** |
| productId | `id("products")` **FK** |
| productName / sku | string (denormalized snapshot) |
| qty / unitPrice / lineTotal | number |
| unitCost / lineCost | number? |
| refundedQty | number? |
| saleCreatedAt | number? |

Indexes: `by_organizationId`, `by_organizationId_and_saleId`, `by_organizationId_and_saleCreatedAt`

#### customerOrderMenus
| Field | Type |
|---|---|
| organizationId | string |
| slug | string |
| enabled | boolean |
| createdAt / updatedAt | number |

Indexes: `by_organizationId`, `by_slug`

#### customerOrderCounters
| Field | Type |
|---|---|
| organizationId | string |
| lastId | number |

Index: `by_organizationId`

#### customerOrders
| Field | Type |
|---|---|
| organizationId | string |
| orderNo | string |
| menuSlug | string (logical FK → `customerOrderMenus.slug`) |
| status | `"pending"｜"preparing"｜"ready"｜"completed"｜"cancelled"` |
| customerName / customerPhone / note | string? |
| itemCount | number |
| subtotal / tax / total | number |
| discountPercent / discountTotal | number? |
| createdAt / updatedAt | number |
| completedSaleId | `id("sales")`? **FK** |
| preparingAt / readyAt / completedAt / cancelledAt | number? |

Indexes: `by_organizationId_and_status_and_createdAt`, `by_organizationId_and_createdAt`, `by_organizationId_and_orderNo`, `by_menuSlug_and_createdAt`, `by_menuSlug_and_orderNo`; search index `search_customerName`

#### customerOrderItems
| Field | Type |
|---|---|
| organizationId | string |
| customerOrderId | `id("customerOrders")` **FK** |
| productId | `id("products")` **FK** |
| productName / sku | string (denormalized) |
| qty / unitPrice / lineTotal | number |
| createdAt | number |

Indexes: `by_organizationId_and_customerOrderId`, `by_customerOrderId`

#### refundCounters
| Field | Type |
|---|---|
| organizationId | string |
| lastId | number |

Index: `by_organizationId`

#### refunds
| Field | Type |
|---|---|
| organizationId | string |
| saleId | `id("sales")` **FK** |
| refundNo | string |
| processedByUserId | string |
| paymentMethod | `"cash"｜"card"｜"transfer"` |
| subtotal / tax / total | number |
| reason | string? |
| createdAt | number |
| businessDate / businessTimezone | string? |

Indexes: `by_organizationId`, `by_organizationId_and_saleId`, `by_organizationId_and_refundNo`, `by_organizationId_and_createdAt`, `by_organizationId_and_businessDate`

#### refundLineItems
| Field | Type |
|---|---|
| organizationId | string |
| refundId | `id("refunds")` **FK** |
| saleId | `id("sales")` **FK** |
| saleLineItemId | `id("saleLineItems")` **FK** |
| productId | `id("products")` **FK** |
| productName / sku | string (denormalized) |
| qty / unitPrice / lineTotal | number |
| createdAt | number |

Indexes: `by_organizationId`, `by_organizationId_and_refundId`, `by_organizationId_and_saleId`

</details>

### 6.6 Notable Schema Patterns

- **Multi-tenancy**: nearly every table is partitioned by `organizationId` (a plain string, not a Convex `v.id`), and Convex functions always filter by it first via `withIndex`.
- **Counter tables** (`skuCounters`, `receiptCounters`, `customerOrderCounters`, `refundCounters`): single-purpose atomic-increment tables that generate sequential human-readable identifiers (e.g. `RCP-00000001`) per organization.
- **Denormalization for historical accuracy**: `saleLineItems`, `customerOrderItems`, and `refundLineItems` all snapshot `productName`/`sku` at transaction time, so a later product rename/re-SKU never rewrites history. `products.imageStorageUrl` similarly denormalizes a resolved storage URL to avoid repeated lookups on read paths.
- **No `users` table**: identity is entirely external (Clerk); local tables only ever project role, preference, or device-token data onto a `clerkUserId`.

---

## 7. Class Diagram (Domain Model)

```mermaid
classDiagram
    class Organization {
        +string organizationId
        +string name
        +string status
        +string setupStatus
        +boolean customerOrderingEnabled
        +ensureOrganizationRegistry()
        +refreshOrganizationSetupStatus()
        +completeOnboarding()
    }

    class UserRole {
        +string organizationId
        +string clerkUserId
        +string appRole
        +string clerkRole
        +setUserRole()
        +removeOrganizationAccessEntry()
    }

    class AccessRole {
        +string roleId
        +string name
        +boolean isSystem
    }

    class AccessPermission {
        +string permissionId
        +string groupId
        +string name
        +string description
    }

    class RolePermission {
        +string roleId
        +string permissionId
        +upsertRolePermission()
    }

    class CompanySettings {
        +string companyName
        +string currency
        +number globalDiscountPercent
        +boolean customerOrderingEnabled
        +updateCompanySettings()
    }

    class Category {
        +string name
        +createCategory()
        +updateCategory()
        +removeCategory()
    }

    class Product {
        +string name
        +string sku
        +string barcode
        +number retailPrice
        +number wholesalePrice
        +number costPrice
        +number stock
        +number lowStockThreshold
        +string status
        +create()
        +update()
        +setStatus()
        +bulkCreate()
        +remove()
    }

    class Sale {
        +string receiptNo
        +string cashierUserId
        +string paymentMethod
        +number subtotal
        +number tax
        +number total
        +string status
        +string businessDate
        +finalizeSale()
        +listSalesHistory()
        +getSaleDetails()
    }

    class SaleLineItem {
        +number qty
        +number unitPrice
        +number lineTotal
        +number refundedQty
    }

    class Refund {
        +string refundNo
        +string processedByUserId
        +number total
        +string reason
        +refundSale()
    }

    class RefundLineItem {
        +number qty
        +number unitPrice
        +number lineTotal
    }

    class CustomerOrderMenu {
        +string slug
        +boolean enabled
        +ensureCustomerOrderMenu()
    }

    class CustomerOrder {
        +string orderNo
        +string status
        +string customerName
        +string customerPhone
        +number total
        +submitCustomerOrder()
        +markCustomerOrderPreparing()
        +markCustomerOrderReady()
        +confirmCustomerOrder()
        +cancelCustomerOrder()
    }

    class CustomerOrderItem {
        +number qty
        +number unitPrice
        +number lineTotal
    }

    class Notification {
        +string eventType
        +string title
        +string message
        +boolean isRead
        +markRead()
        +markAllRead()
    }

    class SalesAggregate {
        +number grossSales
        +number refundTotal
        +number completedOrders
        +bumpSalesAggregate()
    }

    Organization "1" --> "many" UserRole : has
    Organization "1" --> "many" AccessRole : defines
    Organization "1" --> "many" AccessPermission : defines
    Organization "1" --> "many" RolePermission : grants
    AccessRole "1" --> "many" RolePermission : assigned to
    AccessPermission "1" --> "many" RolePermission : granted by
    Organization "1" --> "1" CompanySettings : configured by
    Organization "1" --> "many" Category : owns
    Category "1" --> "many" Product : classifies
    Organization "1" --> "many" Sale : records
    Sale "1" --> "many" SaleLineItem : contains
    Product "1" --> "many" SaleLineItem : sold as
    Sale "1" --> "many" Refund : refunded by
    Refund "1" --> "many" RefundLineItem : contains
    SaleLineItem "1" --> "many" RefundLineItem : refunds
    Product "1" --> "many" RefundLineItem : restocks
    Organization "1" --> "many" CustomerOrderMenu : publishes
    CustomerOrderMenu "1" --> "many" CustomerOrder : receives
    CustomerOrder "1" --> "many" CustomerOrderItem : contains
    Product "1" --> "many" CustomerOrderItem : ordered as
    CustomerOrder "0..1" --> "1" Sale : becomes
    Organization "1" --> "many" Notification : receives
    Organization "1" --> "1" SalesAggregate : summarized by
```

---

## 8. State Chart Diagrams

Product state is modeled as **two orthogonal axes**: a lifecycle axis (`active`/`inactive`, an explicit field) and a stock-level axis (derived from `stock` and `lowStockThreshold`, not a stored field). They are shown as two separate state machines rather than one composite diagram, since a product can independently be inactive-with-stock or active-out-of-stock.

### 8.1 Product Lifecycle State

```mermaid
stateDiagram-v2
    [*] --> Active : create()
    Active --> Inactive : setStatus("inactive")
    Inactive --> Active : setStatus("active")
    Active --> [*] : remove() (no open customer orders)
    Inactive --> [*] : remove()

    note right of Active
        Sellable via POS, QR storefront,
        and appears in inventory listings.
    end note
    note right of Inactive
        Hidden from POS catalog and storefront;
        cannot be sold or ordered.
    end note
```

### 8.2 Product Stock-Level State

```mermaid
stateDiagram-v2
    [*] --> InStock : stock initialized

    InStock --> LowStock : sale decrements stock to\n<= effectiveLowStockThreshold
    LowStock --> OutOfStock : sale decrements stock to 0
    LowStock --> InStock : refund / restock / manual edit\nraises stock above threshold
    OutOfStock --> LowStock : refund / restock / manual edit\nraises stock (still <= threshold)
    OutOfStock --> InStock : refund / restock / manual edit\nraises stock above threshold
    InStock --> InStock : sale (stock stays above threshold)
    LowStock --> LowStock : sale (stock stays > 0 and <= threshold)

    note right of LowStock
        Crossing into this state fires a
        "stock_low" admin notification.
    end note
    note right of OutOfStock
        Crossing into this state fires a
        "stock_out" admin notification; the
        product is filtered out of the POS catalog.
    end note
```

*Threshold logic (`convex/stock_thresholds.ts`): `effectiveLowStockThreshold` = the product's own `lowStockThreshold` if set, else a default of 10. A "critical" sub-state (`stock <= max(1, ceil(threshold × 0.6))`) is additionally flagged on the dashboard within `LowStock`.*

### 8.3 Customer Order State

```mermaid
stateDiagram-v2
    [*] --> Pending : submitCustomerOrder() (customer)
    Pending --> Preparing : markCustomerOrderPreparing() (staff)
    Pending --> Ready : markCustomerOrderReady() (staff)
    Preparing --> Ready : markCustomerOrderReady() (staff)
    Pending --> Completed : confirmCustomerOrder() (staff)
    Preparing --> Completed : confirmCustomerOrder() (staff)
    Ready --> Completed : confirmCustomerOrder() (staff)
    Pending --> Cancelled : cancelCustomerOrder() (staff)
    Preparing --> Cancelled : cancelCustomerOrder() (staff)
    Ready --> Cancelled : cancelCustomerOrder() (staff)
    Completed --> [*]
    Cancelled --> [*]
```

### 8.4 Sale State

```mermaid
stateDiagram-v2
    [*] --> Completed : finalizeSale() / confirmCustomerOrder()
    Completed --> Completed : refundSale() (partial refund)
    Completed --> Refunded : refundSale() (fully refunded)
    Refunded --> [*]
    Completed --> [*]

    note right of Refunded
        A "voided" status literal exists in the
        schema but no mutation currently sets it —
        reserved for a future void-sale feature.
    end note
```

---

## 9. Sequence Diagrams

### 9.1 Completing a Sale (POS Checkout)

```mermaid
sequenceDiagram
    actor Cashier
    participant UI as POS Terminal UI<br/>(Web / Mobile)
    participant FS as Convex finalizeSale
    participant ACL as access.ts (RBAC)
    participant PROD as products table
    participant CTR as receiptCounters table
    participant SALE as sales table
    participant SLI as saleLineItems table
    participant AGG as salesAggregates table
    participant NOTIF as notifications table

    Cashier->>UI: Scan / select items, choose payment method
    UI->>UI: Build cart (productId, qty)
    Cashier->>UI: Tap "Finalize Sale"
    UI->>FS: finalizeSale(organizationId, paymentMethod, items, clientSaleId?)
    FS->>ACL: requirePermission("sales_create")
    ACL-->>FS: identity (authorized)

    alt clientSaleId already processed (offline retry)
        FS->>SALE: lookup by clientSaleId
        SALE-->>FS: existing sale
        FS-->>UI: return existing receipt (idempotent)
    else new sale
        loop for each distinct product in cart
            FS->>PROD: load product
            PROD-->>FS: product (status, stock, price)
            FS->>FS: validate active, sufficient stock
        end
        FS->>FS: compute subtotal, discount, tax, total
        FS->>CTR: increment lastId, format "RCP-00000001"
        CTR-->>FS: receiptNo
        FS->>SALE: insert sale (status="completed")
        FS->>AGG: bumpSalesAggregate(+total, +1 order)
        loop for each line item
            FS->>SLI: insert saleLineItems row
            FS->>PROD: patch stock = stock - qty
            alt stock crosses 0
                FS->>NOTIF: queue "stock_out" notification
            else stock crosses low-stock threshold
                FS->>NOTIF: queue "stock_low" notification
            end
        end
        FS->>NOTIF: insert "sale_completed" (if actor is cashier)
        FS->>NOTIF: flush queued stock notifications
        FS-->>UI: receipt payload (receiptNo, items, totals)
    end

    UI-->>Cashier: Show receipt, print / download
```

### 9.2 QR Customer Order — Placement & Confirmation

```mermaid
sequenceDiagram
    actor Customer
    participant Store as Public Storefront<br/>/order/[storeSlug]
    participant SO as Convex submitCustomerOrder
    participant CO as customerOrders table
    participant COI as customerOrderItems table
    actor Staff as Cashier / Manager / Admin
    participant POS as POS Terminal UI
    participant CC as Convex confirmCustomerOrder
    participant FS as createCompletedSaleFromItems

    Customer->>Store: Browse menu, add items, enter name & phone
    Customer->>Store: Submit order
    Store->>SO: submitCustomerOrder(menuSlug, items, customer info)
    SO->>SO: validate menu enabled, cart size, product active & stock available
    SO->>CO: insert order (status="pending")
    SO->>COI: insert order items
    SO-->>Store: orderNo
    Store-->>Customer: Order confirmation + tracking link

    Staff->>POS: View pending QR orders
    POS->>CC: markCustomerOrderPreparing(orderId)
    CC->>CO: patch status="preparing"
    POS->>CC: markCustomerOrderReady(orderId)
    CC->>CO: patch status="ready"

    Staff->>POS: Confirm order (collect payment)
    POS->>CC: confirmCustomerOrder(orderId, paymentMethod)
    CC->>CO: verify status is active, load items
    CC->>FS: createCompletedSaleFromItems(snapshotted totals)
    FS->>FS: re-validate stock, decrement, write sale + line items
    FS-->>CC: receipt
    CC->>CO: patch status="completed", completedSaleId, completedAt
    CC-->>POS: receipt
    POS-->>Staff: Show receipt
```

### 9.3 Refund Processing

```mermaid
sequenceDiagram
    actor Staff as Manager / Administrator
    participant UI as Sale Detail UI
    participant RF as Convex refundSale
    participant ACL as access.ts (RBAC)
    participant SALE as sales table
    participant SLI as saleLineItems table
    participant CTR as refundCounters table
    participant REF as refunds table
    participant RLI as refundLineItems table
    participant PROD as products table
    participant AGG as salesAggregates table
    participant NOTIF as notifications table

    Staff->>UI: Select sale, choose lines/quantities to refund
    UI->>RF: refundSale(saleId, items?)
    RF->>ACL: requirePermission("sales_refund")
    ACL-->>RF: identity (authorized)
    RF->>SALE: load sale, verify status not already refunded/voided
    RF->>SLI: load line items, compute refundable quantities
    RF->>CTR: increment lastId, format "RFD-00000001"
    CTR-->>RF: refundNo
    RF->>RF: compute refundSubtotal, refundTax (if fully refunded), refundTotal
    RF->>REF: insert refund record
    RF->>AGG: bumpSalesAggregate(refundDelta = refundTotal)
    loop for each refunded line
        RF->>PROD: patch stock = stock + qty (restock)
        RF->>SLI: patch refundedQty += qty
        RF->>RLI: insert refund line item (audit)
    end
    RF->>SALE: patch status = fullyRefunded ? "refunded" : "completed",<br/>refundedTotal, refundedAt
    RF->>NOTIF: insert "sale_refunded" notification
    RF-->>UI: refund confirmation
    UI-->>Staff: Show refund receipt
```

---

## 10. Communication Diagram — Sale Processing

> Mermaid has no native UML communication/collaboration diagram type. This is drawn as a flowchart with **numbered messages** on each edge — the standard workaround — representing the same interaction as §9.1 from an object-collaboration viewpoint rather than a time-ordered lifeline viewpoint.

```mermaid
flowchart TB
    Cashier[": Cashier"]
    UI[": POS Terminal UI"]
    FS[": finalizeSale Mutation"]
    ACL[": Access Control"]
    PROD[": Products Table"]
    SALE[": Sales Table"]
    SLI[": SaleLineItems Table"]
    CTR[": ReceiptCounters Table"]
    AGG[": SalesAggregates Table"]
    NOTIF[": Notifications Table"]

    Cashier -- "1: finalizeSale(cart, paymentMethod)" --> UI
    UI -- "2: finalizeSale(args)" --> FS
    FS -- "3: requirePermission(sales_create)" --> ACL
    ACL -- "4: identity" --> FS
    FS -- "5: loop validate(product)" --> PROD
    PROD -- "6: product{status, stock}" --> FS
    FS -- "7: nextReceiptNo()" --> CTR
    CTR -- "8: receiptNo" --> FS
    FS -- "9: insert(sale)" --> SALE
    FS -- "10: bumpAggregate(+total, +1)" --> AGG
    FS -- "11: loop insert(lineItem)" --> SLI
    FS -- "12: loop patch(stock -= qty)" --> PROD
    FS -- "13: alt insert(stock_low / stock_out)" --> NOTIF
    FS -- "14: insert(sale_completed)" --> NOTIF
    FS -- "15: receipt" --> UI
    UI -- "16: display receipt" --> Cashier
```

---

## 11. Activity Diagram — Sale & Inventory Update Flow

```mermaid
flowchart TD
    Start(["Start: Cashier taps Finalize Sale"]) --> A1["Check permission: sales_create"]
    A1 --> D1{"Authorized?"}
    D1 -- "No" --> E1(["Reject: Forbidden"])
    D1 -- "Yes" --> A2["Merge duplicate cart lines by product"]
    A2 --> A3["For each distinct product: load product record"]
    A3 --> D2{"Product active<br/>and belongs to org?"}
    D2 -- "No" --> E2(["Reject: invalid / inactive product"])
    D2 -- "Yes" --> D3{"Stock >= requested qty?"}
    D3 -- "No" --> E3(["Reject: insufficient stock"])
    D3 -- "Yes" --> A4["Compute unit price with global discount"]
    A4 --> A5{"More products to validate?"}
    A5 -- "Yes" --> A3
    A5 -- "No" --> A6["Compute subtotal, tax, total"]
    A6 --> A7["Generate sequential receipt number"]
    A7 --> A8["Insert sale record (status=completed)"]
    A8 --> A9["Increment lifetime salesAggregates"]
    A9 --> A10["For each line item: insert saleLineItems"]
    A10 --> A11["Decrement product.stock by qty"]
    A11 --> D4{"Stock reached 0?"}
    D4 -- "Yes" --> A12["Queue stock_out notification"]
    D4 -- "No" --> D5{"Stock crossed<br/>low-stock threshold?"}
    D5 -- "Yes" --> A13["Queue stock_low notification"]
    D5 -- "No" --> A14["Continue"]
    A12 --> A15{"More line items?"}
    A13 --> A15
    A14 --> A15
    A15 -- "Yes" --> A10
    A15 -- "No" --> A16["Insert sale_completed notification<br/>(if actor is cashier)"]
    A16 --> A17["Flush queued stock notifications"]
    A17 --> A18["Return receipt to POS UI"]
    A18 --> End(["End: Receipt displayed / printed"])
```

*The mirror-image flow for a refund reverses step A11 (`stock += qty` instead of `stock -= qty`) and never re-fires `stock_low`/`stock_out` notifications on restock — see §9.3.*

---

## 12. Access Control (RBAC) Model

### 12.1 Roles & Permission Matrix

Three fixed application roles exist as literals (`"administrator" | "manager" | "cashier"`), but **authorization never checks the role name directly** — every check resolves the caller's role, then looks up whether that role currently grants the requested permission in the `rolePermissions` table. This means the table below is the **default seed**, not a hardcoded rule; an administrator can customize any role's permissions per organization via `upsertRolePermission`.

| Permission ID | Description | Administrator | Manager | Cashier |
|---|:---|:---:|:---:|:---:|
| `sales_view` | View sales transactions | ✅ | ✅ | ✅ |
| `sales_create` | Process new sales | ✅ | ✅ | ✅ |
| `sales_refund` | Refund / restock completed sales | ✅ | ✅ | ❌ |
| `inventory_view` | View catalog / stock balances | ✅ | ✅ | ✅ |
| `inventory_manage` | Add / edit products | ✅ | ✅ | ❌ |
| `inventory_adjust` | Submit stock adjustments | ✅ | ✅ | ❌ |
| `employees_view` | View employee directory | ✅ | ✅ | ❌ |
| `employees_manage` | Add / update employees | ✅ | ✅ | ❌ |
| `reports_view` | View analytics / reports | ✅ | ✅ | ❌ |
| `reports_export` | Export CSV / PDF | ✅ | ✅ | ❌ |
| `settings_company` | Edit company profile | ✅ | ✅ | ❌ |
| `settings_users` | Manage users & role-permission templates | ✅ | ❌ | ❌ |

### 12.2 Authorization Enforcement Pattern

There is **no decorator or middleware layer** — every Convex query/mutation calls an explicit check as the **first statement** of its handler:

```ts
handler: async (ctx, args) => {
  const identity = await requirePermission(ctx, args.organizationId, "sales_create", {
    allowBootstrap: true,
  });
  // ...rest of handler
}
```

**Membership** = the caller's active Clerk-org JWT claim matches the target `organizationId`, **or** a `userRoles` row exists for that `(organizationId, clerkUserId)` pair.

**Permission** = the caller's `userRoles.appRole` has a matching grant row in `rolePermissions` for `(organizationId, roleId, permissionId)`.

**Bootstrap escape hatch**: a Clerk org admin/owner acting on their **own** organization is let through *only while that organization has zero `userRoles` rows* (i.e. a brand-new org, before any app-level role has ever been assigned). The instant any `userRoles` row exists for the org, this path closes permanently — Convex's own RBAC tables become the sole source of truth, so even a demoted Clerk admin loses access if their app role is revoked. Clerk's org role is deliberately **not** trusted as an ongoing authorization signal, only as a one-time setup convenience.

---

## 13. Appendix A — Convex Backend Module Reference

| Module | Responsibility |
|---|---|
| `schema.ts` | Full database schema definition (24 tables) |
| `access.ts` | Core RBAC primitives — membership/permission checks, bootstrap logic |
| `rbac.ts` | Role/permission/invite management API (`setUserRole`, `upsertRolePermission`, `seedOrganizationAccess`, …) |
| `auth.config.ts` | Registers Clerk as Convex's JWT auth provider |
| `organizations.ts` | Org registry lifecycle, onboarding status |
| `products.ts` | Product/category catalog CRUD, bulk import |
| `sales.ts` | POS transaction engine + public customer-ordering storefront (`finalizeSale`, `confirmCustomerOrder`, `refundSale`, `submitCustomerOrder`, …) |
| `reporting.ts` | Shared reporting math/helpers (not user-facing endpoints) |
| `reports_sales.ts` / `reports_inventory.ts` | Sales and inventory report queries |
| `analytics.ts` | Dashboard analytics (stock velocity, inventory risk/health) |
| `dashboard.ts` | Dashboard snapshot, weekly pulse, alerts, `salesAggregates` reconciliation |
| `global_search.ts` | Cross-entity command-palette search |
| `notifications.ts` / `notification_helpers.ts` | In-app notification feed and admin-recipient helpers |
| `push_notifications.ts` | Native push token lifecycle and delivery via Expo/FCM |
| `settings.ts` | Company and personal settings |
| `stock_thresholds.ts` | Low-stock / critical-stock threshold math |
| `business_date.ts` | Timezone-aware "business day" bucketing |
| `crons.ts` | Scheduled jobs (daily notification purge) |
| `migrations.ts` | One-off data migrations |
| `posthog.ts` / `convex.config.ts` | Server-side PostHog error reporting and component registration |

---

## 14. Appendix B — Glossary

| Term | Definition |
|---|---|
| **Convex** | A backend-as-a-service providing a reactive document database and serverless TypeScript functions; the sole backend for both MansaStock clients. |
| **Clerk** | The third-party identity provider handling authentication and multi-tenant Organizations. |
| **Organization (tenant)** | A single MansaStock business/store; the primary partition key (`organizationId`) across nearly every database table. |
| **TWA (Trusted Web Activity)** | An Android technology that lets a web app be installed and distributed through Google Play with no browser UI; used here to wrap the web POS. |
| **RBAC** | Role-Based Access Control — MansaStock's authorization model, driven by data (`rolePermissions`) rather than hardcoded role checks. |
| **OCC (Optimistic Concurrency Control)** | Convex's default transaction isolation model; conflicting concurrent writes are retried rather than locked. |
| **SKU** | Stock-Keeping Unit — the internal product code; distinct from `barcode`, the physical scan code. |
| **POS** | Point of Sale — the checkout terminal used by staff to process sales. |
| **ERD** | Entity-Relationship Diagram. |
| **DFD** | Data Flow Diagram. |
| **Business date** | A timezone-aware "trading day" bucket used for daily reporting, so a store's "today" aligns with its local close-of-day rather than UTC midnight. |
