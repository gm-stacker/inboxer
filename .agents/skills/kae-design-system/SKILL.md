---
name: kae-design-system
description: Use this skill when modifying ANY frontend CSS, component styling, layout structure, colour, spacing, typography, or visual appearance in Inboxer. Also use when creating new UI components or reviewing whether a UI change conforms to the design system.
---

# Inboxer Design System

## DO NOT USE THIS SKILL FOR
- Backend C# changes with no frontend impact
- Writing or modifying test files only
- Non-visual TypeScript logic changes

---

## Design Tokens

These are the only permitted values. Do not invent new values.

```css
/* Backgrounds */
--bg-base: #0b111e          /* main content area background */
--bg-sidebar: #0d1526       /* sidebar background */
--bg-surface: #0f172a       /* right panel, cards */
--bg-raised: #1e293b        /* elevated surfaces, hover states */

/* Borders */
--border: #1e293b

/* Text */
--text-primary: #f8fafc
--text-secondary: #94a3b8
--text-muted: #64748b

/* Accent colours */
--ui-accent: #6366f1        /* indigo — interactive UI elements, focus rings */
--ai-accent: #c9974a        /* amber — Re-analyze button, Memory Echo borders, active sidebar item */

/* Legacy aliases (still active in App.css — do not remove) */
--c-bg: #0b111e
--c-sidebar: #0f172a
--c-text: #f1f5f9
--c-text-muted: #94a3b8
--c-border: #1e293b
--c-accent: #6366f1
--c-accent-hover: #818cf8
--c-active: #1e293b
--c-ai-accent: #c9974a

/* Layout */
--sidebar-w: 260px
```

---

## Layout Structure

### Three-column layout
```
.app-container (display:flex, flex-direction:row)
  ├── .sidebar (width: var(--sidebar-w), flex-shrink:0)
  ├── [content column] (flex:1)
  └── [right panel] (width:320px, flex-shrink:0)
```

**CRITICAL:** `.sidebar`, content column, and right panel are DIRECT children of `.app-container`.
Any change that moves one of these elements to a different parent will break the three-column layout.
This must be called out explicitly in the spec's layout impact assessment.

### Content column padding
- `.note-editor` has `padding: 32px` — this is the content padding
- Do NOT add padding to the content column's container
- Do NOT share padding with the right panel

---

## Component Rules

### Buttons
| Class | Purpose | Colour |
|---|---|---|
| `.btn-primary` | Default action | `--ui-accent` |
| `.btn-reanalyze` | AI re-analysis trigger | `--ai-accent` (amber) border + text |
| `.btn-warning` | Destructive/caution action | `--c-ai-accent` hover state |
| `.btn-danger` | Delete | `--destructive` (defined in component) |

Button rules:
- Never use inline `style=` for button colours — use class-based styling only
- Never invent a button class — use from this list only
- `btn-reanalyze` must have: `border: 1px solid var(--c-ai-accent); color: var(--c-ai-accent)`

### Sidebar items
- Active state: `background: var(--c-active)`, `border-left: 2px solid var(--c-ai-accent)`
- Normal state: no background, no border
- Count badge: `color: var(--text-muted)`

### Memory Echo cards
- Border: `1px solid var(--ai-accent)` (amber)
- Background: `var(--bg-surface)`

### Capture panel chips (Plan / Reminder / Idea)
- Must render with NEUTRAL styling — no colour differentiation
- Background: `var(--bg-raised)`
- Text: `var(--text-secondary)`
- Do NOT use green, blue, or any accent colour for chips

---

## CSS Rules

### What you may do
- Add new CSS classes for new elements
- Modify an existing class's property if the spec explicitly names it
- Use CSS custom properties from the token list above

### What you may NOT do
- Invent CSS class names (read the file, use what exists)
- Add `!important` without spec explicitly requiring it
- Use Tailwind utility classes — this project uses CSS custom properties only
- Use inline `style=` attributes except for genuinely dynamic computed values
- Add shadows, gradients, or border-radius values not in the existing codebase

### Before deleting any class
```bash
grep -r "class-name" frontend/src/
```
If the class appears in more than one file: do NOT delete it. Add new classes alongside.

---

## Verification requirements for UI changes

Every UI acceptance criterion must be verified with:
- Exact DevTools selector confirming element structure (not "looks right")
- Exact CSS property value observed
- Before/after comparison for layout changes

❌ Never accept: "refresh the browser and check"
✅ Require: "DevTools confirms `.note-action-bar` is `display:flex` with `.note-action-bar-spacer` having `flex:1`"
