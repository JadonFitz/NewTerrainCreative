---
version: alpha
name: New Terrain Creative
description: Cinematic editorial dark system. Near-black canvas, warm parchment type, one muted gold accent. Cormorant Garamond light display with an italic key word, Inter for body and UI. Flat surfaces divided by hairlines, no shadows or glows, slow expo-out motion.

colors:
  black: "#0A0A0A"
  surface: "#141414"
  card: "#1C1C1C"
  raised: "#111010"
  gold: "#C8A96E"
  gold-dim: "#A08A57"
  parchment: "#F5F0E8"
  soft: "#A09890"
  muted: "#8B847D"
  faint: "#5F5A55"
  line: "#1e1e1e"
  line-strong: "#2a2826"
  ok: "#8FBF9A"
  warn: "#D9A866"

typography:
  display:
    fontFamily: "'Cormorant Garamond', Georgia, serif"
    fontWeight: 300
    note: "Stacked headlines, second or key word in italic. Sizes use clamp(), e.g. clamp(36px, 6.5vw, 88px) for heroes."
  body:
    fontFamily: "'Inter', -apple-system, sans-serif"
    fontWeight: [300, 400, 500]
  label:
    fontFamily: "'Inter', sans-serif"
    textTransform: uppercase
    letterSpacing: "0.2em to 0.24em"
    fontSize: "11px to 12px"

rounded:
  none: 0
  hairline: 2px
  small: 4px
  pill: 50%

motion:
  ease: "cubic-bezier(0.16, 1, 0.3, 1)"
  ease-ui: "cubic-bezier(0.4, 0, 0.2, 1)"
  duration: "0.4s to 0.8s"
---

# New Terrain Creative design system

Working file, not deployed. Source of truth is the code: every page defines these tokens in its own `:root`. Reference the custom properties, never raw hex.

## North star

A film studio's lobby, not an agency's sales page. Dark, quiet, expensive. Footage does the talking; type is set like a title card.

## Rules

- Background is always `--black` `#0A0A0A`. Never pure black, never a blue or warm off-black.
- One accent: `--gold` `#C8A96E`. Never swap for yellow, orange or bright gold. Use it sparingly: the CTA, a rule, an italic word.
- Display headlines: Cormorant Garamond 300, stacked, with the key word in italic.
- Body and UI: Inter 300, 400 or 500 only.
- Labels and eyebrows: Inter uppercase, wide tracking (0.2em to 0.24em), small size, `--muted`.
- Sections are divided by `1px solid var(--line)` only. No gradients, ornaments or shadows between sections.
- No drop shadows, box shadows or glows on content. (A few legacy modals and the owner dashboard use one; do not spread them.)
- Buttons: gold fill (`background: var(--gold); color: var(--black)`) or bare text with a 1px underline. Nothing else.
- Header: wordmark left, single CTA right, fixed, transparent until scroll. No nav bar, no hamburger.
- Corners are square or nearly square (0 to 4px). Circles only for dots, avatars and play buttons.
- Work cards on hover: background scales to 1.04, corner action reveals, meta slides up, 0.4s to 0.8s on the expo-out ease.
- Scroll reveals use the existing `.reveal` / `.reveal.visible` IntersectionObserver pattern. No scroll-jacking, parallax, preloaders or GSAP in the static site.
- Video loops: MP4, muted, autoplay, playsinline, with a poster, under about 8 seconds and 3MB.

## Do

- Let real footage and stills fill the frame.
- Keep copy short and bold. One idea per section, one CTA per page.
- Check mobile first: 16px gutters, no horizontal scroll, tap targets 44px or more.

## Don't

- Purple, neon, gradient meshes, glassmorphism, bento grids of icons, emoji bullets.
- Generic stock imagery or AI-looking illustration.
- Em dashes, anywhere.

## Known drift

- `brand-builder-pro.html` sets `--muted: #6B6560`; every other page uses `#8B847D`. Check contrast before reusing the darker value.
- `owner.html` is an internal dashboard and carries extra tokens (`--raised`, `--rail`, `--soft`, `--faint`, `--ok`, `--warn`). Those are fine for internal tools, not for public pages.
