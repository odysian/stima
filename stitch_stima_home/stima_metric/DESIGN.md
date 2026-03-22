# Design System Strategy: The Architectural Tradesman

## 1. Overview & Creative North Star
**Creative North Star: "The Precision Blueprint"**

For the tradesperson, a tool must be as reliable as a level and as sharp as a chisel. This design system moves away from the "softness" of consumer apps toward a high-end, editorial aesthetic that mirrors architectural drafting. We achieve this through **Organic Brutalism**: a marriage of rigid, 4px architectural geometry with a sophisticated, high-contrast palette. 

The layout breaks the "standard template" look by utilizing intentional asymmetry—heavy left-aligned typography contrasted with floating, glassmorphic action elements. We prioritize readability and "glove-friendly" touch targets, ensuring the interface feels professional, intentional, and premium.

---

## 2. Colors & Tonal Depth

This system rejects the "boxed-in" look of early web design. We define hierarchy through depth and background shifts rather than lines.

### Semantic Palette
*   **Primary (Forest Green):** `#065F46` | The color of action and authority. Use for FABs, primary CTAs, and active states.
*   **Destructive (Terracotta):** `#823F3A` | A muted, sophisticated clay tone for high-stakes actions like "Delete" or "Sign Out."
*   **Warning (Amber):** `#F59E3B` | High-visibility signal specifically reserved for AI confidence notes and flagging manual overrides.
*   **Surface (White):** `#FFFFFF` | The foundational "paper" of the blueprint.

### The Rules of Surface & Light
*   **The "No-Line" Rule:** 1px solid borders are strictly prohibited for sectioning. To separate a quote header from its line items, transition from `surface` (#FFFFFF) to `surface-container-low` (#EFF4FF). Let the change in value define the edge.
*   **Surface Hierarchy:** Use `surface-container-lowest` for cards to make them appear to sit "on top" of a `surface-container-low` background. This "nested" depth creates a tactile, high-end feel.
*   **The Signature Texture:** For Primary buttons and Hero sections, apply a subtle linear gradient from `primary` (#004532) to `primary-container` (#065F46). This adds a "weighted" feel that flat hex codes lack.

---

## 3. Typography: The Editorial Scale

We use a dual-font strategy to balance character with utility. **Space Grotesk** (Display/Headline) provides an architectural, mono-spaced rhythm, while **Inter** (Body/Label) ensures maximum legibility for complex quoting data.

| Level | Font | Size | Intent |
| :--- | :--- | :--- | :--- |
| **Display-LG** | Space Grotesk | 3.5rem | Impactful quote totals |
| **Headline-SM** | Space Grotesk | 1.5rem | Section titles (e.g., "Materials") |
| **Title-MD** | Inter (Bold) | 1.125rem | Item names / Client names |
| **Body-MD** | Inter | 0.875rem | Descriptions and standard text |
| **Label-SM** | Inter | 0.6875rem | Metadata, timestamps, and status labels |

**Editorial Note:** Always use tight letter-spacing (-0.02em) for Space Grotesk to maintain the "premium" architectural feel.

---

## 4. Elevation & Depth

### The Layering Principle
Depth is achieved by stacking. A typical mobile screen should follow this stack:
1.  **Level 0:** `surface` (The base).
2.  **Level 1:** `surface-container-low` (Content groupings/Background sections).
3.  **Level 2:** `surface-container-lowest` (Interactive cards/List items).

### Ambient Shadows & Glassmorphism
*   **Shadows:** Shadows must be "Ghost Shadows." Use a 24px blur, 0px offset, and 4% opacity of the `on-surface` color. It should feel like a soft glow, not a drop shadow.
*   **Glassmorphism:** Floating elements (like the Bottom Navigation or FAB background) should use a semi-transparent `surface` color with a `backdrop-filter: blur(12px)`. This integrates the UI with the content beneath it.
*   **The "Ghost Border":** If accessibility requires a stroke, use `outline-variant` at 15% opacity. Never use full-contrast borders.

---

## 5. Components

### Buttons
*   **Primary:** Forest Green gradient, 4px radius, `on-primary` (White) text. High-contrast and weighted.
*   **Destructive:** Terracotta flat fill. Reserved for permanent actions.
*   **Secondary/Ghost:** Slate Grey text with no fill. Use for "Cancel" or "Back."

### Status Badges (The "Blueprint" Pill)
Badges use 4px rounded corners and a low-opacity fill of their semantic color with high-contrast text.
*   **Draft:** Slate Grey background (10% opacity), Slate Grey text.
*   **Ready:** Light Emerald background (10% opacity), Forest Green text.
*   **Shared:** Light Sky Blue background (10% opacity), Deep Blue text.

### Input Fields
*   **Default:** No border. Fill with `surface-container-high`. 4px radius.
*   **Focused:** 2px solid `primary` (Forest Green) border. The label shifts to `primary` color to signal active engagement.
*   **Error:** Background shifts to `error-container` (#FFDAD6) with a 1px `error` border.

### Banners
*   **AI Confidence (Warning):** Amber background, floating (elevated), using the Glassmorphism rule to sit above the quote data. Use `label-md` for text.
*   **Form Errors:** Red background, anchored to the top of the viewport.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use vertical white space (1.75rem or 2.25rem) to separate sections instead of divider lines.
*   **Do** align all typography to a strict left-margin to mimic technical drawings.
*   **Do** use the 4px radius consistently across buttons, inputs, and cards to maintain the "Architectural" brand voice.

### Don’t
*   **Don’t** use shadows on every card. Rely on tonal shifts (White on Light Grey) first.
*   **Don’t** use generic icons. Use thin-stroke (1.5pt) linear icons to match the Space Grotesk weight.
*   **Don’t** use 100% black text. Use `on-surface` (#0D1C2E) for a softer, more premium high-contrast feel.