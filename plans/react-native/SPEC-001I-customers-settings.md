# SPEC-001I — Customers & Settings

**Parent umbrella:** `plans/react-native/SPEC-001-rn-expo-rewrite.md`
**Phase:** 3 Core Features
**Effort:** 3–4 days

## Goal

Port customer management and app settings.

## References

- `frontend/src/features/customers/components/CustomerListScreen.tsx`
- `frontend/src/features/customers/components/CustomerDetailScreen.tsx`
- `frontend/src/features/customers/components/CustomerCreateScreen.tsx`
- `frontend/src/features/settings/components/SettingsScreen.tsx`
- `frontend/src/features/settings/components/SettingsProfileDisplayParts.tsx`
- `frontend/src/features/settings/components/SettingsBusinessProfileCard.tsx`
- `frontend/src/features/settings/components/SettingsCatalogShortcutCard.tsx`
- `frontend/src/features/line-item-catalog/components/LineItemCatalogSettingsScreen.tsx`
- `frontend/src/features/line-item-catalog/services/lineItemCatalogService.ts`

## Acceptance Criteria

- [ ] Customer list with search and alphabet section headers.
- [ ] Customer detail: contact info, address, associated quotes.
- [ ] Customer create: form with validation, phone formatting.
- [ ] Settings screen: business profile, line-item catalog shortcut, theme toggle, logout.
- [ ] Line-item catalog: CRUD for reusable line items.

## Scope Notes

- Keep settings focused on parity with current web settings. New mobile-only preferences should be explicitly called out, not added opportunistically.
