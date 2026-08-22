---
title: Design Tokens
description: Design tokens for the Stash Viewer application, derived from @stash/theme/tailwind.css.
---

# Design Tokens

## Color Tokens

All colors are defined as CSS custom properties in the theme and support light/dark mode variants.

### Semantic Colors

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--background` | #FAFAF9 | #141414 | Page background |
| `--foreground` | #1A1A1A | #F0F0F0 | Primary text |
| `--card` | #FFFFFF | #1C1C1C | Card backgrounds |
| `--card-foreground` | #1A1A1A | #F0F0F0 | Text on cards |
| `--primary` | #1A1A1A | #F0F0F0 | Buttons, primary actions |
| `--primary-foreground` | #FFFFFF | #000000 | Text on primary buttons |
| `--accent` | #ED3F1C | #ED3F1C | Highlights, CTAs, secondary actions |
| `--accent-foreground` | #FFFFFF | #FFFFFF | Text on accent elements |
| `--muted` | #F5F5F4 | #252525 | Disabled/inactive elements, secondary backgrounds |
| `--muted-foreground` | #737373 | #A3A3A3 | Secondary text, captions |
| `--border` | #E5E5E5 | #2C2C2C | Borders, dividers |
| `--input` | #E5E5E5 | #2C2C2C | Input field borders |

## Radius Tokens

A three-level hierarchy of border radius values controls the visual language:

| Token | Value | Pixels | Usage |
|-------|-------|--------|-------|
| `card` | `2rem` | 32px | Outer shell of SharedCard wrapper |
| `control` | `0.75rem` | 12px | All buttons, form inputs, inner boxes (Tailwind `rounded-xl`) |
| `indicator` | `9999px` | ∞ | Fully circular elements (ThemeSwitcher, avatar circles) |

### Implementation

- **SharedCard** uses `rounded-[2rem]` for the card outer shell
- **PrimaryButton**, **OutlineButton**, **SplitButtonGroup**, and export buttons in ShareDrawer use `rounded-xl` (12px)
- **ThemeSwitcher** uses `rounded-full` for circular elements

## Spacing Tokens

Spacing is derived from Tailwind's default scale, primarily using 4px (0.25rem) increments.

| Component | Property | Value | Breakpoint |
|-----------|----------|-------|-----------|
| SharedCard | width | max-w-160 (640px) | — |
| SharedCard | padding | — | — |
| SharedCardContent | padding | px-3 pb-3 | sm: px-5 pb-5 |
| SharedCardHeader | padding | pb-2 pt-6 | sm: pt-8 |
| SharedButtonArea | margin-top | mt-4 | — |
| SharedButtonArea | gap | gap-3 | — |
| SharedButtonArea | padding | px-3 | sm: px-5 |
| SharedButtonArea | width | max-w-160 (640px) | — |
| PrimaryButton | height | h-14 (56px) | — |
| OutlineButton | height | h-14 (56px) | — |
| SplitButtonGroup | height | h-14 (56px) | — |

## Typography Tokens

Font families and sizes are defined at the root level and applied throughout:

| Token | Value | Usage |
|-------|-------|-------|
| `--font-sans` | "Geist Sans" | All body text, buttons, labels |
| `--font-mono` | "Geist Mono" | Code blocks, JSON output |

### Type Scales

| Component | Size | Weight | Spacing |
|-----------|------|--------|---------|
| SharedCardHeader (title) | text-xl (1.25rem) | font-semibold (600) | tracking-tight |
| SharedCardHeader (title, sm) | text-2xl (1.5rem) | font-semibold (600) | tracking-tight |
| SharedCardHeader (caption) | text-xs (0.75rem) | font-semibold (600) | tracking-widest |
| Button text | text-base (1rem) | font-semibold (600) | — |
| TabListItem (title) | text-sm (0.875rem) | font-medium (500) | — |
| TabListItem (URL) | text-xs (0.75rem) | — | — |
| Export button label | — | font-medium (500) | — |
| Export button desc | text-xs (0.75rem) | — | — |

## Shadow Tokens

Shadows are used to create depth and hierarchy:

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-xl` | 0 1px 3px 0px rgb(0 0 0 / 0.1), 0 8px 10px -1px rgb(0 0 0 / 0.1) | SharedCard elevation |

### Implementation

- **SharedCard** uses `shadow-xl shadow-black/4` for subtle depth
- Other components use default Tailwind shadows as needed

## Layout

### Page Grid

Both TabViewer and NewStashForm use a centered column layout:

```
min-h-screen flex flex-col items-center p-3 pt-6 sm:pt-8
```

The dotted background pattern appears on the `body` element and shows through the layout since the wrapper divs now use `bg-transparent` (removed `bg-background`).

### Card Container

SharedCard provides a contained box that sits on top of the background:

- Max width: 640px
- Border: 1px solid `--border`
- Background: `--card`
- Radius: 2rem (32px)
- Shadow: `shadow-xl shadow-black/4`

### Button Container

SharedButtonArea creates a flex column for action buttons:

- Width: max-w-160 (640px)
- Gap between items: 12px (gap-3)
- Margin above content: 16px (mt-4)
- Padding: px-3 (sm: px-5)

## Responsive Breakpoints

All tokens use Tailwind's default breakpoints:

- `sm`: 640px
- Larger breakpoints (md, lg, xl) not currently in use

## Color Scheme

The theme supports automatic light/dark mode detection via the `.dark` class on the root element. All color tokens have paired values for both modes, ensuring consistent contrast and readability.
