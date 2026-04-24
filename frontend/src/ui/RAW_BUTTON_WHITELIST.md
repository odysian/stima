# Raw Button Whitelist

This file documents every production raw `<button>` usage that intentionally stays raw. Any raw `<button>` in a `.tsx` file outside test fixtures must either be listed here with a category + reason, or be treated as a migration candidate.

## Categories

### FABs
Fixed-position floating action buttons with circular geometry and custom elevation.

- `src/features/quotes/components/QuoteList.tsx:381` — `New quote` floating action button.
- `src/features/customers/components/CustomerListScreen.tsx:152` — `New customer` floating action button.
- **Reason:** fixed positioning, circular geometry (`rounded-full`), `forest-gradient`, and custom elevation pattern are purpose-built and do not map cleanly to current `Button` variants.

### Tab and segmented toggles
Structural navigation controls (`role="tab"`, `role="radio"`, `aria-pressed`) — not action buttons.

- `src/features/quotes/components/QuoteList.tsx:258` — Quotes / Invoices segmented filter (`aria-pressed`).
- `src/features/quotes/components/QuoteList.tsx:270` — Quotes / Invoices segmented filter (`aria-pressed`).
- `src/features/quotes/components/LineItemEditSheet.tsx:316` — Manual / Catalog tab toggle (`role="tab"`).
- `src/features/quotes/components/LineItemEditSheet.tsx:334` — Manual / Catalog tab toggle (`role="tab"`).
- `src/features/quotes/components/QuoteReuseChooser.tsx:176` — Recent / All tab toggle (`aria-pressed`).
- `src/features/quotes/components/QuoteReuseChooser.tsx:188` — Recent / All tab toggle (`aria-pressed`).
- `src/features/quotes/components/ReviewDocumentTypeSelector.tsx:44` — Quote / Invoice radio toggle (`role="radio"`).
- `src/features/customers/components/CustomerDetailScreen.tsx:377` — history mode filter toggle (`aria-pressed`).
- `src/features/customers/components/CustomerDetailScreen.tsx:389` — history mode filter toggle (`aria-pressed`).
- `src/shared/components/TradeTypeSelector.tsx:18` — trade type segmented toggle (`aria-pressed`).
- `src/shared/components/BottomNav.tsx:36` — bottom navigation tab (`type="button"` with icon + label).
- **Reason:** these are structural navigation or selection controls, not action buttons.

### Full-row list/card triggers
Card/list surfaces with row-level interaction semantics.

- `src/ui/QuoteListRow.tsx:31` — quote list row click target.
- `src/features/quotes/components/ReviewCustomerRow.tsx:32` — customer assignment row click target.
- `src/features/quotes/components/LineItemCard.tsx:67` — line item row click target.
- `src/features/quotes/components/QuoteReuseChooser.tsx:227` — quote candidate row click target.
- `src/features/quotes/components/ReviewCustomerAssignmentSheet.tsx:182` — customer assignment row click target.
- `src/features/customers/components/CustomerListScreen.tsx:122` — customer list row click target.
- `src/features/customers/components/InvoiceHistoryList.tsx:75` — invoice history row click target.
- `src/features/customers/components/QuoteHistoryList.tsx:45` — quote history row click target.
- **Reason:** these controls are card/list surfaces with row-level interaction semantics; they span the full width and have custom hover/active states that do not fit the shared `<Button>` abstraction.

### Purpose-specific structural controls
Custom interaction behaviors and geometry tighter than the shared button abstraction.

- `src/features/quotes/components/LineItemCard.tsx:56` — drag handle (`cursor-grab`, h-9×w-9, touch-only reordering).
- `src/features/quotes/components/ReviewLineItemsSection.tsx:124` — "Reorder" mode toggle (small inline structural control).
- `src/features/quotes/components/ReviewLineItemsSection.tsx:187` — "Add Line Item" dashed-border trigger (custom border style, not a standard button).
- `src/features/quotes/components/TotalAmountSection.tsx:116` — "Optional Pricing" accordion-like expand/collapse trigger.
- `src/features/quotes/components/CaptureInputPanel.tsx:136` — recording stop control (h-20×w-20, custom color, purpose-specific).
- `src/features/quotes/components/CaptureInputPanel.tsx:152` — recording start control (h-20×w-20, custom color, purpose-specific).
- `src/ui/DocumentHeroCard.tsx:71` — linked document action inline link-button (custom layout geometry inside card).
- `src/ui/NumericField.tsx:116` — `-` step control (h-6×w-6; too small for `<Button>`).
- `src/ui/NumericField.tsx:124` — `+` step control (h-6×w-6; too small for `<Button>`).
- `src/ui/PasswordField.tsx:24` — Show / Hide visibility toggle (text-only input adornment).
- `src/ui/Toast.tsx:85` — Dismiss `×` button (h-6×w-6; too small for `<Button>`).
- `src/shared/components/OverflowMenu.tsx:88` — overflow menu trigger (custom-geometry circular chrome button).
- `src/shared/components/OverflowMenu.tsx:135` — overflow menu action row (`role="menuitem"` with icon/label grid and tight padding).
- **Reason:** custom interaction behaviors, geometry, or size constraints are tighter than the shared `<Button>` abstraction; overflow menu action rows require a 2-column icon/label grid and compact spacing that do not map cleanly to the shared `<Button>` content layout.

### Test-only
- Test files may continue to use raw `<button>` markup for focused behavior fixtures.
- **Files:** any `*.test.tsx`.
