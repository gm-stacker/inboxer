---
name: kae-design-system
description: Use this skill for any frontend work in the React app — CSS changes, new components, styling, layout, or UI fixes. Enforces the KAE design system.
---

# KAE Design System Skill

## Note display rules — enforce on every frontend change

### Note title behaviour
- The note title display is READ ONLY — never an editable text input
- The title is derived from note content using getDisplayTitle() 
  and displayed as static text only
- Clicking the title does NOT make it editable
- Font size for derived title: 24px regular weight maximum — 
  never render the full first sentence at heading scale

### Note action buttons
- Maximum 3 action buttons visible at any time in note view
- Primary action: Re-analyze (amber accent)
- Secondary actions: Move to, Delete
- Synthesize Echoes moves to the right panel, not the note footer
- Never show Save Changes as a button — auto-save only, 
  confirmed by a subtle "Saved" indicator in the header
- Never show Status or Confidence fields in the note view — 
  these are internal metadata, not user-facing content
- Properties panel moves to the BOTTOM of the note, 
  below the note body content

### Note titles
- Always derive display title from note body content
- Strip the timestamp prefix `[DD-MM-YYYY HH:MM]` from display
- Never show CamelCase filenames as titles (e.g. 
  `SourcingCat6CablesFor10GbE` is wrong — derive from content)

### Properties panel
- Never show the YAML frontmatter properties panel in the note 
  view by default
- Properties/metadata are collapsed and hidden unless the user 
  explicitly expands them
- The user does not need to see `type`, `tags`, `body_hash`, 
  `entities` etc. in normal note viewing

### Sidebar structure
- One unified note list — no separation between an "Inbox" 
  section and a "Categories" section showing the same notes
- Categories are filters, not duplicate views
- Notes appear once, in one list, filtered by the active category
- Never show both a top-level note count section AND a categories 
  section simultaneously

### Theme
- Dark theme only — background `#0D0D0D`, never white or light grey
- Never revert to a light theme under any circumstances

## Mission
Maintain visual consistency across all UI components. Every frontend change must conform to this design system exactly. Never introduce new colours, fonts, or spacing values not defined here.

## Colour tokens — use these exact values, no others
- `--bg-base`: `#0b111e` — page background
- `--bg-surface`: `#0f172a` — sidebar, cards, modals, panels
- `--bg-raised`: `#1e293b` — chat bubbles, skeletons, hover states, tag chips
- `--bg-hover`: `rgba(255, 255, 255, 0.03)` — subtle row hover states
- `--border`: `#1e293b` — all dividers and drawer edges
- `--text-primary`: `#F8FAFC`
- `--text-secondary`: `#94a3b8` — muted text
- `--ui-accent`: `#6366f1` — primary UI interactive elements (indigo)
- `--ai-accent`: `#c9974a` — amber, used ONLY for AI-generated content
- `--destructive`: `#C0392B`

## AI accent rule — critical
The amber `#C9974A` accent is used ONLY for:
- Sparkle icons (✨) prefixing AI-generated content
- AI Memory Echoes left border
- Suggested Focus left border in briefing
- Toast notifications from [FLAG] responses
- The Generate button in Trip Briefing popup
- Focus ring outlines on interactive elements: `1px solid #C9974A`

Never use amber for user-generated content, headings, navigation, or decorative purposes.

## Typography
- Font: Inter (already loaded), fallback: system-ui
- Never introduce a new typeface
- Note titles: 24px regular weight — never bold
- Section labels: 11px uppercase, `letter-spacing: 0.08em`, `--text-muted` colour
- Body text: 15px, line-height 1.7
- Small labels: 13px, `--text-secondary`

## Spacing and layout
- Border radius: 8px on all components consistently
- Sidebar width: 260px fixed
- Right panel width: 320px
- Modal width: 640px, max-height 80vh
- No drop shadows except modals: `0 4px 24px rgba(0,0,0,0.4)`
- No gradients anywhere

## Component rules
- Note count badges: replaced with dot indicators only
- Active sidebar item: `--bg-raised` background + 2px `--ai-accent` left border
- Table headers: 11px uppercase, `--text-muted`, no background fill
- Table rows: 40px height, alternate rows `#1E1E1E`
- Empty states: single muted text line, no illustrations
- Transitions: 150–200ms ease, no bounce or spring animations
- Loading states: amber pulse on sparkle icon only, no spinners

## What never to do
- Never hardcode hex values outside this token list
- Never use bold for body text or note titles
- Never add decorative elements, illustrations, or icons for non-functional purposes
- Never use localStorage or sessionStorage
- Never introduce new npm packages for UI without flagging it