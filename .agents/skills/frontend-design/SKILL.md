---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics.
license: Complete terms in LICENSE.txt
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Choose a clear aesthetic direction grounded in the interface's purpose. For functional/product UI (dashboards, tools, admin, SaaS), default to restraint: think Linear, Raycast, Stripe, GitHub. For expressive/marketing contexts, consider editorial, refined luxury, or purposeful minimalism. Avoid "maximalist chaos" as a direction — it produces AI-looking outputs.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this feel genuinely human-designed? Aim for interfaces that feel considered and purposeful, not generated.

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. The key is intentionality — restrained, functional interfaces are as valid as expressive ones. Never choose a style because it's easy to generate.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: For product/functional UI, use system fonts or a clean sans-serif at readable sizes (14-16px body). Clear hierarchy with standard heading sizes — no eyebrow labels, no uppercase + letter-spacing decorations, no mixed serif/sans combos as a "premium" shortcut. For expressive/marketing contexts, distinctive font pairings are appropriate, but avoid overused choices (Space Grotesk, Inter used decoratively).
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Keep transitions simple and fast: 100-200ms ease, opacity/color changes only. No bouncy spring animations, no transform effects (translateX, scale), no dramatic entrance sequences. Subtle hover states are fine; surprise-and-delight animations are not.
- **Spatial Composition**: Use consistent spacing scales (4/8/12/16/24/32px). Standard grid and flex layouts. Predictable structure with clear content hierarchy. No creative asymmetry, random gaps, or layouts designed to look expensive rather than work well.
- **Backgrounds & Visual Details**: Prefer solid backgrounds with subtle borders over gradients, glass effects, or frosted panels. Shadows should be minimal: max `0 2px 8px rgba(0,0,0,0.1)`. No colored shadows, no glow effects, no grain overlays, no conic-gradient decorations. Surface differentiation through color value, not effects.

NEVER produce cookie-cutter AI-generated aesthetics: clichéd color schemes (purple gradients on white), predictable layouts, or design choices made because they're easy to generate rather than right for the context. Vary between light and dark themes and different aesthetics. NEVER converge on overused choices (Space Grotesk, Inter as a display font) across generations.

## Component Standards (Uncodixfy Defaults)

For product UI, apply these concrete constraints unless the context explicitly calls for something different:

- **Sidebars**: 240-260px fixed width, solid background, simple border-right. No floating shells, no rounded outer corners, no workspace CTA blocks.
- **Buttons**: Solid fill or simple border, 8-10px radius max. No pill shapes, no gradient backgrounds.
- **Cards**: 8-12px radius max, subtle 1px border, shadow max `0 2px 8px rgba(0,0,0,0.1)`. No floating effect, no glow.
- **Inputs**: Solid borders, simple focus ring. No animated underlines, no floating labels.
- **Badges**: Only when functional. Small text, simple border or fill, 6-8px radius, no glows.
- **Borders**: 1px solid, subtle colors. No thick decorative borders, no gradient borders.
- **Icons**: 16-20px, monochrome or subtle color. No decorative icon backgrounds.
- **Color**: When no palette is provided, select from a predefined scheme rather than inventing combinations. Prefer calm, muted tones. Avoid blue-heavy dark modes with cyan accents.

**Hard bans for product UI**: glassmorphism, frosted panels, pill overload, hero sections inside dashboards, eyebrow labels (`MARCH SNAPSHOT`-style), decorative copy as page headers, transform animations on hover, donut charts as decoration, KPI card grids as the default layout, status dots via `::before` pseudo-elements, gradient pipeline bars, colored trend indicators.

**IMPORTANT**: Functional product UI demands restraint and precision — clean hierarchy, honest components, no decoration that doesn't serve the user. The hardest design choice is usually the simpler one. Execute that well.

Remember: the goal is UI that feels like a human designer made it — considered, purposeful, and honest. That means resisting default AI moves: no oversized border radii, no pill shapes everywhere, no hero sections inside dashboards, no decorative copy, no metric-card grids as the first instinct. If a UI choice feels like a default AI move, find the cleaner option.