---
name: design-md-library
description: Library of 80+ DESIGN.md files describing real sites' design systems (Stripe, Linear, Apple, Vercel, RunwayML, Tesla, Nike and more). Use when you want a reference for a specific pattern, layout, type scale, motion or component treatment to borrow for an NTC page, or when the user names a brand whose look they want to learn from.
---

# Design reference library

From VoltAgent's awesome-design-md (MIT, see LICENSE). Each folder in `library/` holds one `DESIGN.md`: YAML frontmatter tokens (colors, typography, radius, spacing, components) plus prose on layout, motion and do's and don'ts for that brand.

## How to use it on the NTC site

1. The NTC system in the repo root `DESIGN.md` always wins. These files are references for patterns, never a replacement palette or font stack.
2. Borrow structure, not skin: a section rhythm, a type scale ratio, how a pricing block is laid out, a hover behavior, a motion timing. Re-express it in NTC tokens (`--black`, `--gold`, `--parchment`, Cormorant Garamond plus Inter).
3. Pick references that match NTC's world. Good fits for a dark cinematic studio: `runwayml`, `apple`, `spacex`, `tesla`, `bugatti`, `ferrari`, `lamborghini`, `bmw-m`, `nike`, `wired`, `theverge`, `framer`, `linear.app`, `vercel`, `raycast`, `elevenlabs`. For forms, checkout and pricing clarity: `stripe`, `cal`, `mercury`, `wise`. For internal dashboards like `/owner`: `linear.app`, `posthog`, `sentry`, `supabase`.
4. Read only the one or two files you need (`library/<brand>/DESIGN.md`). They are long.
5. Never copy a brand's logo, wordmark, product names or signature imagery, and never make an NTC page that could be mistaken for that brand.

List what is available with `ls .claude/skills/design-md-library/library`.
