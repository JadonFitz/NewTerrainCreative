# New Terrain Creative site: instructions for Claude

This repo is newterraincreative.com. Static HTML pages at the root, Vercel functions in `api/`, deployed straight from the repo root. Anything not in `.vercelignore` is public.

## Hard rules (site)

- No em dashes anywhere: pages, copy, comments, commit messages. Use commas, periods, colons or ellipses.
- Offer facts (prices, counts, deadlines) live only in `assets/offer.js`. Change it first, then pages.
- Run `python3 scripts/preflight.py` before every push. It must pass.
- Never link a raw Google Calendar. Booking goes through iClosed.
- Brand system: `DESIGN.md`. Product truth and audiences: `PRODUCT.md`. Legacy rules: `cursorrules`. Read them before any design work. Real code beats all three when they disagree, and fix the doc.
- New private folders or root `.md` files must be added to `.vercelignore`.

## Design toolkit

Five tools are installed in this repo so design work stops looking generic. Use them in this order.

| Step | Tool | Where | Use it for |
| --- | --- | --- | --- |
| 1. Context | **Impeccable** | `.claude/skills/impeccable` (`/impeccable`) | Run `.claude/skills/impeccable/scripts/impeccable context` at the start of any UI task. Commands: `shape` (plan a new page), `audit` / `critique` (review), `polish`, `bolder`, `quieter`, `typeset`, `layout`, `animate`, `harden`, `adapt` (mobile), `live` (in-browser editor). |
| 2. Direction | **Taste Skill** | `.claude/skills/design-taste-frontend` and `redesign-existing-projects` | Art direction and anti-slop rules for new landing pages (`design-taste-frontend`), or a full audit-then-fix pass on an existing page (`redesign-existing-projects`). |
| 3. Reference | **Awesome Design.md** | `.claude/skills/design-md-library` | Borrow a specific pattern from a real site (RunwayML, Apple, Linear, Stripe and 80 more). Read one or two files only. |
| 4. Verify | **Playwright CLI** | `.claude/skills/playwright-cli` (`npx @playwright/cli`) | Open the page in a real browser, screenshot desktop and mobile, click through forms, read console errors. |
| 5. 3D (on request) | **img2threejs** | `.claude/skills/img2threejs` | Rebuild an object from a photo as a procedural Three.js model in code. Only when Jadon asks for 3D. Needs Python 3.10+. |

### How they fit with the NTC brand

The tools bring their own taste. NTC's brand wins every conflict:

- Keep NTC tokens: `--black #0A0A0A`, `--gold #C8A96E`, `--parchment #F5F0E8`, Cormorant Garamond 300 display with an italic key word, Inter body. If a skill suggests a new palette, font, gradient or shadow, translate the idea into NTC tokens instead.
- Taste Skill's image search and Impeccable's "roll" of visual worlds are for new territory only. Ignore them for pages that should match the current site unless Jadon asks for a redesign.
- On a redesign request, still keep `PRODUCT.md` truths, the offer file, the forms and the CTAs.

### Workflow for any page or design change

1. `impeccable context`, then read `DESIGN.md` and `PRODUCT.md`.
2. New page: `/impeccable shape`, then build with `design-taste-frontend` rules. Existing page: `redesign-existing-projects` audit or `/impeccable audit`, then fix.
3. Serve and look at it before calling it done. The local server has no clean URLs, so use `<page>.html`:
   ```bash
   python3 -m http.server 4173 &
   npx @playwright/cli open http://localhost:4173/<page>.html   # cloud: add --config=.claude/playwright-cloud.json
   npx @playwright/cli resize 1440 900 && npx @playwright/cli screenshot --filename=<page>-desktop.playwright-shot.png
   npx @playwright/cli resize 390 844 && npx @playwright/cli screenshot --filename=<page>-mobile.playwright-shot.png
   npx @playwright/cli eval "() => document.documentElement.scrollWidth > window.innerWidth"   # must be false
   npx @playwright/cli console
   npx @playwright/cli close
   ```
   Read the screenshots back. Check: no horizontal scroll on mobile, CTA visible above the fold, text contrast, video posters load. Locally, `/api/track` 501s and the Meta pixel fails to load; those errors are expected. Screenshots match `*.playwright-shot.png` and are gitignored; delete them when done.
4. `.claude/skills/impeccable/scripts/impeccable detect --json <changed files>` and fix what it flags (the hook also runs this after edits). NTC signatures are already ignored in `.impeccable/config.json` and must stay: italic serif key word, wide-tracked uppercase labels, eyebrow above the headline, Inter as body font. Do not "fix" those. Real issues it catches on current pages: labels at 9 to 10px (floor is 11px) and muted text with low contrast.
5. `python3 scripts/preflight.py`.

### Setup notes

- First run on a new machine: `npx @playwright/cli install-browser chromium` if no browser is found. The Impeccable engine downloads itself from GitHub releases once, checksum verified.
- In cloud sessions, Chromium is preinstalled at `/opt/pw-browsers` and runs as root, so pass `--config=.claude/playwright-cloud.json` to `open` (it disables the Chromium sandbox; do not use it on a personal machine). Google Fonts is blocked there, so headlines render in the Georgia fallback; that is the sandbox, not a bug. Impeccable's roll API (impeccable.style) may be blocked too; everything else works.
- Impeccable telemetry is off for this project (`.impeccable/config.json`).
- Updating the tools: re-copy from upstream (Leonxlnx/taste-skill, pbakaus/impeccable, voltagent/awesome-design-md, img2threejs/img2threejs) or run `npx impeccable update` and `npx @playwright/cli install --skills`.
