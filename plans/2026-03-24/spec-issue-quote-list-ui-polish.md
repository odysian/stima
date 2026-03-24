## Summary

The quote list screen (`QuoteList.tsx`) is the app's primary landing surface. A UI evaluation identified seven improvements. This spec groups them into three child Tasks: a focused quote list redesign, a consistency pass across all list screens, and a Radix UI foundation for headless accessibility.

**Frontend-only.** No backend changes, no API contract changes, no new routes.

## Decision locks

1. **Card layout: 2-line horizontal scan.** Customer name + total on row 1. Doc number + date + item count + status badge on row 2.
2. **List separation: tonal background shift.** List region gets `bg-surface-container-low`. Cards remain `bg-surface-container-lowest`. Gap: `gap-3`.
3. **Stat section: collapse to inline summary row.** Replace two tall stat cards with `"3 active · 2 pending review"` below the title.
4. **Active state: background shift + stronger scale.** `active:scale-[0.98] active:bg-surface-container-low`.
5. **Search label: sr-only.** Visually hidden, kept for screen readers.
6. **Card border radius: `rounded-xl` on cards.** Buttons and inputs stay `rounded-lg`.
7. **Radix UI: install only `@radix-ui/react-dialog`.** Refactor `ConfirmModal` only. Other primitives deferred.

## Non-goals

- No new screens or routes
- No backend or API changes
- No new features (filtering, sorting, pagination)
- No theme token changes in `index.css`
- No changes to quote detail, capture, or review screens (except list pattern consistency in Task B)
- No full design system overhaul

## Child Tasks

- [ ] Task A: Quote list screen redesign
- [ ] Task B: List pattern consistency pass
- [ ] Task C: Radix UI Dialog foundation

## Task dependency graph

```
Task A (quote list redesign)  ──→  Task B (list consistency pass)
Task C (Radix dialog)               (independent, can run in parallel with A)
```

## Spec closes when

All child Tasks are merged or explicitly deferred.

## Reference

`plans/2026-03-24/spec-quote-list-ui-polish.md`
