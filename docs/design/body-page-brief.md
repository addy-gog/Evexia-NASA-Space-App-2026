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

To be filled after the browse: galleries visited, one principle each, and `/taste` measurements.

## Phase 2: direction

To be filled after the variant board is picked.
