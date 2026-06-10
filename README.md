# New Terrain Creative — Portfolio Site

**Owner:** Jadon Cal Fitzpatrick / New Terrain Creative  
**Stack:** Static HTML/CSS/JS → Next.js migration ready  
**Deploy target:** Vercel  
**Domain:** newterraincreative.com  
**Contact email:** business@newterraincreative.com

---

## What this is

Single-page cinematic scroll site for New Terrain Creative (NTC), an LA/Tampa-based video production company. The site is designed to land social media retainer clients while simultaneously showing range across documentaries, feature films, podcasts, and event production.

**Design language:** Dark editorial. Near-black base (`#0A0A0A`), warm parchment text (`#F5F0E8`), muted gold accent (`#C8A96E`). Display type is Cormorant Garamond (light/italic), body is Inter. No nav bar — floating wordmark + contact anchor only.

---

## Current state

The site lives in `index.html` as a single self-contained file. All CSS and JS are inline. Fonts load from Google Fonts. It is fully functional as static HTML and can be deployed to Vercel as-is.

---

## Immediate tasks for Claude Code / Cursor

### 1. Deploy as static site to Vercel
The `index.html` file is ready. Steps:
- Init a git repo: `git init && git add . && git commit -m "initial"`
- Push to GitHub
- Connect repo to Vercel — set root directory, no build command needed for static
- Add custom domain `newterraincreative.com` in Vercel dashboard

### 2. Swap placeholder assets — HIGH PRIORITY
Every work grid card currently shows a CSS gradient placeholder. Replace each with a real still or short looping video:

| Card | Class | Replace with |
|---|---|---|
| Off Rip | `.bg-offrip` | Key art still or trailer frame |
| Bot or Not | `.bg-botnot` | Film still |
| AlderTalk Summit | `.bg-aldertal` | Event still |
| Gina Zapanta | `.bg-gina` | Hype reel thumbnail or short `.mp4` loop |
| Robbie Ain't Right | `.bg-robbie` | Film still |
| Off Script | `.bg-offscript` | Podcast set still |
| AlderTalk Social | `.bg-aldersoc` | Social content thumbnail |

To add a still: add `background-image: url('/assets/images/offrip-key.jpg');` to the relevant CSS class.

To add a looping video background on a card, replace `<div class="work-bg bg-offrip"></div>` with:
```html
<video class="work-bg" autoplay muted loop playsinline poster="/assets/images/offrip-poster.jpg">
  <source src="/assets/video/offrip-loop.mp4" type="video/mp4">
</video>
```
And add this CSS to `.work-bg` when it's a video:
```css
.work-item video.work-bg {
  width: 100%;
  height: 100%;
  object-fit: cover;
  position: absolute;
  inset: 0;
}
```

### 3. Wire up real URLs for work card corner actions
Each work card has a corner hover button (`<a href="#" class="work-action">`). Replace `#` with actual links:

| Card | Link |
|---|---|
| Off Rip | YouTube trailer URL or offripmovie.com |
| Bot or Not | Film URL / festival page |
| AlderTalk Summit | Vimeo or YouTube link |
| Gina Zapanta | YouTube hype reel or Instagram |
| Robbie Ain't Right | Vimeo link |
| Off Script | YouTube or podcast URL |
| AlderTalk Social | Instagram or YouTube channel |

### 4. Fill in the social proof stats
In the `#social-proof` strip, the growth stat is a placeholder. Replace with real numbers:
```html
<!-- Find this block and update: -->
<div class="proof-number">&#8593;<span>↑</span></div>
<div class="proof-label">Social Growth</div>
<div class="proof-context">Your numbers here — Gina + AlderTalk</div>
```
Replace with something like:
```html
<div class="proof-number">4<span>×</span></div>
<div class="proof-label">Avg. Follower Growth</div>
<div class="proof-context">Across retainer clients in 12 months</div>
```
Or use a specific number if you have it (e.g. "0 → 12K followers").

### 5. About section — director photo
The right column in `#about` shows a `JCF` monogram placeholder. Replace with a real portrait:
```html
<!-- Find .about-frame-inner and replace its contents with: -->
<img src="/assets/images/jadon-portrait.jpg" alt="Jadon Cal Fitzpatrick" 
     style="width:100%;height:100%;object-fit:cover;object-position:top;">
```

### 6. Contact form (optional upgrade)
Currently the CTA buttons are `mailto:` links. If you want a proper contact form:
- Use [Formspree](https://formspree.io) (free tier, no backend needed) or Vercel's built-in form handling
- Add a simple name / email / project type form below the CTA buttons

---

## Future: Next.js migration

When ready to move beyond static HTML, migrate to Next.js for:
- Image optimization (`next/image`) — important for the work grid
- Component-based structure (each section becomes a component)
- Easy integration with a CMS (Sanity or Contentful) to manage work cards without touching code

Suggested component breakdown:
```
/components
  Header.jsx
  Hero.jsx
  WorkGrid.jsx       ← WorkItem.jsx as sub-component
  SocialProof.jsx
  Disciplines.jsx
  About.jsx
  Approach.jsx
  Contact.jsx
  Footer.jsx
```

To scaffold: `npx create-next-app@latest ntc-site --js --tailwind --no-app-router`  
Then move inline CSS to Tailwind classes or CSS modules.

---

## Assets folder structure (to create)

```
/assets
  /images
    offrip-key.jpg
    offrip-poster.jpg
    botnot-still.jpg
    aldertal-still.jpg
    gina-thumb.jpg
    robbie-still.jpg
    offscript-still.jpg
    aldersoc-thumb.jpg
    jadon-portrait.jpg
  /video
    offrip-loop.mp4       ← 5–10s silent loop, <3MB
    gina-loop.mp4         ← optional, hype reel excerpt
```

Keep loop videos under 3MB. Encode at 1280×720, CRF 28, no audio:
```bash
ffmpeg -i source.mp4 -vf scale=1280:-2 -c:v libx264 -crf 28 -an -t 8 output-loop.mp4
```

---

## Design tokens (for reference)

| Token | Value | Usage |
|---|---|---|
| `--black` | `#0A0A0A` | Page background |
| `--card` | `#1C1C1C` | Work card backgrounds |
| `--gold` | `#C8A96E` | Accent, eyebrows, italic headline word |
| `--parchment` | `#F5F0E8` | Primary text |
| `--muted` | `#6B6560` | Secondary text, captions |
| Display font | Cormorant Garamond 300/italic | All large headlines |
| Body font | Inter 300/400/500 | All body copy, labels |

---

## Notes

- The site has no nav bar by design. Do not add one without revisiting the overall UX.
- "Innovation" is the third hero word (replaces the original "Terrain" from v1).
- Cannes is intentionally excluded from festival credits. Tribeca/Telluride credits Jadon as **Actor** on *Robbie Ain't Right No More*. Gasparilla credits him as **Dir/Writer/Producer** on *Off Rip*.
- Bot or Not is a **short film**, not a feature.
- The Off Script podcast card is labeled "Our Own Podcast" — not "Podcast Production" — intentional.
- Footer copyright year: 2026.
