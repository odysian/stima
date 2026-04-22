# Raw Button Whitelist

This file documents production `<button>` usages that intentionally stay raw and should not be auto-migrated to `Button`.

## Allowed Raw Patterns

- FABs:
  - `frontend/src/features/quotes/components/QuoteList.tsx` (`New quote` floating action button)
  - `frontend/src/features/customers/components/CustomerListScreen.tsx` (`New customer` floating action button)
  - Reason: fixed positioning, circular geometry, and custom elevation pattern are purpose-built and do not map cleanly to current `Button` variants.

- Tab and segmented toggles (`role="tab"`, `role="radio"`, `aria-pressed` segmented controls):
  - `ReviewDocumentTypeSelector`, `TradeTypeSelector`, `BottomNav`
  - segmented filters such as document/history mode switches
  - Reason: these are structural navigation controls, not action buttons.

- Full-row list/card triggers:
  - `LineItemCard`, `ReviewCustomerRow`, `ReviewLineItemsSection` and similar row-sized click targets
  - Reason: these controls are card/list surfaces with row-level interaction semantics.

- Purpose-specific structural controls:
  - drag handles
  - recording controls
  - accordion-like triggers
  - Reason: custom interaction behaviors and geometry are tighter than the shared button abstraction.

- Test-only `<button>` elements:
  - Test files may continue to use raw `<button>` markup for focused behavior fixtures.
