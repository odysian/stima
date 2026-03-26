# TradeFlow (Working Title) — Full Product Specification

**Version:** 3.0 — March 2026
**Status:** Historical — superseded. Do not use as active guidance.
**Author:** Chris

> This is the original pre-development brainstorm, written before the vertical slice
> decision was made and before anything was built. It captures the full early product
> vision and informed the direction of V0. The active product strategy is in
> `docs/PRODUCT.md`. The V0 spec that this evolved into is in
> `docs/Stima_V0_Vertical_Slice_Spec.md`.

---

## 1. Product Overview

### What Is TradeFlow?

TradeFlow is an AI-powered business organizer for solo tradespeople and small field service crews. It combines customer management, voice-powered quote and invoice generation, job photo documentation, receipt tracking, and end-of-year financial export into a single, dead-simple mobile app priced at $5/month.

The core insight: solo operators and small crews currently manage their business across a chaotic mix of text messages, camera roll photos, handwritten notes, and memory. TradeFlow replaces all of that with one organized app where the AI handles data entry so they don't have to type.

### What Makes It Different?

**vs. Joist, Invoice Simple, WorkQuote (simple invoicing apps):**
These are digital form-fillers. You manually type every line item, every time. TradeFlow lets you talk — describe the job in your own words and the AI structures it into professional line items. Same result, 10x faster input.

**vs. QuoteIQ, Jobber, ServiceM8 (full platforms):**
These are powerful but complex systems with dozens of features, steep learning curves, and prices from $30-$400/month. TradeFlow does less on purpose. It's the tool for the person who doesn't want to learn a platform — they just want to send a quote, take some photos, and get paid.

**vs. Free apps (Wave, generic invoice generators):**
Free apps are either ad-supported, severely limited, or designed for general business use. TradeFlow is purpose-built for trades with AI that understands industry shorthand like "five yards of brown" or "trim the boxes."

### Target Audience

- Solo owner-operators in landscaping, handyman services, pressure washing, painting, cleaning, and similar trades
- Small crews (1-5 people) where the owner does the quoting and billing
- Older tradespeople who are competent with a phone but won't learn complex software
- Anyone currently quoting via text message, paper, or memory

### Pricing Model

| Tier | Price | Includes |
|------|-------|----------|
| Free | $0/month | 3 quotes + 3 invoices per month, email delivery only, TradeFlow watermark on PDFs, 30-day job history |
| Pro | $5/month | Unlimited quotes & invoices, text + email delivery, your logo on PDFs, full job history, receipt generation, CSV export, photo gallery |

**Why $5/month:** At this price point, the app is an impulse buy for someone billing $500-$5,000+ per month in jobs. It's cheaper than every meaningful competitor while offering AI capabilities none of them have at any price. The margins are excellent because AI API costs per user are ~$0.25/month.

---

## 2. Authentication & Onboarding

### Screen 0a: Welcome / Landing

**Layout:**
- App name/logo centered in upper third
- Tagline: "Quote jobs. Send invoices. Get organized." (or similar)
- Two buttons stacked at bottom:
  - "Create Account" (primary, large)
  - "Sign In" (secondary/outline)

### Screen 0b: Register

**Fields:**
- Email
- Password
- Confirm password
- "Create Account" button at bottom
- "Already have an account? Sign In" text link

### Screen 0c: Sign In

**Fields:**
- Email
- Password
- "Sign In" button at bottom
- "Don't have an account? Create one" text link

### Screen 1: Onboarding (First Launch Only — After Registration)

**Goal:** Under 2 minutes. Business profile setup.

**Fields:**
- Business name (required)
- Owner name (required)
- Phone number (required)
- Email (pre-filled from registration)
- Logo upload (optional — prominent "Skip" button)
- Trade type dropdown: Landscaping, Handyman, Pressure Washing, Painting, Cleaning, Electrical, Plumbing, General Contractor, Other

**After completion:** User lands directly on the Customer List (home screen).

**Design notes:**
- Large input fields, mobile keyboard optimized
- Single-column layout, no scrolling needed
- "Get Started" button anchored to bottom of screen
- Trade type selection seeds the AI prompt with relevant industry vocabulary

### Auth Flow Summary

| Scenario | Flow |
|----------|------|
| First time ever | Welcome → Register → Onboarding → Customer List |
| Returning user (signed out) | Welcome → Sign In → Customer List |
| Every other time | Straight to Customer List (refresh token) |

---

## 3. Core User Flow

### Screen 2: Customer List (Home Screen)

**Goal:** The hub. Every app open starts here.

**Layout:**
- Search bar at top
- Scrollable list of customers sorted by most recent activity
- Each customer row shows:
  - Customer name (bold)
  - Address (truncated, single line)
  - Last job date and amount
  - Status indicator dot (pending = yellow, accepted = green, paid = blue, declined = red)
- **Floating "+" button anchored to bottom-right** (thumb-reachable, one-handed use)

**Empty state (zero customers):**
- Centered message: "Add your first customer to get started"
- Arrow pointing to the + button

**Navigation:**
- Bottom nav bar with three items: **Customers** (home) | **Jobs** (history) | **Settings**

---

### Screen 3: New Customer Form

**Goal:** Minimum info. Get out fast.

**Fields:**
- Customer name (required)
- Address (required — enables Google Maps link)
- Phone number (required — enables text delivery)
- Email (optional)

**Design notes:**
- All action buttons at bottom of screen
- "Save" button creates customer → navigates directly to Customer Detail Page
- Large tap targets, mobile-optimized

---

### Screen 4: Customer Detail Page

**Goal:** Everything about one customer in one place.

**Header section (~25% of screen):**
- Customer name (large, bold)
- Address with map pin icon (tappable → Google Maps directions)
- Phone with phone icon (tappable → dialer)
- Email with envelope icon (tappable → mail client) — if provided
- Pencil/edit icon in top right corner

**Content area with three tabs:**

**Tab 1: Jobs (default)**
- List of all quotes, invoices, and receipts for this customer, newest first
- Each row shows:
  - Document type icon (quote / invoice / receipt)
  - Job date
  - Description summary (first line item or "3 items")
  - Amount
  - Status badge (draft / pending / accepted / invoiced / paid / declined)
- Tap any row → opens document detail view

**Tab 2: Gallery**
- Adaptive layout based on photo count:
  - 1-3 photos: Large thumbnails with notes visible underneath
  - 4-8 photos: 2x2 grid with small note icon on photos that have notes
  - 9+ photos: 3x3 grid with note indicators
- Photos without notes display without indicator
- Tap any photo → full-size view with complete notes
- Photos from quote/invoice creation automatically appear here

**Tab 3: Notes (persistent customer notes)**
- Freeform text field that persists across all jobs
- For things like: "Gate code 4521. Dog in backyard is friendly. Mrs. Johnson is particular about the boxwoods."
- Always visible when working on this customer

**Three action buttons anchored at bottom of screen:**
- **New Quote** (microphone icon + document) — initiates quote capture
- **New Invoice** (dollar icon + document) — initiates invoice creation
- **Photos** (camera icon) — initiates gallery capture

---

## 4. Quote Creation Flow

### Three Paths to a Quote

All three paths produce the same output: a job record with line items, a total, and a generated PDF.

| Path | Input | Best For |
|------|-------|----------|
| Voice (primary) | Toggle-record audio clips | On-site, hands-free, fastest path |
| Freeform Notes | Type rough text → "Convert to Line Items" | Noisy environments, interruptions, save for later |
| Manual Form | Type line items directly | Simple jobs, exact figures already known |

---

### Screen 5a: Quote Capture

**Goal:** Describe the job with your voice. Optional photos for documentation.

**Layout — upper area:**
- Large microphone visualization (animates when recording)
- Timer showing recording duration when active
- List of recorded clips displayed as pills: "Clip 1 (0:23)" with play button and X to delete each
- "Start Over" text link to clear all clips

**Layout — lower area (bottom of screen, thumb-reachable):**
- **Record button** (large microphone icon, center) — tap to start recording, tap again to stop (toggle)
- **Photo button** (camera icon, right side) — tap to snap optional site photos
  - Multiple photos allowed; each appears as a small thumbnail in a row
  - Photos attach to the job record and auto-appear in customer gallery
  - Photos are NOT sent to AI for quote extraction
- **"Prefer to type?"** text link (subtle, below main buttons) — navigates to Manual Entry screen

**After at least one voice clip is recorded:**
- "Generate Quote" button appears prominently
- Tap → loading indicator (1-3 seconds) → navigates to Quote Review screen

---

### Screen 5a-alt: Manual Quote Entry

**Goal:** Type it out when voice isn't practical. Also serves as the "quick save for later" path.

**Layout:**
- **Freeform notes box** at top with placeholder: "Jot down rough notes..."
  - User types: "5yd brown mulch, trim 10 shrubs, haul brush, ~4hrs, around 650"
  - **"Convert to Line Items"** button below the text box → sends notes to AI → populates structured fields below

- **Structured line items section** below:
  - Starts with one blank row (Description | Details | Price)
  - "+" Add Line Item button
  - Each row has an X to delete
  - User can fill these in directly without using the text box

**Three ways to proceed:**
1. Type rough notes → Convert → AI populates Review screen
2. Fill in line items directly → "Review Quote" button → Review screen
3. Any combination → Save Draft available at any point

---

### Screen 6: Quote Review / Edit

**Goal:** Confirm accuracy, adjust, send. All three paths land here.

**Layout:**
- Photo thumbnails at top (scrollable row) if any were taken, otherwise omitted
- **Job date field** (defaults to today, editable date picker)
- **Editable list of extracted line items:**
  - Description (text field, full width)
  - Details / quantity (text field)
  - Price (number field, right-aligned, $ prefix)
- Each line item has delete button (swipe or tap X)
- "+" Add Line Item button below the list
- **Running total** at bottom that auto-updates on any edit
- If no price was stated → price fields are blank, awaiting manual input
- If no total was stated → prompt: "What's the total for this job?" with number input

**Bottom action buttons:**
- **"Send Quote"** (primary, large, prominent)
- **"Save Draft"** (secondary, smaller)

---

### Screen 7: Send Document

**Goal:** Preview and deliver. Used for both quotes AND invoices.

**Layout:**
- Scrollable **PDF preview** (the actual document the customer receives)
- **Delivery method** toggle: Text | Email | Both
  - Pre-filled with customer's phone/email
- **Optional message field:** placeholder "Thanks for having us out!"
- **"Send" button** anchored to bottom

**After send:**
- Confirmation toast: "Quote sent!" (or "Invoice sent!")
- Returns to Customer Detail page
- Document appears in Jobs tab with "Pending" status

**PDF includes:**
- Business name and logo (from onboarding)
- Business phone and email
- Document type header: "QUOTE" or "INVOICE"
- Unique document number (auto-generated: Q-001, INV-001, etc.)
- Customer name and address
- Job date
- Itemized line items with prices
- Subtotal, tax (if configured), total
- Optional note/message
- Payment terms (for invoices: "Due upon receipt" or configurable)
- "Thank you for your business" footer

---

## 5. Invoice Flow

### Quote → Invoice Conversion (One Tap)

When a quote's status is changed to "Accepted," a prominent **"Create Invoice"** button appears on the quote detail screen. Tapping it:

1. Copies all line items, prices, and totals from the quote
2. Creates a new invoice record linked to the original quote
3. Opens the Invoice Review screen (same as Screen 6 but labeled "Invoice")
4. User can adjust anything (add materials used, update hours) before sending
5. Invoice gets its own document number (INV-001, etc.)
6. Sends through the same delivery screen (Screen 7)

### Standalone Invoice (Without a Quote First)

From the Customer Detail page, tapping **"New Invoice"** opens the same three-path flow as quoting (voice, notes, manual) but generates an invoice directly instead of a quote. The only difference is the PDF header says "INVOICE" instead of "QUOTE" and includes payment terms.

### Invoice Statuses

| Status | Meaning |
|--------|---------|
| Draft | Saved but not sent |
| Sent | Delivered to customer |
| Viewed | Customer opened the email/text (if trackable) |
| Paid | Manually marked as paid by the user |
| Overdue | Past due date (visual indicator only, no automation in MVP) |

---

## 6. Receipt Generation

### Screen 7c: Receipt

When an invoice is marked as **"Paid"**, a **"Generate Receipt"** button appears.

Tapping it creates a receipt PDF that includes:
- "RECEIPT" header
- Receipt number (R-001, etc.)
- Original invoice reference number
- Business info and customer info
- Line items and total (copied from invoice)
- "PAID" stamp with payment date
- Payment method (cash / check / card / other — user selects)

The receipt can be sent to the customer via text/email (same delivery screen) or just saved for the tradesperson's own records.

---

## 7. Export Feature

### Screen 9 (Settings) → Export Section

**"Export Job Data"** button in Settings.

**Options:**
- Date range selector (this month, this quarter, this year, custom range)
- What to include: All jobs / Quotes only / Invoices only / Paid only
- Format: CSV

**CSV includes columns:**
- Date, Customer Name, Customer Address, Document Type (Quote/Invoice/Receipt), Document Number, Description (concatenated line items), Total Amount, Status, Payment Method, Payment Date

**Purpose:** Hand this to your accountant at tax time. Every solo operator struggles to reconstruct their year from bank statements and memory. This one export replaces that nightmare.

---

## 8. Photo Gallery

### Screen 5b: Gallery Capture

**Goal:** Document the job site. Two modes — quick snap and photo + voice note.

**Layout:**
- Full-screen camera viewfinder (top ~70%)
- Photo counter in top right: "3 photos"
- Bottom buttons:
  - **Snap Photo** (large, center) — single tap, instant capture, no delay
  - **Record Note** (microphone icon, right side) — toggle on/off for voice note on last photo
  - **Done** (top left) — exit back to Customer Detail page

**Quick Snap flow (default):**
1. Tap Snap → photo captured instantly
2. Brief save indicator
3. Photo saved to customer gallery, no note
4. Camera stays active for next shot (rapid-fire)

**Photo + Voice Note flow:**
1. Tap Snap → photo captured
2. Tap Record Note → recording starts (toggle on)
3. Speak: "Customer wants these four arborvitae trimmed to six feet, leave the one on the left alone"
4. Tap Record Note → recording stops (toggle off)
5. AI processing (1-2 seconds) → generates clean text note
6. Photo + note preview (note is editable)
7. Save → added to gallery with note attached
8. Camera stays active

**Design notes:**
- After saving, camera stays active — no navigation needed for next photo
- Quick snaps can have notes added manually later from the gallery view
- Voice note always attaches to the most recently taken photo

---

## 9. Job History (Global View)

### Screen 8: Job History

**Accessible from:** Bottom nav bar → "Jobs" tab

**Layout — stats bar at top:**
- Three summary boxes in a row:
  - **Quoted** (this month total)
  - **Invoiced** (this month total)
  - **Collected** (this month total — sum of paid invoices)

**Filter controls:**
- Date range: This Week / This Month / This Quarter / This Year / Custom
- Status filter: All | Pending | Accepted | Invoiced | Paid | Declined
- Document type: All | Quotes | Invoices | Receipts

**Scrollable list below filters:**
- Each row: Customer name, date, document type icon, description summary, amount, status badge
- Tap any row → opens document detail view

---

## 10. Document Detail View

### Screen 7b: Document Detail

**Accessible from:** Tapping any job in customer Jobs tab or global Job History.

**Layout:**
- PDF preview of the document (scrollable)
- **Status badge** — tappable to change (e.g., pending → accepted → invoiced → paid)
- Document number, date, customer, total
- **Action buttons (contextual based on document type):**

| Document | Available Actions |
|----------|------------------|
| Quote (draft) | Edit, Send |
| Quote (pending) | Edit & Resend, Mark Accepted, Mark Declined |
| Quote (accepted) | Create Invoice |
| Invoice (sent) | Edit & Resend, Mark Paid |
| Invoice (paid) | Generate Receipt |
| Receipt | Resend |

- Photo thumbnails if any were attached
- Link to original quote (if invoice was converted from a quote)

---

## 11. Settings

### Screen 9: Settings

**Accessible from:** Bottom nav bar → gear icon

**Sections:**

**Business Profile:**
- Business name, owner name, phone, email, logo — all editable
- Trade type

**Document Defaults:**
- Default tax rate (0% by default, configurable — e.g., 7.5%)
- Default payment terms for invoices ("Due upon receipt" / "Net 15" / "Net 30")
- Default delivery method (Text / Email / Both)

**Export:**
- Export Job Data button (see Section 7)

**Account:**
- Subscription status (Free / Pro)
- Upgrade button (if on free tier)
- Sign out

---

## 12. Deliberately Excluded from MVP

- Payment processing (Stripe, Square integration) — user marks invoices as paid manually
- Scheduling or calendar integration
- Crew management / multi-user accounts
- Customer-facing portal or login
- Advanced analytics or reporting beyond summary stats
- PDF template customization beyond logo
- Recurring job scheduling
- Material/pricing database or cost estimation
- Integration with accounting software (QuickBooks, Xero)
- Automated payment reminders
- Route optimization
- Time tracking

---

## 13. Database Schema

### Table: `users`

```
users
├── id              UUID, PRIMARY KEY, DEFAULT gen_random_uuid()
├── email           VARCHAR(255), UNIQUE, NOT NULL
├── password_hash   VARCHAR(255), NOT NULL
├── business_name   VARCHAR(255), NOT NULL
├── owner_name      VARCHAR(255), NOT NULL
├── phone           VARCHAR(20), NOT NULL
├── trade_type      VARCHAR(50), NULL
├── logo_url        VARCHAR(500), NULL
├── default_tax_rate DECIMAL(5,2), DEFAULT 0.00
├── default_payment_terms VARCHAR(20), DEFAULT 'due_on_receipt'
├── default_delivery VARCHAR(10), DEFAULT 'email'
├── subscription    VARCHAR(10), DEFAULT 'free', CHECK (subscription IN ('free', 'pro'))
├── created_at      TIMESTAMPTZ, DEFAULT NOW()
└── updated_at      TIMESTAMPTZ, DEFAULT NOW()
```

**Notes:**
- One user = one business for MVP.
- `trade_type` seeds the AI prompt with relevant vocabulary.
- `default_tax_rate` applied to all new documents; editable per document.
- `default_payment_terms` options: 'due_on_receipt', 'net_15', 'net_30'.

---

### Table: `customers`

```
customers
├── id              UUID, PRIMARY KEY, DEFAULT gen_random_uuid()
├── user_id         UUID, NOT NULL, FK → users.id, ON DELETE CASCADE
├── name            VARCHAR(255), NOT NULL
├── address         VARCHAR(500), NOT NULL
├── phone           VARCHAR(20), NOT NULL
├── email           VARCHAR(255), NULL
├── notes           TEXT, NULL
├── created_at      TIMESTAMPTZ, DEFAULT NOW()
└── updated_at      TIMESTAMPTZ, DEFAULT NOW()

INDEX: idx_customers_user_id ON customers(user_id)
```

**Notes:**
- `notes` is the persistent customer notes field (gate codes, preferences, etc.).
- Address stored as plain text. Google Maps link constructed client-side.

---

### Table: `documents`

Unified table for quotes, invoices, and receipts. All share the same structure.

```
documents
├── id              UUID, PRIMARY KEY, DEFAULT gen_random_uuid()
├── user_id         UUID, NOT NULL, FK → users.id, ON DELETE CASCADE
├── customer_id     UUID, NOT NULL, FK → customers.id, ON DELETE CASCADE
├── doc_type        VARCHAR(10), NOT NULL, CHECK (doc_type IN ('quote', 'invoice', 'receipt'))
├── doc_number      VARCHAR(20), NOT NULL
├── status          VARCHAR(20), NOT NULL, DEFAULT 'draft'
│                   CHECK (status IN ('draft', 'pending', 'accepted', 'declined',
│                                     'sent', 'viewed', 'paid', 'overdue'))
├── parent_id       UUID, NULL, FK → documents.id, ON DELETE SET NULL
├── job_date        DATE, NOT NULL
├── subtotal        DECIMAL(10,2), NOT NULL
├── tax_rate        DECIMAL(5,2), DEFAULT 0.00
├── tax_amount      DECIMAL(10,2), DEFAULT 0.00
├── total_amount    DECIMAL(10,2), NOT NULL
├── notes           TEXT, NULL
├── payment_terms   VARCHAR(20), NULL
├── payment_method  VARCHAR(20), NULL
├── payment_date    DATE, NULL
├── pdf_url         VARCHAR(500), NULL
├── delivery_method VARCHAR(10), NULL, CHECK (delivery_method IN ('text', 'email', 'both'))
├── delivered_at    TIMESTAMPTZ, NULL
├── message         TEXT, NULL
├── created_at      TIMESTAMPTZ, DEFAULT NOW()
└── updated_at      TIMESTAMPTZ, DEFAULT NOW()

INDEX: idx_documents_user_id ON documents(user_id)
INDEX: idx_documents_customer_id ON documents(customer_id)
INDEX: idx_documents_doc_type ON documents(doc_type)
INDEX: idx_documents_status ON documents(status)
INDEX: idx_documents_job_date ON documents(job_date)
INDEX: idx_documents_parent_id ON documents(parent_id)
UNIQUE: idx_documents_doc_number ON documents(user_id, doc_number)
```

**Notes:**
- `doc_type` distinguishes quote vs. invoice vs. receipt.
- `doc_number` is auto-generated per user: Q-001, Q-002, INV-001, R-001, etc.
- `parent_id` links an invoice to its source quote, or a receipt to its source invoice. NULL for standalone documents.
- `status` values are contextual per doc_type (not all statuses apply to all types).
- `payment_method` set when marking an invoice as paid: 'cash', 'check', 'card', 'venmo', 'zelle', 'other'.
- `payment_date` set when marking as paid.
- `message` is the optional note sent with the document ("Thanks for having us out!").
- `notes` stores freeform rough notes from manual entry path (before conversion).
- Tax is calculated: `tax_amount = subtotal * (tax_rate / 100)`, `total_amount = subtotal + tax_amount`.

---

### Table: `line_items`

```
line_items
├── id              UUID, PRIMARY KEY, DEFAULT gen_random_uuid()
├── document_id     UUID, NOT NULL, FK → documents.id, ON DELETE CASCADE
├── description     VARCHAR(500), NOT NULL
├── details         VARCHAR(255), NULL
├── price           DECIMAL(10,2), NOT NULL
├── sort_order      INTEGER, NOT NULL, DEFAULT 0
├── created_at      TIMESTAMPTZ, DEFAULT NOW()
└── updated_at      TIMESTAMPTZ, DEFAULT NOW()

INDEX: idx_line_items_document_id ON line_items(document_id)
```

**Notes:**
- `description` = "Brown mulch", `details` = "5 yards", `price` = 275.00
- `sort_order` preserves display order.
- Line items cascade delete with parent document.

---

### Table: `document_photos`

Photos attached to quotes/invoices.

```
document_photos
├── id              UUID, PRIMARY KEY, DEFAULT gen_random_uuid()
├── document_id     UUID, NOT NULL, FK → documents.id, ON DELETE CASCADE
├── photo_url       VARCHAR(500), NOT NULL
├── sort_order      INTEGER, NOT NULL, DEFAULT 0
├── created_at      TIMESTAMPTZ, DEFAULT NOW()

INDEX: idx_doc_photos_document_id ON document_photos(document_id)
```

**Notes:**
- Multiple photos per document.
- When a document is created with photos, corresponding `gallery_photos` records are also created so they appear in the customer's gallery tab.

---

### Table: `gallery_photos`

Customer photo gallery (from gallery capture and from document creation).

```
gallery_photos
├── id              UUID, PRIMARY KEY, DEFAULT gen_random_uuid()
├── user_id         UUID, NOT NULL, FK → users.id, ON DELETE CASCADE
├── customer_id     UUID, NOT NULL, FK → customers.id, ON DELETE CASCADE
├── document_id     UUID, NULL, FK → documents.id, ON DELETE SET NULL
├── photo_url       VARCHAR(500), NOT NULL
├── ai_notes        TEXT, NULL
├── manual_notes    TEXT, NULL
├── is_quick_snap   BOOLEAN, NOT NULL, DEFAULT FALSE
├── captured_at     TIMESTAMPTZ, NOT NULL, DEFAULT NOW()
├── created_at      TIMESTAMPTZ, DEFAULT NOW()
└── updated_at      TIMESTAMPTZ, DEFAULT NOW()

INDEX: idx_gallery_user_id ON gallery_photos(user_id)
INDEX: idx_gallery_customer_id ON gallery_photos(customer_id)
INDEX: idx_gallery_captured_at ON gallery_photos(captured_at)
```

**Notes:**
- `document_id` set when photo originated from a quote/invoice. NULL for standalone gallery photos.
- `ai_notes` populated by AI from voice note. NULL for quick snaps.
- `manual_notes` allows manual note editing on any photo later.

---

### Table: `refresh_tokens`

```
refresh_tokens
├── id              UUID, PRIMARY KEY, DEFAULT gen_random_uuid()
├── user_id         UUID, NOT NULL, FK → users.id, ON DELETE CASCADE
├── token_hash      VARCHAR(255), NOT NULL
├── expires_at      TIMESTAMPTZ, NOT NULL
├── created_at      TIMESTAMPTZ, DEFAULT NOW()
└── revoked_at      TIMESTAMPTZ, NULL

INDEX: idx_refresh_tokens_user_id ON refresh_tokens(user_id)
INDEX: idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)
```

---

### Entity Relationship Summary

```
users (1) ──→ (many) customers
users (1) ──→ (many) documents
users (1) ──→ (many) gallery_photos
users (1) ──→ (many) refresh_tokens

customers (1) ──→ (many) documents
customers (1) ──→ (many) gallery_photos

documents (1) ──→ (many) line_items
documents (1) ──→ (many) document_photos
documents (1) ──→ (many) gallery_photos (via document_id FK)
documents (1) ──→ (1) documents (self-referencing via parent_id: quote → invoice → receipt)
```

---

## 14. API Endpoints

### Authentication

```
POST   /api/auth/register          Create account
POST   /api/auth/login             Login → access + refresh tokens
POST   /api/auth/refresh           Exchange refresh token
POST   /api/auth/logout            Revoke refresh token
```

### User Profile

```
GET    /api/profile                Get business profile + settings
PATCH  /api/profile                Update profile (name, phone, logo, tax rate, etc.)
POST   /api/profile/logo           Upload business logo → cloud storage URL
```

### Customers

```
GET    /api/customers              List all customers (sorted by recent activity)
POST   /api/customers              Create new customer
GET    /api/customers/:id          Get customer detail + recent docs + gallery count
PATCH  /api/customers/:id          Update customer info / persistent notes
DELETE /api/customers/:id          Delete customer + all associated data
```

### Documents (Quotes, Invoices, Receipts)

```
GET    /api/documents              List all documents (filters: doc_type, status, date range, customer_id)
POST   /api/documents/capture      Upload audio → AI → structured line items (voice path)
POST   /api/documents/convert-notes  Upload text notes → AI → structured line items (notes path)
POST   /api/documents              Create document with confirmed line items + total (all paths)
GET    /api/documents/:id          Get document detail with line items + photos
PATCH  /api/documents/:id          Update document (edit line items, status, date, etc.)
POST   /api/documents/:id/send     Generate PDF and deliver via text/email
POST   /api/documents/:id/resend   Resend existing PDF
POST   /api/documents/:id/convert  Convert quote → invoice or invoice → receipt
GET    /api/documents/:id/pdf      Download/preview generated PDF
DELETE /api/documents/:id          Delete a document
```

**Key endpoint: `POST /api/documents/capture`**

Receives audio (one or more clips concatenated on frontend). Sends to Gemini API. Returns structured JSON.

```json
// Request: multipart/form-data
// - audio: audio/webm or audio/mp4 — REQUIRED
// - doc_type: "quote" or "invoice" — REQUIRED

// Response:
{
  "line_items": [
    { "description": "Brown mulch", "details": "5 yards", "price": 275.00 },
    { "description": "Shrub trimming & removal", "details": "10 shrubs", "price": 200.00 },
    { "description": "Debris haul away", "details": "1 load", "price": 40.00 },
    { "description": "Labor", "details": "4 hours", "price": null }
  ],
  "total": 650.00,
  "raw_transcript": "Alright so this is gonna be about five yards of brown mulch..."
}
```

**Key endpoint: `POST /api/documents/convert-notes`**

Same extraction from typed text. Identical response format.

```json
// Request: application/json
{ "notes": "5yd brown mulch, trim 10 shrubs, haul brush, ~4hrs, around 650", "doc_type": "quote" }
```

**Key endpoint: `POST /api/documents/:id/convert`**

Converts a document to the next type in the chain.

```json
// Request: application/json
{ "target_type": "invoice" }  // or "receipt"

// Creates new document with:
// - Line items copied from source
// - parent_id set to source document
// - New doc_number generated (INV-xxx or R-xxx)
// - Returns new document ID
```

### Gallery

```
POST   /api/gallery/capture        Upload photo + audio → AI → text note
POST   /api/gallery/quick-snap     Upload photo only → store immediately
GET    /api/gallery?customer_id=X  List gallery photos for a customer
GET    /api/gallery/:id            Get single photo with notes
PATCH  /api/gallery/:id            Edit notes on a photo
DELETE /api/gallery/:id            Delete a photo
```

### Stats & Export

```
GET    /api/stats/summary          Returns: quoted_month, invoiced_month, collected_month, pending_count
GET    /api/export                 Returns CSV of documents (params: date range, doc_type, status)
```

---

## 15. AI Prompt Design

### Quote / Invoice Extraction Prompt (Audio or Text → Structured Line Items)

Used by `/api/documents/capture` (voice) and `/api/documents/convert-notes` (text).

The system prompt is dynamically seeded with the user's trade type from onboarding.

```
SYSTEM:
You are an assistant for a {trade_type} field service business app.
You will receive either an audio recording or typed notes from a
{trade_type} professional describing work they want to quote or invoice.

Your job is to extract structured line items from the description.
Convert their spoken or typed description into clean, professional
line items with prices.

The user may speak/write casually with industry shorthand.

{TRADE-SPECIFIC EXAMPLES - dynamically inserted based on trade_type}

For landscaping:
- "five yards of brown" = 5 yards of brown mulch
- "trim the boxes" = trim boxwood shrubs
- "edge it out" = edging along driveways/sidewalks/beds
- "clean it up" = general yard cleanup / leaf removal / debris removal
- "haul it" / "take it away" = debris removal and disposal
- "bed work" = garden bed maintenance (weeding, edging, mulching)
- "cut" can mean lawn mowing OR shrub/tree trimming depending on context

For pressure washing:
- "house wash" = exterior house wash
- "flat work" = driveway/sidewalk/patio washing
- "soft wash" = low-pressure chemical treatment
- "linear feet" = measurement for fence/wall washing

For handyman:
- "drywall patch" = repair and patch drywall
- "hang" = install (shelves, fixtures, TVs, etc.)
- "demo" = demolition / tear out

General rules for all trades:
- Prices may be stated as totals ("about six-fifty" = $650) or per-item
- "Couple hours" = approximately 2 hours of labor

RULES:
1. Extract each distinct service or material as a separate line item.
2. Each line item needs: description, details (quantity/scope), and price.
3. If individual prices are stated, use them.
4. If only a total is stated, set individual prices to null, return total separately.
5. If no price mentioned at all, set all prices and total to null.
6. Use clear, professional language (not raw slang).
7. Do NOT invent line items that weren't mentioned.
8. Do NOT estimate or calculate prices the user didn't state.
9. Return valid JSON only. No markdown, no explanation.

RESPONSE FORMAT:
{
  "line_items": [
    { "description": "string", "details": "string or null", "price": number or null }
  ],
  "total": number or null
}
```

### Gallery Note Extraction Prompt (Photo + Audio → Text Note)

```
SYSTEM:
You are an assistant for a field service documentation app.
You will receive a photo taken at a job site and an audio recording
of a tradesperson documenting notes about the work.

Create a clear, concise written note from what they said. The note
should be practical — written as if they're leaving instructions
for themselves or their crew.

Clean up casual language but preserve ALL specific details:
- Names and quantities of materials or items
- Specific customer requests
- Measurements or dimensions
- Locations on the property
- Warnings or special instructions

Use the photo for context but prioritize the spoken description.

RULES:
1. Keep it concise — 1-3 sentences unless the description is complex.
2. Preserve every specific detail and instruction.
3. Do NOT add information that wasn't mentioned.
4. Do NOT offer suggestions or advice.
5. Plain text only. No markdown, no JSON.

EXAMPLE INPUT (audio): "Customer wants these four arborvitae trimmed
to about six feet, but leave the one on the left alone, she said it's
blocking the neighbor's view of their shed."

EXAMPLE OUTPUT: "Trim 4 arborvitae to 6 feet. Leave the one on the
left untrimmed — customer wants it tall to block neighbor's view of shed."
```

---

## 16. Technical Architecture

### Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Frontend | React + TypeScript (PWA) | Familiar stack, camera/mic via browser APIs |
| Backend | Python + FastAPI | Core strength, async support, fast development |
| Database | PostgreSQL | Proven, relational data fits perfectly |
| ORM | SQLAlchemy + Alembic | Familiar tooling, migration support |
| AI | Google Gemini API | Native audio processing; multimodal for gallery notes |
| Cloud Storage | AWS S3 or GCP Cloud Storage | Photos, logos, generated PDFs |
| PDF Generation | WeasyPrint or ReportLab | Server-side HTML → PDF rendering |
| SMS Delivery | Twilio API | Industry standard, simple integration |
| Email Delivery | SendGrid or AWS SES | Transactional email for document delivery |
| Auth | JWT (access + refresh tokens) | Stateless, long-lived sessions |
| Hosting (Backend) | AWS EC2 or GCP Compute Engine | Familiar deployment, Terraform ready |
| Hosting (Frontend) | Vercel | Free tier, automatic deploys |

### Architecture Diagram

```
┌─────────────────┐
│   React PWA     │
│  (Vercel)       │
│                 │
│  Voice + Camera │
│  Customer UI    │
│  Doc Review     │
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────┐      ┌──────────────────┐
│   FastAPI        │─────→│  Gemini API       │
│   Backend        │      │  (audio + multi-  │
│                  │      │   modal)          │
│  - Auth          │      └──────────────────┘
│  - CRUD          │
│  - PDF Gen       │      ┌──────────────────┐
│  - File Upload   │─────→│  Twilio / SES     │
│  - CSV Export    │      │  (SMS / Email)    │
└────────┬────────┘      └──────────────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│  PostgreSQL      │      │  Cloud Storage    │
│  (RDS/Cloud SQL) │      │  (S3 / GCS)      │
│                  │      │  - Photos         │
│  - Users         │      │  - Logos          │
│  - Customers     │      │  - PDFs           │
│  - Documents     │      └──────────────────┘
│  - Line Items    │
│  - Doc Photos    │
│  - Gallery       │
│  - Tokens        │
└─────────────────┘
```

### Key Technical Decisions

**AI Provider Abstraction:**
Wrap AI calls behind `services/ai_provider.py`. Two call patterns:
- **Document extraction:** Audio-only (or text) → structured JSON.
- **Gallery notes:** Photo + audio (multimodal) → plain text.
Swappable if better/cheaper providers emerge.

**Trade-Specific Prompts:**
The `trade_type` from user onboarding dynamically inserts relevant vocabulary examples into the system prompt. A landscaper's AI knows "brown" means mulch; a pressure washer's AI knows "flat work" means driveway washing. This differentiation costs nothing to implement (string interpolation) but significantly improves extraction quality.

**Multi-Clip Audio:**
Frontend collects audio blobs in an array (one per toggle). Concatenated into single file via Web Audio API before upload. Backend receives one combined file.

**Photo Upload Flow:**
1. Frontend captures → displays locally immediately
2. Background upload to cloud storage via presigned URL
3. Backend receives storage key, not raw file
4. Document photos auto-create gallery_photos records

**Unified Document Model:**
Quotes, invoices, and receipts share one `documents` table with a `doc_type` discriminator and self-referencing `parent_id` for the quote → invoice → receipt chain. This keeps the schema simple and makes the conversion flow trivial (copy line items, change type, set parent).

**Document Numbering:**
Auto-generated per user, per type: Q-001, Q-002, INV-001, R-001. Sequential within each type. The `(user_id, doc_number)` unique index prevents collisions.

**PDF Generation:**
Server-side HTML template → WeasyPrint → PDF → cloud storage → URL on document record. Three template variants (quote, invoice, receipt) sharing the same base layout with different headers and fields.

**Offline Consideration (Post-MVP):**
Architecture should not prevent future offline support. Service worker caching, IndexedDB for local storage, background sync when connectivity returns.

---

## 17. Unit Economics

| Metric | Value |
|--------|-------|
| Cost per AI extraction (API call) | ~$0.005 - $0.01 |
| Cost per gallery note (multimodal API call) | ~$0.01 |
| Cost per photo stored (cloud storage) | ~$0.001/month |
| Cost per PDF generated + stored | ~$0.001 |
| Cost per SMS sent (Twilio) | ~$0.0079 |
| Cost per email sent (SES) | ~$0.0001 |
| Monthly cost per active user (estimate: 15 docs + 30 photos + 10 SMS) | ~$0.25 |
| Subscription price (Pro) | $5.00/month |
| Gross margin per user | ~95% |
| Users needed for $500 MRR | 100 |
| Users needed for $1,000 MRR | 200 |
| Users needed for $5,000 MRR | 1,000 |

---

## 18. MVP Build Phases

### Phase 0: Proof of Concept (High-Risk Test)
- [ ] Single React page with voice toggle recording (multi-clip)
- [ ] Single FastAPI endpoint: audio → Gemini → structured JSON
- [ ] Validate: does Gemini reliably parse trade descriptions into line items?
- [ ] Test on actual phones (iOS Safari + Android Chrome)
- [ ] Test with different trade vocabularies

### Phase 1: Foundation
- [ ] Backend: Auth (register, login, refresh, logout)
- [ ] Backend: User profile CRUD + onboarding with trade type
- [ ] Backend: Customer CRUD with persistent notes
- [ ] Database: All tables + migrations
- [ ] Frontend: Welcome / Register / Sign In screens
- [ ] Frontend: Onboarding screen with trade type selection
- [ ] Frontend: Customer list + new customer form
- [ ] Frontend: Customer detail page (tabs, header, action buttons)

### Phase 2: Quote Flow
- [ ] Frontend: Voice recording (toggle, multi-clip, Start Over)
- [ ] Frontend: Optional photo capture (multiple)
- [ ] Frontend: Manual entry (freeform notes + Convert + direct line items)
- [ ] Backend: `/api/documents/capture` (audio → AI → JSON)
- [ ] Backend: `/api/documents/convert-notes` (text → AI → JSON)
- [ ] Backend: Document + line items CRUD
- [ ] Frontend: Quote review / edit screen
- [ ] Backend: PDF generation (quote template)
- [ ] Frontend: PDF preview
- [ ] Backend: SMS delivery (Twilio)
- [ ] Backend: Email delivery (SES)
- [ ] Frontend: Send document screen
- [ ] Frontend: Document detail view

### Phase 3: Invoice + Receipt Flow
- [ ] Backend: Quote → Invoice conversion endpoint
- [ ] Backend: Invoice → Receipt conversion endpoint
- [ ] Backend: PDF generation (invoice + receipt templates)
- [ ] Frontend: Invoice creation (same three paths as quotes)
- [ ] Frontend: Quote-to-invoice one-tap conversion
- [ ] Frontend: Mark as paid + payment method selection
- [ ] Frontend: Receipt generation
- [ ] Backend: Document numbering (Q-xxx, INV-xxx, R-xxx)
- [ ] Backend: Status management across document lifecycle

### Phase 4: Gallery
- [ ] Frontend: Gallery capture — quick snap
- [ ] Frontend: Gallery capture — voice note toggle
- [ ] Backend: Gallery endpoints (quick-snap + photo-with-note)
- [ ] Backend: Auto-create gallery entries from document photos
- [ ] Frontend: Adaptive gallery layout
- [ ] Frontend: Photo detail view with notes

### Phase 5: History, Export & Polish
- [ ] Frontend: Job history screen with filters and stats
- [ ] Backend: Stats summary endpoint
- [ ] Backend: CSV export endpoint
- [ ] Frontend: Export settings UI
- [ ] Frontend: Settings screen (tax rate, payment terms, delivery defaults)
- [ ] Cloud storage setup (S3 or GCS)
- [ ] Deployment (backend to AWS/GCP, frontend to Vercel)
- [ ] PWA manifest + service worker (basic caching)
- [ ] Free tier enforcement (document count limits)

---

## 19. Post-MVP Roadmap

**Near-term (v1.1 - v1.3):**
- Duplicate previous document (pre-populate from last job for same customer)
- Service log for recurring work (weekly mow tracking without documents)
- Payment processing integration (Stripe) — let customers pay from the invoice link
- Automated payment reminders (overdue invoice → auto-text after X days)
- Customer portal (unique link per document for accept/decline/pay)

**Medium-term (v2.0+):**
- Simultaneous image + audio capture in one button (Tier 3 UX)
- Offline capture + background sync
- Multi-user / crew accounts
- PDF template customization
- QuickBooks / Xero integration
- Customer search by address / map view
- Before/after photo sharing to social media

**Long-term:**
- React Native port for App Store distribution
- Trade-specific pivots (auto detailing, property management, cleaning)
- Route optimization for daily job scheduling
- Inventory / material tracking
