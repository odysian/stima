**Parent Spec:** #150

**Issue Wiring:** parent Spec is `#150`. This Task is the first child task in the sequence and has no upstream task dependency.

## Summary
Implement the dark-mode foundation for Stima: theme preference model, persistence, effective-theme resolution, pre-React boot behavior, the minimal baseline CSS needed for a visually correct first paint, and the Settings theme control.

## Why
All later dark-mode work depends on one exact answer to theme resolution, first paint, and preference behavior. Without this foundation, later Tasks will either duplicate logic or silently diverge.

## Problem Framing
- Goal: establish the locked `System / Light / Dark` model end to end.
- Non-goals: broad route-by-route dark visual calibration, shared primitive conversion beyond what is required for boot/preference plumbing, public screen polish.
- Constraints:
  - effective theme is applied on `<html>`
  - `System` follows `prefers-color-scheme`
  - `Light` forces the current light theme
  - `Dark` forces the dark theme
  - theme preference is stored in `localStorage` at key `stima-theme`
  - invalid or unexpected `stima-theme` values are treated as `system`
  - saved preference is reapplied on reload
  - while preference is `system`, the app follows live OS theme changes during an open session
  - first paint must use the correct theme before React mounts
  - this Task owns the minimal selector + baseline token scaffolding needed so first paint is visually correct
  - `color-scheme` must match the effective theme
  - Settings includes the user-facing `Theme` control using the segmented control pattern

## Proposed Implementation Plan
1. Add preference resolution/storage plumbing for `system`, `light`, and `dark` using `localStorage` key `stima-theme`.
2. Add a small inline boot script in `frontend/index.html` to set `<html>` theme state and `color-scheme` before React mounts.
3. Add the minimal selector/baseline token scaffolding needed so `System`, `Light`, and `Dark` produce a visibly correct first paint before the full remap lands.
4. Wire the effective theme into app runtime so Settings changes apply immediately and persist.
5. Add the `Theme` segmented control in Settings with `System`, `Light`, and `Dark`.
6. Add targeted tests for preference resolution and light/dark/system behavior where practical.

## Decision Locks (Before Implementation)
1. Theme model is exactly `System / Light / Dark`.
2. Theme is applied on `<html>`, not per-screen and not only inside React.
3. Missing preference falls back to OS preference.
4. Explicit preference overrides OS preference.
5. The Settings toggle is part of this Task, not deferred.
6. Theme preference is stored only in `localStorage` under key `stima-theme`.
7. The Settings theme control uses the segmented control pattern.
8. While preference is `System`, OS theme changes should update the app live during the session.
9. Invalid or unexpected `stima-theme` values are treated as `system`.

## Acceptance Criteria
- [ ] Theme preference storage supports exactly `system`, `light`, and `dark`.
- [ ] Effective theme is applied on `<html>`.
- [ ] Invalid or unexpected `stima-theme` values are treated as `system`.
- [ ] Saved preference is reapplied on reload.
- [ ] Missing or `system` preference follows `prefers-color-scheme`.
- [ ] While preference is `System`, OS theme changes update the app live during the session.
- [ ] Boot logic runs before React mounts and prevents visible flash of the wrong theme.
- [ ] This Task includes the minimal selector/baseline token scaffolding required for a visibly correct first paint in `System`, `Light`, and `Dark`.
- [ ] `color-scheme` is set with the effective theme.
- [ ] Explicit light override support includes a `[data-theme="light"]` block that sets `color-scheme: light`.
- [ ] Settings includes a `Theme` control with `System`, `Light`, and `Dark`.
- [ ] Settings theme control uses the segmented control pattern.
- [ ] Changing the theme in Settings updates the effective theme immediately.
- [ ] Explicit `Light` selection forces the current light theme even on a dark OS setting.
- [ ] This Task does not attempt full route-by-route visual dark-mode calibration.
- [ ] `make frontend-verify` passes.

## Verification
```bash
make frontend-verify
```

Manual checks:
1. Load the app with no saved preference on a dark OS and confirm first paint is dark.
2. Load the app with no saved preference on a light OS and confirm first paint is light.
3. Switch to `Dark` in Settings and reload; confirm dark persists.
4. Switch to `Light` in Settings on a dark OS and reload; confirm light persists.
5. Switch to `System`, reload, and confirm the app returns to OS-driven behavior.
6. Switch to `Dark`, then switch back to `System`, reload, and confirm the app follows the OS again with no lingering explicit dark override on `<html>`.
7. While the app remains open in `System`, change the OS theme and confirm the app updates live without needing a reload.
8. Set `stima-theme` to an invalid value, reload, and confirm the app falls back to `System` behavior rather than getting stuck.

## Labels
- type:task
- area:frontend
- area:profile

## Suggested Issue Command
```bash
gh issue create \
  --title "Task: Dark mode foundation, boot behavior, and Settings preference" \
  --label "type:task,area:frontend,area:profile" \
  --body-file plans/2026-04-01/task-dark-mode-01-foundation-settings.md
```
