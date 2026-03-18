# Reference: Next.js Component Checklist

Use this checklist when scaffolding or reviewing components.

## Structure

- Container components orchestrate; presentational components render.
- Typed interfaces for all component props.
- Shared API types in one place.

## UX and Accessibility

- Loading, error, and empty states are present.
- Buttons and icon-only controls have clear labels.
- Keyboard interaction and focus styles are included.

## Data and State

- No raw `fetch` in components; use API client.
- Errors are handled and shown in UI.
- Session-expiry behavior is centralized.
