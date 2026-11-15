# Body page: design brief

Studio-tier brief for the full-page 3D body view (`/body`) and its preview on the Console.
Written 15 Nov 2026. Decisions marked **(Mutalib)** were his call; do not reverse them quietly.

## Phase 0: product truth

- **Who:** an astronaut checking their own health (primary). The flight surgeon later reuses the same viewer (not in v1).
- **Problem:** "Where in my body is something off, and what do I do about it?" answered in one look, with room to explore deeper.
- **Emotional state:** usually routine; sometimes worried (an amber or red reading). Judges at the pitch want to be shown something they remember.
- **Primary action:** tap a glowing part, read its value and the next step.
- **Surface mode:** Operate, with one Experience moment (the transition).
- **The one thing they remember:** the body sheds its skin to show what is wrong.

## Decisions already made

- **(Mutalib)** Outside view uses realistic downloaded bodies: James 2k (4.4 MB, CC BY 4.0, StormierTunic16) for men, "Stylized Female Character" (6.2 MB, CC BY 4.0, AhRabbi) for women. Chosen by each astronaut's recorded sex.
- **(Mutalib)** Inside views use Open Anatomy 3D (MIT code, CC BY 4.0 models; BodyParts3D, HuBMAP, MakeHuman). Male 7.6 MB, female 8.1 MB.
- **(Mutalib)** Option A: the realistic body and the anatomy body are never on screen together. One dissolves out while the other comes in. Reason: their arms are posed differently (out vs down), so overlaying them looks broken.
- **(Mutalib)** Body gets its own page, and the Console keeps a small preview that opens it. In the nav, Body replaces the NASA tab; NASA Data moves to the profile menu.
- Colours are the existing Evexia tokens (`client/tailwind.config.js`). Blue is the only accent; green, amber and red mean health status and nothing else. No new colours.
- Only the six measured readings react (heart, aorta, pancreas, skin, brain, skeleton for radiation). Other anatomy is there to look at, not to click for data Evexia does not have.

## Phase 1: experience

Flow: Console preview → "Open body view" → `/body`. Deep link `/body?part=heart` selects a part.

Wireframe in words (desktop): the viewer owns most of the width. View switcher (Outside, Muscles, Skeleton, Organs, Exploded) across the top of the viewer; Front / Back / Side and, in Exploded, a spread slider along its bottom. A detail rail on the right: selected part, value, status, a short trend, the next step, and actions (Log a reading, Ask Evexia AI, Escalate). Phone: viewer about 60% of the screen height, controls under it, details in a bottom sheet.

### States matrix

| State | What shows |
|---|---|
| Loading | A still picture of the body (poster) with a thin progress line; markers already visible |
| Slow connection or Save-Data on | Poster plus "Load 3D body (4.4 MB)"; nothing downloads until tapped |
| No WebGL / 3D fails | The existing 2D body map with the same six markers |
| Model download fails | 2D map, a plain message, and Try again |
| No readings yet | Markers grey, "Not logged yet", link to Log Readings |
| Some readings | Logged parts coloured, the rest grey |
| Amber / red | That part pulses gently; red also shows the Emergency link |
| Reduced motion | View changes happen instantly; no pulse, no camera glide |
| Offline after first load | Models come from the browser cache if present; otherwise the 2D map |

## Performance budget (Ghana floor)

The skill's 3D budget is under 3 MB per scene. This page is over it, on purpose, because the body is the product here:
outside view 4.4–6.2 MB, inside view a further 7.6–8.1 MB. Mitigations: the inside model loads only when an inside view is first chosen; the poster renders before any 3D; Save-Data and slow connections ask first; device pixel ratio capped at 2. [NEEDS: measured load time on venue Wi-Fi]

## Phase 1.5: inspiration

Browsed 15 Nov 2026 (15-minute box). One principle each, not pixels:

- **Zygote Body** (zygotebody.com): the layer switcher is a vertical stack of small pictograms ordered from the outside in, beside the body. The order itself teaches "going deeper".
- **BioDigital Human** (human.biodigital.com, sign-in page only; the viewer needs an account): depth shown as a left-to-right peel across four faces, and the faces span several skin tones. Depth reads as a sequence; the default body is not one pale person.
- **Open Anatomy 3D demo** (mervinr07.github.io/open-anatomy-3d): callout cards are pinned to structures and follow the body as it turns, so the label never loses its organ.
- **Human Atlas** (Hacker News thread, 7 Sep 2026): the comment people liked most was the exploded "flat lay sorted by size". Exploded views earn their place when the spread is ordered, not random.
- **mesh3d.gallery** front page: brand showpieces, nothing medical; no principle taken.

`/taste` was not run: it measures page type and spacing from the DOM, and this page's type and spacing are fixed by Evexia's existing tokens. The open question here is motion inside a 3D canvas, which `/taste` cannot see. Said out loud rather than skipped quietly.

## Phase 2: direction

**Transition: the scan sweep (Mutalib, 15 Nov 2026).** Chosen from three rendered options (scan sweep, fade in place, camera dive), see `transition-options.gif`.

- A thin ring in the Evexia accent blue travels head to toe. Above the ring: the anatomy. Below it: the realistic body. This is the page's signature move and its one orchestrated motion.
- **Arm fix (measured, not guessed).** James's arms are |x| > 0.21 m between 0.95 m and 1.47 m high (shoulders at 1.45 m, fingertips 0.58 m out). Cutting them with a flat ring left two forearms floating at the sides. Now the outside arms fade as one piece while the ring travels from 1.47 m to 1.20 m, and the ring's width follows the body's measured width at each height. See `transition-scan.gif`.
- Done with a shader patch (discard above or below the band), not clipping planes, so the arms can fade while the torso keeps a crisp cut.
- Easing: sine in-out over the whole sweep. Reduced motion: instant swap, no ring.
- The female model needs the same arm measurement before it ships. [NEEDS: measure the female model's arm zone]

Tone: clinical, calm, exact. Type, colour and spacing: existing Evexia tokens. What we refuse: glow-everything sci-fi, more than one animated moment per view, dark-mode-only "HUD" styling.
