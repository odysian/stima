# Stitch Design Whiteboard — Stima

Structured plan for a Stitch design session. Work through Part 1 (decisions) first,
then run Part 2 screens in the order listed.

---

## Part 1 — Design Foundation (answer these before opening Stitch)

These decisions propagate to every screen. Lock them in first so you're not
mid-session changing your mind about color and restarting.

### 1A — Primary color / brand palette

The current code is all `slate-*` (neutral grey). That's safe but generic.
Pick ONE primary accent color that becomes your brand color (buttons, badges,
active states, FAB). Everything else stays neutral.

Options to consider for a trade app:

| Option | Feel | Works well when |
|---|---|---|
| **Amber / orange** | Energy, tools, hands-on | You want warm and punchy |
| **Blue (600-700)** | Trust, professional, calm | You want it to feel like a serious business tool |
| **Teal / cyan** | Modern, approachable | You want differentiation from typical trade apps |
| **Slate + white only** | Minimal, editorial | You want the quotes/numbers to be the hero |

> Decision needed: pick a primary color and a rough dark/light surface palette.

---

### 1B — Device target

The current code is **inconsistent**: auth screens use `max-w-md` (phone-width),
the home screen uses `max-w-6xl` (wide desktop). You need to commit to one model.

| Option | What it means |
|---|---|
| **Mobile-first / app feel** | Max ~`max-w-sm` to `max-w-md`. Feels native. Right for a tradesperson using their phone on a job site. Navigation is bottom-bar or simple back button. |
| **Desktop-friendly web app** | Wider layouts, sidebar nav possible. Better if users also create quotes at a desk. |
| **Responsive (both)** | Mobile layout that expands gracefully on desktop. More work to design and implement but the right long-term answer. |

> Recommendation: **mobile-first** for now. The voice capture and job-site use case
> is a phone workflow. Design for a 390px wide screen (iPhone 14 Pro). Desktop
> can be improved later.

---

### 1C — Typography

Tailwind v4 defaults to system fonts. Options:

- **System stack (default)** — no extra loading, looks native on each device.
- **Inter** — clean, widely used in SaaS, easy to add via Google Fonts.
- **Geist** — Vercel's font, very clean for data-dense UIs.

> For a trade app: system stack or Inter is fine. Don't overthink this.

---

### 1D — Visual tone / feel

Pick a few adjectives you want the app to feel like. This goes directly into
your Stitch "vibe" prompt.

Examples to choose from or mix:
- **Confident and practical** — high contrast, chunky buttons, no decoration
- **Clean and minimal** — lots of white space, light borders, subtle shadows
- **Bold and modern** — strong typography, accent color used more aggressively
- **Friendly and approachable** — rounded corners, softer colors, warmer palette

> Recommendation: **confident and practical, clean and minimal**. This app is a
> work tool. The tradesperson is outside or in a customer's home. It needs to be
> legible, fast to scan, and not cute.

---

## Part 2 — Screen Inventory and Stitch Prompts

### Reusable app context block (paste at the top of every Stitch prompt)

```
Stima is a mobile-first quoting app for independent tradespeople (plumbers,
electricians, builders). It lets them capture a job verbally or by typing notes,
then generates a structured quote with line items and a total.

Design target: 390px wide (iPhone 14 Pro). Clean, confident, practical.
[YOUR PALETTE DECISION HERE — e.g. "Primary accent: blue-600. Surfaces: white and slate-50."]
Typography: Inter or system fonts. No decorative elements.
```

---

### Screen 1 — Quote List (Home)  ← START HERE

**Why first:** This is the most-used screen and sets the visual language for everything.
Get this right and the rest follows naturally.

**What exists:**
- Page header: "Your Quotes" + subtitle + Settings button (top right)
- Search input (below header)
- Quote cards: customer name, doc number, status badge (Draft/Ready/Shared), Created date, Total
- Empty state with a CTA button
- Fixed FAB bottom-right: "New Quote"

**Design decisions to make:**
- Should the Settings link be an icon button (gear icon) or a text button?
- Should the FAB be a circle or a pill/rounded-rectangle?
- Status badge colors: Draft = grey, Ready = green, Shared = blue — confirm or change
- Should quote cards show the status badge top-right or bottom of card?
- Should the search be always visible or collapsed behind an icon?

**Stitch prompt:**
```
[App context block]

Design the home screen (quote list). Mobile width, full height.

Layout:
- Top: page header "Your Quotes" on the left, a gear icon Settings button top right
- Below header: a search input field labeled "Search quotes"
- Main content: a scrollable list of quote cards. Each card shows:
    - Customer name (bold, prominent)
    - Quote number e.g. Q-004 (secondary, smaller)
    - Status badge top-right of card: "Draft" (grey), "Ready" (green), "Shared" (blue)
    - Row below: created date on left, total amount on right
- Fixed bottom-right: a pill-shaped FAB button labeled "New Quote" with a + icon
- Empty state (no quotes): friendly message "No quotes yet" with a "Create your first quote" button centered in the list area

Make the cards feel tappable and distinct. Generous padding. White cards on a light grey background.
```

---

### Screen 2 — Login

**What exists:**
- Centered card (full screen centered)
- Title: "Sign in"
- Email + password inputs
- Submit button: "Sign in"
- Link: "Need an account? Register"
- Error message area

**Design decisions to make:**
- Should auth screens have any branding at top (logo/app name)?
- Should the card be full-bleed on mobile (no rounded corners) or a floating card?

**Stitch prompt:**
```
[App context block]

Design the login screen. Mobile width, full height.

Layout:
- Top section (above the card): app name "Stima" in bold, centered — this is
  the only branding moment
- Card below: white, rounded corners, generous padding
    - Heading: "Sign in"
    - Email input field
    - Password input field
    - Primary button: "Sign in" (full width)
    - Below button: small text link "Need an account? Register"
    - Error state: a red error banner above the button when login fails

Keep it simple. No illustration, no marketing copy. Just clean and fast.
```

---

### Screen 3 — Register

Almost identical to Login. Design together or as a second prompt referencing Screen 2.

**Differences from Login:**
- Title: "Create account"
- Button: "Create account"
- Link: "Already have an account? Sign in"

**Stitch prompt:**
```
[App context block]

Design the register screen. Same style as the login screen above.

Differences:
- Heading: "Create account"
- Primary button: "Create account"
- Link at bottom: "Already have an account? Sign in"

Keep both screens visually identical in structure.
```

---

### Screen 4 — Onboarding

**What exists:**
- Centered card
- Title: "Complete your business profile"
- Fields: Business name, First name, Last name, Trade type (dropdown)
- Button: "Continue"

**This is a one-time screen** — slightly more welcoming tone is OK.

**Design decisions to make:**
- Should this have a progress indicator (step 1 of 1)?
- Should it feel warmer/more welcoming than the auth screens, or identical?

**Stitch prompt:**
```
[App context block]

Design the onboarding screen shown once after registration. Mobile width.

Layout:
- Brief welcoming header: "Set up your business" (or similar — a short friendly intro)
- White card with:
    - Business name input (required)
    - First name input
    - Last name input
    - Trade type: a segmented picker or styled dropdown with options like
      Plumber, Electrician, Builder, Painter, Landscaper, Other
    - Primary button: "Continue" (full width)

This is the user's first impression of the app after signing up. Keep it clean
and encouraging. The trade type picker could use small icons or just clean labels.
```

---

### Screen 5 — Customer Select

**What exists (search mode):**
- Title: "Select customer"
- Search input
- Scrollable list of customer rows (name + phone/email subtitle)
- Empty state: "No customers found. Create one to continue."
- Bottom: "Add new customer" button

**What exists (create mode — same screen, toggled):**
- Title: "Add new customer"
- Name, Phone, Email inputs
- Address textarea
- "Create customer" + "Cancel" buttons

**Design decisions to make:**
- Should "Add new customer" be a FAB or a button below the list?
- Should the create form slide up as a bottom sheet or replace the screen?

**Stitch prompt (search mode):**
```
[App context block]

Design the "Select customer" screen. Mobile width.

Layout:
- Back button top-left (returns to home)
- Title: "Select customer"
- Search input below title
- Scrollable list of customer rows. Each row:
    - Customer name (bold)
    - Phone / email shown as secondary text below name
    - Full-width tappable row with a right chevron or subtle tap indicator
- Empty/no-match state: "No customers found" message
- Fixed bottom: a prominent "Add new customer" button or FAB

The list should feel like a contacts list. Clean rows, clear tap targets.
```

**Stitch prompt (create mode):**
```
[App context block]

Design the "Add new customer" form screen. Mobile width.

This is a sheet that appears when the user taps "Add new customer".
Show it as a full-screen form (or bottom sheet if it looks better).

Fields (vertically stacked):
- Name (required)
- Phone (optional)
- Email (optional)
- Address (optional, multi-line textarea)

Buttons at bottom:
- Primary: "Create customer"
- Secondary/ghost: "Cancel"

Keep it fast. Most users will only fill in Name and maybe Phone.
```

---

### Screen 6 — Capture (Voice + Text)

**What exists:**
- Title: "Capture quote notes"
- Subtitle: "Voice capture is primary..."
- Toggle: Voice | Text (segmented control)

**Voice mode:**
- Recorder box: status text (Recording / Not recording), elapsed timer, Record / Stop button, Start over button
- Clips list: each clip shows clip number, duration, audio playback element, Delete button
- "Generate Draft" button + Back

**Text mode:**
- Large textarea with placeholder "5 yards brown mulch, edge front beds..."
- "Generate Draft" button + Back

**This is the core action screen.** Get the voice mode right — it's the primary flow.

**Design decisions to make:**
- Should the record button be large and central (like a voice memo app) or inline?
- Should clips show a waveform visualization or just text + audio player?
- Should the mode toggle be a tab bar or a segmented pill?

**Stitch prompt (voice mode):**
```
[App context block]

Design the voice capture screen. Mobile width. This is the primary action screen
of the app — the tradesperson speaks their job notes here.

Layout:
- Back button + "New Quote" title at top
- Mode toggle: "Voice" (active) | "Text" — pill segmented control

Voice mode content:
- Large centered record button (prominent, ~80px diameter circle). When not
  recording: microphone icon, accent color. When recording: pulsing red circle,
  "Stop" label, elapsed timer below (00:23 format)
- Below the record button: a "Clips recorded" section showing each clip as a row:
    - Clip number and duration
    - Simple audio playback bar
    - Delete icon button on the right
- Empty clips state: subtle helper text "Tap the button to record your first clip"
- At the bottom: "Generate Draft" primary button (disabled until at least one clip)
  and a "Start over" secondary button

The record button is the hero of this screen. Make it large and obvious.
```

---

### Screen 7 — Review (Extracted Draft)

**What exists:**
- Title: "Review extracted draft"
- Transcript section (collapsible-worthy)
- Confidence notes (amber warning box, appears if AI flagged anything)
- Line items section: editable rows (description, details, price), Add line item button
- Total amount input + Line item sum display
- Notes textarea
- "Generate Quote PDF" button + Cancel

**This is the most complex screen.** Dense but needs to be scannable.

**Design decisions to make:**
- Should the transcript be collapsed by default (most users won't need to re-read it)?
- Should line items be a table-like layout or stacked cards?
- Should flagged items (amber flag_reason) show inline in the row?

**Stitch prompt:**
```
[App context block]

Design the "Review extracted draft" screen. Mobile width, scrollable.

This screen shows the AI-extracted quote for the user to review and edit before saving.

Sections (top to bottom):
1. Collapsible "Transcript" section — collapsed by default, shows the raw spoken/typed notes
2. Optional amber warning box labeled "Review notes" — only shown when the AI flagged
   uncertain items. Has a list of short warning strings.
3. "Line items" section:
    - Label and "Add line item" button inline on the right
    - Each line item is a card/row with:
        - Description input (required, full width)
        - Details input below (optional, smaller text)
        - Price input on the right (right-aligned, currency format)
        - Flagged items: amber left border or warning icon on the row
        - Delete icon on the row
4. Totals row:
    - "Total amount" editable input on the left
    - "Line item sum" calculated display on the right (read-only, bold)
5. "Customer notes" textarea — optional notes for the customer
6. Sticky or bottom-pinned action bar:
    - Primary button: "Save Quote"
    - Secondary: "Cancel"

Dense but clean. Prioritize the line items — that's where the user spends time.
```

---

### Screen 8 — Quote Preview

**What exists:**
- Title: "Quote Preview"
- Quote number + status subtitle
- "Generate PDF" button + "Share" button
- Large iframe PDF preview area
- Share URL display when shared

**Design decisions to make:**
- Should the PDF preview be full-width below the actions?
- Should the share URL be copyable with a copy-to-clipboard button?

**Stitch prompt:**
```
[App context block]

Design the Quote Preview screen. Mobile width.

Layout:
- Back button + quote number as title (e.g. "Q-004")
- Status badge inline next to quote number (Draft / Ready / Shared)
- Action row:
    - "Generate PDF" primary button
    - "Share" secondary button (disabled until PDF is generated)
- Large preview area below (full width, ~60vh tall) that shows the PDF once
  generated. Before generation: a placeholder with helper text
  "Generate the PDF to preview it here."
- When shared: a "Share link" row showing the URL and a copy-to-clipboard icon button

Clean and functional. The PDF preview is the centerpiece.
```

---

### Screen 9 — Settings

**What exists:**
- Title: "Settings"
- "Business profile" card: Business name, First name, Last name, Trade type
- "Account" card: Email (read-only), Sign Out button
- "Save changes" button at bottom

**Stitch prompt:**
```
[App context block]

Design the Settings screen. Mobile width.

Layout:
- Back button + "Settings" title at top
- "Business profile" section card:
    - Business name input
    - First name input
    - Last name input
    - Trade type dropdown or segmented picker
- "Account" section card:
    - Email address (read-only, displayed as plain text)
    - "Sign out" button (destructive style — red or outline)
- Sticky bottom or end of scroll: "Save changes" primary button

Two-section layout with clear visual grouping. Settings screens should feel calm
and organized.
```

---

## Part 3 — Stitch Session Order

Run screens in this order to build momentum:

1. **Quote List (home)** — locks in the visual language
2. **Login** — auth is simple, sets the card/form style
3. **Register** — quick follow-up to login
4. **Onboarding** — slight warm variant of the auth card
5. **Capture (voice mode)** — hardest flow to design, do it fresh
6. **Customer Select** — search + create, straightforward
7. **Review** — most complex, do it after you're warmed up
8. **Quote Preview** — straightforward, two actions + preview
9. **Settings** — simplest, leave it last

---

## Part 4 — Tips for the Session

- Use **Thinking mode** (Gemini 3.1 Pro) for screens 1, 6, and 7 — the most complex.
- Use **Flash** for the auth screens (2, 3) — they're simple enough.
- After each screen, **iterate with text** before moving on. Don't regenerate
  from scratch — prompt changes like "make the record button larger" or
  "move the FAB to the bottom center instead of bottom right."
- Take a **screenshot of each final design** before moving to the next screen.
  You'll want a reference set when you implement.
- If a design direction feels wrong after screen 1, **stop and use Vibe Design**
  to get 3-4 alternative directions. Pick one and commit. Don't mix vibes
  across screens.
