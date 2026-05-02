# SPEC-001L — Deep Linking

**Parent umbrella:** `plans/react-native/SPEC-001-rn-expo-rewrite.md`
**Phase:** 4 Native Integrations
**Effort:** 2–3 days

## Goal

Handle public quote URLs and app-internal deep links.

## References

- `frontend/src/features/public/components/PublicQuotePage.tsx` — Public quote viewer.
- `frontend/src/App.tsx` — Route `/doc/:token`.

## Acceptance Criteria

- [ ] `https://stima.odysian.dev/doc/<token>` opens the app if installed, or falls back to web.
- [ ] Universal links (iOS) and app links (Android) configured.
- [ ] Internal deep link: `stima://quotes/capture` for shortcuts.

## Scope Notes

- Public `/doc/:token` remains web-compatible. Native deep linking should augment distribution, not break public web access.
