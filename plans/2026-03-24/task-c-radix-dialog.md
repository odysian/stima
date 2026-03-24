## Scope

Install `@radix-ui/react-dialog` and refactor `ConfirmModal` to use it. Replaces manual focus management and keyboard handling with battle-tested headless primitives.

**Can run in parallel with Task A.**

Parent spec: #82 (Spec: Quote list UI polish)

## Why Radix, not a full component library

The design system ("Organic Brutalism" with custom surface hierarchy, ghost shadows, forest gradient) is too opinionated for Material UI, Chakra, or shadcn without heavy overrides. Radix is headless — zero styling opinions, interaction logic and accessibility only. Install only what's needed now; other primitives deferred.

## Current ConfirmModal gaps (bugs this fixes)

- Backdrop click to dismiss: **not implemented** (no handler on backdrop div)
- Focus trap: **not implemented** (tab can escape the modal)
- Scroll lock on iOS Safari: **not implemented**

## Changes

### 1. Install dependency

`@radix-ui/react-dialog` (~8KB gzipped). Per repo policy, dependency installation requires human approval — the agent will pause for confirmation before running `npm install`.

### 2. Refactor `ConfirmModal.tsx`

Replace manual `useEffect` focus management and the `onKeyDown` Escape handler on the backdrop div with Radix Dialog primitives. Keep ALL existing Tailwind classes and visual styling unchanged. The component's external API (`ConfirmModalProps`) stays identical — this is an internal refactor.

```tsx
import * as Dialog from "@radix-ui/react-dialog";

export function ConfirmModal({ title, body, confirmLabel, cancelLabel, onConfirm, onCancel, variant = "primary" }: ConfirmModalProps) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-x-4 bottom-4 z-50 ... (existing card styles)"
          onOpenAutoFocus={(e) => {
            // Focus cancel button instead of first focusable
            e.preventDefault();
            cancelButtonRef.current?.focus();
          }}
        >
          <Dialog.Title>...</Dialog.Title>
          <Dialog.Description>...</Dialog.Description>
          {/* existing button layout */}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

### 3. Update tests if needed

If Radix's portal rendering breaks test queries (portals append to `document.body`), update test render setup to query within the portal. The component's props and observable behavior are unchanged — tests checking `onCancel` fires on Escape, `onConfirm` fires on confirm click, etc. should pass without modification.

## Files touched

- `frontend/package.json`
- `frontend/src/shared/components/ConfirmModal.tsx`
- `frontend/src/shared/components/ConfirmModal.test.tsx` (if portal rendering changes query scope)

## Acceptance criteria

- [ ] `@radix-ui/react-dialog` is installed and listed in `package.json` dependencies
- [ ] `ConfirmModal` uses Radix Dialog primitives internally
- [ ] `ConfirmModal` external API (props) is unchanged
- [ ] Focus trap works correctly (tab cycles within modal)
- [ ] Escape dismisses modal and calls `onCancel`
- [ ] Backdrop click dismisses modal and calls `onCancel`
- [ ] Initial focus lands on cancel button
- [ ] Focus returns to trigger element on close
- [ ] Scroll lock prevents background scroll on iOS Safari
- [ ] All existing ConfirmModal tests pass (or are minimally updated for portal rendering)
- [ ] No visual changes to the modal appearance
- [ ] `make frontend-verify` passes
- [ ] No other Radix packages installed (only `react-dialog`)

## Verification

```bash
make frontend-verify
```
