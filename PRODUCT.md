# Product

<!-- impeccable:product-schema 1 -->

Working file, not deployed (.vercelignore). Read by the Impeccable design skill and by any Claude session doing design work on this site.

## Platform

web

## Stack

Static HTML pages at the repo root, one self-contained file per page with inline CSS and vanilla JS. Vercel serverless functions in `api/` (Node), Supabase for leads, iClosed for call booking. No build step, no framework. Deployed by Vercel straight from the repo root, so anything not listed in `.vercelignore` is public.

## Users

Two audiences:

1. **Founders and business owners in LA (and beyond) who want to grow their personal brand.** They arrive from Meta static ads and landing pages, already suspect their brand is invisible, and want one team that can handle cinema-grade production, ads, raw day-in-the-life content and posting instead of juggling freelancers. Many are high-earning operators; the aim is to land bigger clients up to Fortune 500 level.
2. **Local service businesses on the volume side** (contractors, cosmetic dental, med spas, pest control) who want Meta ads plus content plus a funnel that books jobs. They care about leads and booked revenue, not film credits.

Existing clients also land on onboarding, welcome and project pages after paying.

## Product Purpose

New Terrain Creative (NTC) is an LA-based video production and social media agency run by filmmaker Jadon Cal Fitzpatrick. The site's job is to turn a cold visitor into a booked, qualified call (or a paid trial) and to make NTC feel like a boutique creative studio with real film pedigree, not a generic agency. Success is booked calls from qualified leads (budget at or above the minimum) and closed retainers.

## Positioning

A filmmaker-led studio: festival-level storytelling applied to personal brands and ads. Jadon is the creative director that every project passes through, with a team behind him. "Nobody buys from a logo" is the core founder argument: people buy from people, and a founder with a personal brand compounds growth (Hormozi, GaryVee, Oprah as reference points).

## Operating Context

Pages are built by prompting Claude Code. Offers and prices live in `assets/offer.js` and are checked by `scripts/check-offer.py` and `scripts/check-claims.py`; change the offer file first, then pages. `python3 scripts/preflight.py` must pass before any push.

## Capabilities and Constraints

- Offer ladder, prices, deliverable counts and deadlines come only from `assets/offer.js`. Never hardcode or invent a number on a page.
- Booking goes through iClosed. Never link a raw Google Calendar.
- Every booking form keeps its budget disqualifier.
- No em dashes anywhere, including code comments. Use commas, periods, colons or ellipses.
- No analytics, cookie banners or tracking scripts without explicit instruction.

## Brand Commitments

Cinematic editorial: dark, minimal, precise, film-adjacent. Voice is direct, warm and matter of fact, talks about what NTC will do for the client and the money they lose without a brand. Three words: **cinematic, confident, human**.

Avoid:
- SaaS and agency-template looks: purple or neon gradients, glassmorphism, glowing cards, icon-grid feature sections, stock "team high-five" imagery.
- Busy pages. Simple, clear, bold beats clever. On-screen text stays short (people track about six things at once).
- Listing gear or software brands (no camera models, no editing apps).
- Service-menu jargon on the portfolio home page.

## Evidence on Hand

- Feature film *Off Rip*: Grand Jury Award at Gasparilla; festival credits include Tribeca and Telluride. Do not add Cannes.
- Client results Jadon cites: AlderLaw (Mike) revenue up 24% on the year; Gina Zapanta grew from about 40K to 100K+ followers in a year.
- Real footage and stills in `assets/` and `assets/reel/` (hero reel, Brand Builder film loop, client thumbnails).
- No testimonials, logos or stats beyond these. Never fabricate them.

## Product Principles

1. **Show the film, then the offer.** Real footage carries the proof; copy stays short.
2. **One clear action per page.** One CTA, one path, no competing widgets.
3. **Qualify, don't just capture.** Forms filter for budget so the calendar holds real buyers.
4. **Boutique, not volume, in feel.** Even the volume offers should look like they come from a studio.
5. **Restraint.** Every element earns its place.

## Accessibility & Inclusion

Parchment on near-black must keep WCAG AA contrast; muted text on black is the risk area. All video is muted autoplay with a poster and no essential information in motion alone. Respect `prefers-reduced-motion`. Tap targets at least 44px on mobile.
