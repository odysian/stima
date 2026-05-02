## Reviewer Handoff: SPEC-001 React Native / Expo Native Client

**Spec path:** `plans/react-native/SPEC-001-rn-expo-rewrite.md`
**Current status:** Reviewer-handoff ready (two review rounds applied). Needs final in-repo accuracy pass before issue slicing.
**Your job:** Read the spec, verify it against actual repo files, and report `APPROVED` or `ACTIONABLE`.

### What to verify

1. **File references are real and current.** Every `frontend/src/...` and `backend/app/...` path in the spec must exist on current main. If a path moved or a file was renamed since the spec was drafted, flag it.
2. **Backend auth contract is accurate.** Check `backend/app/features/auth/api.py` and `backend/app/features/auth/service.py`. The spec claims cookie+CSRF auth is untouched and mobile endpoints are additive. Verify no existing route or dependency would accidentally break.
3. **Audio format claim is accurate.** Check `backend/app/integrations/audio.py` — `infer_audio_format()`, `SUPPORTED_AUDIO_FORMATS`, `normalize_and_stitch()`. Confirm the backend already handles M4A/AAC/MP4 and normalizes to WAV, so the spec's risk framing is correct.
4. **PDF flow claim is accurate.** Check `backend/app/features/quotes/service.py` — `start_pdf_generation`, `get_pdf_artifact`. Confirm the spec correctly describes POST job → poll → GET artifact.
5. **No unstated breaking changes.** The spec says "backend remains compatible with existing PWA without regressions." Verify no proposed mobile endpoint or dependency change would violate this.
6. **Decision Locks are resolvable.** Check if the five Phase 0 decision locks (server state, styling, navigation, local storage, audio options) have a clear default or if any need more context from the repo.

### What NOT to do

- Do not implement code.
- Do not create GitHub issues or Tasks.
- Do not modify the spec unless you find a clear factual error (path mismatch, contract misstatement).

### Return format

```
Verdict: APPROVED | ACTIONABLE

Findings:
- [ ] ... (only if ACTIONABLE)
```

If `ACTIONABLE`, list only factual errors or gaps that would mislead an implementation agent. Wording preferences or style nits are out of scope.

If `APPROVED`, add a one-paragraph lightweight tutoring handoff summarizing the key contracts an implementation agent must respect (auth isolation, audio format validation in Phase 0, foreground-first outbox, PDF job lifecycle).
