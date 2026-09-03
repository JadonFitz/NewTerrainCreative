# Reel assets

Everything the horizontal showcase on `sprint.html` and `grow.html` loads.
Each card needs three files:

| File | What it is |
| --- | --- |
| `loop-NAME.mp4` | Silent 3 to 9s loop, 540x960. Autoplays in the card. |
| `poster-NAME.jpg` | 540x960 still. Held until the loop decodes, and the standalone fallback if the loop is missing. |
| `NAME.mp4` | The full cut with audio, 720x1280. Opens in the player on click. |

## Cards currently live

The loops are Jadon's own cuts out of `loop/`, re-encoded frame for frame to
a weight that can autoplay (they arrived at full 1080p, about 41MB across the
set; they are far lighter now). The in and out points are untouched.

| NAME | Card | Loop source | Full cut source |
| --- | --- | --- | --- |
| `left-hanging` | Left Hanging | `loop/HANGING Loop Thumbnail.mp4` | `LEFT HANGING - WITH SUBTITLES (AD 2).MP4` |
| `ping-pong-crash` | Ping Pong Crash | `loop/Ping Pong Crash Loop Thumbnail.mp4` | `PING PONG CRASH - AD 3.MP4` |
| `hamster-wheel` | Hamster Wheel | `loop/Hamster Loop Thumbnail.mp4` | `MIKE AD 4 - HAMSTER WHEEL.MP4` |
| `bts-ads` | The Shoot Day | `loop/BTS Ads Loop Thumbnail.mp4` | none, see below |
| `off-rip-love-story` | Off Rip · Love Story | `loop/Love Story Off Rip Loop Thumbnail.mp4` | `v15044gf0000d9h8kufog65rp3julmag.mov` |
| `off-rip-drama` | Off Rip · Drama | `loop/Drama Off Rip Loop Thumbnail.mp4` | `v15044gf0000d9ieg3nog65qeqmrnetg.mov` |
| `off-script-jack-tenney` | Off Script · Jack Tenney | `loop/Off Script Jack Tenney Loop Thumbnail.mp4` | `40523b4aa7524b2e9d1dc3d373a6a159.MOV` |
| `off-script-meghan` | Off Script · Meghan | `loop/Off Script Meghan Loop Thumbnail.mp4` | `Off Script EP2 Short-1.MP4` |
| `hey-leo` | Hey Leo | `loop/Hey Leo Loop Thumbnail.mp4` | `Hey LEO.MP4` |

Everything in this row is a vertical social reel and the player is 9:16 only.

**The Shoot Day loops but does not open.** `loop/BTS Ads Loop Thumbnail.mp4`
is the vertical reframe of `IMG_8146.MOV`, so the loop is the only vertical
form that piece exists in. The horizontal master never ships. The card carries
`class="reel-card--noplay"`, which drops the Play line and the click handler.
If a longer vertical BTS cut ever gets made, drop it at `bts-ads.mp4`, remove
that class, and add `data-src="assets/reel/bts-ads.mp4"`.

## Adding a new one

`LOOP_START` is where the six-second loop begins, `POSTER_AT` the frame the
still comes from. Pick a moment that reads at a glance, not a mid-blink.

```bash
SRC="MASTER.MP4"; NAME="slug"; LOOP_START=0; POSTER_AT=1

# looping card thumbnail, silent
ffmpeg -y -ss $LOOP_START -t 6 -i "$SRC" -an \
  -vf "scale=540:960:force_original_aspect_ratio=increase,crop=540:960,fps=24" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 30 -preset slow \
  -movflags +faststart "loop-$NAME.mp4"

# full cut for the player, with audio
ffmpeg -y -i "$SRC" \
  -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 28 -preset slow \
  -maxrate 2200k -bufsize 4400k -c:a aac -b:a 96k -ac 2 \
  -movflags +faststart "$NAME.mp4"

# poster still
ffmpeg -y -ss $POSTER_AT -i "$SRC" -frames:v 1 \
  -vf "scale=540:960:force_original_aspect_ratio=increase,crop=540:960" \
  -q:v 4 "poster-$NAME.jpg"
```

Then copy an `<article class="reel-card">` in the page and point its three
paths at the new `NAME`. Loops should land under ~350KB and full cuts under
about 7MB; anything much heavier is worth a second pass.
