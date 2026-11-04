# Creator Assist: Bold Creator design (DESIGN.md)

The look of every Creator Assist app: confident, high-contrast and friendly, built for
reading money at a glance. Reference: `design/style/` (home-directions.html, bold-creator.png).

**Where the tokens live**
- Web: CSS variables in `apps/web/src/app/globals.css` (the source of truth).
- iOS and Android: `packages/shared/src/tokens.ts`, the same values. Change both together.

## Colour

Light is the default; dark follows the phone's setting (and the Appearance switch on web).

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | #F6F4EE | #111111 | Screen background |
| `surface` | #FFFFFF | #1C1C1C | Cards, sheets |
| `surface2` / `surface3` | #EFECE4 / #E3DFD5 | #1E1E1E / #2E2E2E | Tiles, inputs, secondary buttons |
| `line` | #E4E0D6 | #2A2A2A | Hairlines; card border in light mode only |
| `text` / `text2` / `muted` | #111 / #2E2E2E / #5A5A5A | #FFF / #D4D4D4 / #BDBDBD | Body, secondary, captions |
| `primary` (coral) | #FF4D4D | #FF4D4D | Primary buttons, "overdue" |
| `accent` (sunflower) | #FFD60A | #FFD60A | Hero card, selected tab, selected chip |
| `navBg` | #111111 | #1E1E1E | Bottom tab bar |

Status stickers use the same fills in both themes, with #111 text: over #FF4D4D, info
#7DD3FC, ok #86EFAC, new #C4B5FD; "mute" is #E7E3DA (light) / #333 (dark).
**Red and yellow are only for things that need action** (overdue, missing). Everything
else sits on the neutral surfaces.

## Type

Space Grotesk (SIL OFL), bold for numbers. Sizes in pt (= CSS px):

| Role | Size | Notes |
|---|---|---|
| Hero amount | 54 | -0.045em, line height 1 |
| H1 / H1 on sub-screens | 34 / 26 | |
| Tile number | 28 | -0.03em |
| H2 | 22 | -0.02em |
| List amount | 19 | -0.03em |
| Body | 15 | |
| Chip / small / sticker / tab label | 14 / 13 / 12 / 11 | |

Support large text: layouts wrap and grow, nothing is clipped at the largest Dynamic
Type / Android font scale.

## Shape and space

- Radii: cards 24, buttons 24 (pill-like), inputs 16, avatars 16, tab items 18, chips 999.
- Spacing scale: 4, 6, 8, 10, 12, 16, 20, 24. Screens use 16 side padding, 12 between blocks.
- No drop shadows, except "pop" stickers: a hard 2×3 offset in #111.
- Tap targets: at least 44pt on iOS, 48dp on Android.

## Components (same names on web and native)

- **Hero card**: sunflower card on Home: "Money owed to you", the amount due in 54pt with
  "due", "₹Y after TDS" below, and stickers ("3 open invoices", "₹X overdue").
- **Tiles**: neutral `surface2` boxes with a label and a 28pt number.
- **List rows**: avatar (brand initials on a stable colour), title, one-line detail, and on
  the right "₹X due" with "₹Y after TDS" in small text, plus a status chip.
- **Chips / stickers**: rounded status tags; filter chips wrap onto more lines rather than
  scrolling sideways.
- **Buttons**: primary coral with #111 text; secondary `surface2`; destructive outlined coral.
- **Bottom tabs**: Home, Deals, Brands, Tax, Settings on a #111 bar; the selected tab is a
  sunflower pill.
- **Sheets**: bottom sheets on `surface` with a scrim; a deal's next actions pin to a bar
  above the tabs.

## Platform notes (iOS and Android apps)

- Respect safe areas (notch, Dynamic Island, home indicator); Android draws edge to edge
  with the system bars over the app's background.
- Follow each platform's conventions where they differ: iOS swipe-back and native date
  picker; Android back button and Material date picker.
- Status bar text follows the theme (dark text on light, light on dark).
