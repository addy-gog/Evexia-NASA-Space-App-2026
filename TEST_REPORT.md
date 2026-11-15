# Evexia Test Report

**Date:** 14 Nov 2026 · **Version:** 2 (timestamped logs, history, wearable telemetry, emergency mode, real NASA data; Demo mode removed) · **Environment:** Windows 11 Pro, Node.js 26.13, npm 12.2, Playwright (Chromium, real GPU: Intel HD 520) · **Result: all suites pass.**

## Final run summary

| Suite | Command | Result |
|---|---|---|
| Lint (ESLint, React + hooks, `--max-warnings=0`) | `npm run lint` | ✅ 0 errors, 0 warnings |
| Unit (Vitest) | `npm run test:unit` | ✅ **133 / 133 passed** (4 files) |
| API (Vitest + supertest + live SSE) | `npm run test:api` | ✅ **46 / 46 passed** |
| End-to-end + accessibility + responsive + performance | `npm run test:e2e` | ✅ **38 / 38 passed** in 5.9 min (6 skipped = opt-in screenshot generator) |
| README screenshots | `SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.js` | ✅ 6 / 6, 10 images in `docs/screenshots/` |
| Fallback DB driver | `EVEXIA_SQLITE_DRIVER=node npm run test:api` | ✅ 46 / 46 on `node:sqlite` (also run on better-sqlite3) |
| Live NASA endpoints | `npm run data:nasa` | ✅ RadLab: 1155 Mars rows, 2108 ISS rows, 24 lunar-orbit rows; DONKI: live flares and SEPs |
| Manual run | `npm run seed`, `npm run dev`, `npm run telemetry:sim` | ✅ 168 sample entries seeded; simulated gateway data streamed live into the UI; no console errors on 6 screens |

```
 Tests  133 passed (133)        # unit
 Tests  46 passed (46)          # API
  6 skipped
  38 passed (5.9m)              # e2e + a11y
EXIT 0
```

## What was tested

### Unit (`client/tests/`)
- **Thresholds at every boundary**, including the research-based changes: glucose 59/60/64/64.5/**65**/99/100/125/126; temperature **34.9 red / 35.0 amber** / 35.4 / 36.0 / 36.1 / 37.2 / 37.3 / 38.0 / 38.1; heart rate; blood pressure with systolic and diastolic disagreeing.
- **Radiation units:** mGy → estimated mSv per environment (0.48 mGy × Q 3.8 = 1.824 mSv), same measured dose green in Mars transit but amber in LEO, station band edges (0.39/0.4/1.0/1.01 mGy), red above 2.0 mSv/day everywhere, SPE flag, **250 mSv per-event** bands, cumulative 600 mSv bands.
- Sleep history, personal baseline (15 %/25 %, absolute red kept), score weights and the 59 cap, hazard rules, comms-delay logic.
- **Log evaluation (`evaluate.test.js`):** mission day from start date; latest value per indicator with time/source/device; logs after "now" ignored; **values older than 36 h marked stale and excluded**; empty history; sleep history from earlier calendar days (latest per day); two short nights → red for the current and the historical entry; cumulative dose with carry-forward and prior dose; SPE event dose; isolation rule from the last-conference date; daily score series; weekly summary (grouping, order, averages, amber counts).
- **Telemetry (`telemetry-assistant.test.js`):** Bluetooth GATT parsers byte-for-byte (heart rate 8/16-bit; IEEE-11073 SFLOAT and FLOAT; temperature °C/°F; blood pressure mmHg with pulse and kPa); sync aggregation (HR median ignores a 140 bpm spike; latest for others; BP only as a pair; empty window; device list; notes); pruning; ingest validation.
- Rule-based assistant; escalation report v2 (measurement timestamps, mission day, mSv estimate, **emergency priority**, validation).

### API (`server/tests/api.test.js`)
- Seeded **21-day timestamped sample history** (42 entries for c1, notes on every entry, SPE present).
- `POST /api/readings`: 201 with id/ts/notes/source; **idempotent client ids** (re-send → 200); partial wearable entry; 11 invalid payloads (unknown crew, missing/invalid/**future ts**, bad values, diastolic ≥ systolic, unknown environment, bad source, notes > 2000, no values); cross-crew id → 409; malformed JSON.
- `GET /api/readings` ISO range filter, newest first, bad ranges; `DELETE` → 204 then 404.
- Baseline; crew status from latest logs; escalations (create, **emergency listed first**, review, invalid, 404).
- **Telemetry:** ingest → 202, latest, series, device registry; 6 invalid ingests; **`TELEMETRY_KEY` → 401 without or with a wrong key, 202 with the right one**; missing crewId → 400.
- **Server-Sent Events (real HTTP server):** a subscriber for c1 receives its samples and new log entries, and **does not receive another crew member's data**.
- **DONKI:** mocked live response mapped and requested from `ccmc.gsfc.nasa.gov/DONKI/WS/get/{SEP,FLR}?startDate=…&endDate=…`; network failure → **bundled snapshot** with a notice.
- **RadLab:** bundled Curiosity storm (peak 2024-05-20, > 10× baseline, source URL) and reference set.
- Assistant: offline fallback, validation, unreachable upstream, 500, success (red status, **mGy→mSv text** and comms context in the prompt, key not returned), refusal, rate limit.

### End-to-end (`e2e/evexia.spec.js`, 19 tests; every test fails on any console error)
1. Green readings → all cards green, score 100, body green, "measured just now".
2. HR 96 → amber card, region list and **3D label** amber, alert; HR 108 → red.
3. Glucose 130 → red, score ≤ 59, emergency prompt, escalation preview with `… [RED (action)]  YYYY-MM-DD HH:MM UTC`, sent.
4. Slider ↔ number sync, inline validation.
5. Environment: station 0.48 mGy ≈ 0.96 mSv vs Mars transit ≈ 1.824 mSv; 12 min link; self-care first on Mars, actions first on station.
6. **Back-dated log (yesterday 06:45) with details** → shows mission day, toast with time, appears in History with time 06:45, *Manual* and the notes.
7. **Future time rejected.**
8. **History**: 7 charts with bands; past week < 2 weeks ≤ 4 weeks points; weekly summary; source filter.
9. **Wearables**: samples posted to `/api/telemetry` appear live via SSE (97 bpm, amber), device listed, preview "Heart rate 98 bpm" (median), **Sync to log** → dashboard HR 98 measured by "E2E smartwatch", History row tagged *Wearable sync*.
10. Bluetooth panel lists GATT 0x180D, 0x1809, 0x1810.
11. **Emergency mode**: delay text, checklist step ticked, `*** EMERGENCY ***` report includes the step, sent; Flight Surgeon lists it first.
12. **NASA Data**: Curiosity 2024-05-20, 69.34 µGy/h, 4 reference rows, 250 mSv and 65–99 mg/dL limits, DONKI status shown.
13. **Demo mode and mission scrubber are gone**; `/trends` → Page not found.
14–19. Assistant offline badge; guide (mGy, 65–99); simple view + reduced motion; keyboard reaches all 12 primary actions including History, Live Telemetry and Emergency; baseline mode; all 11 pages load with the disclaimer and no console errors.

### Accessibility, responsiveness, performance (`e2e/a11y.spec.js`, 19 tests)
- axe (WCAG 2.0/2.1 A/AA + best practice), with amber and red data present, on **Dashboard, Log, History, Live Telemetry, Alerts, Guide, Emergency, NASA Data, Settings, Flight Surgeon**: **0 serious / 0 critical**; also in high contrast and with the assistant open.
- Touch targets ≥ 44 px; **no horizontal overflow at 360, 768, 1440 px on 9 screens**; text size 16/18/20 px.
- three.js not downloaded on the Guide page; one canvas after 5 navigations; heap < 300 MB.

## Bugs found and fixed in this round

| # | Found by | Problem | Fix |
|---|---|---|---|
| 1 | e2e tests 2, 3, 14, 17 | **Two logs saved in the same minute tied** (time field has minute precision), so the "latest" value could be the older entry; a real user re-logging a corrected value would hit this | Unedited date/time saves the exact moment (to the second); ties keep insertion order (stable sort) |
| 2 | e2e test 9 | A new wearable only appeared in "Devices seen" after the 30 s poll | Device list refreshes as soon as a sample from an unknown device arrives |
| 3 | Responsive test (360 px) | **History overflowed by 337 px**: the visually hidden "Actions" table header is absolutely positioned and escaped its scroll wrapper | Scroll wrappers are now the containing block (`position: relative`) |
| 4 | Responsive test (360 px) | **Live Telemetry overflowed by 256 px**: the `curl` example widened its grid column (grid `min-width: auto`) | All panels get `min-width: 0` |
| 5 | Visual review | Sample dosimeter noise straddled the Mars-transit green limit, so normal days flickered amber | Realistic jitter (±0.008 mGy) |
| 6 | Visual review | Curiosity storm chart repeated date labels | One tick per UTC day with an axis label |
| 7 | Dev console | React warning: chart dot props spread a `key` | `key` passed explicitly |
| 8 | Visual review | Simulator sent dosimeter values with float noise (0.4760000003) | Rounded to 3 decimals |
| 9 | Lint | Unescaped apostrophes in two pages | Escaped |

## Known limitations
- **Not verified with physical Bluetooth devices** (none attached to the build machine). The parsers follow the Bluetooth SIG formats and are tested byte-for-byte; real-device pairing should be checked on a Chrome/Edge device over HTTPS.
- The research doc linked by the team could not be opened from the build session (access restricted) and the `evexia-data` files were not on this computer. The pasted summary was used, and RadLab/DONKI data was fetched directly from NASA instead.
- Figures from team research that were not opened (NASA-STD-3001 values, Inspiration4 range, Mars-surface 0.67 mSv/day, Chang'E-4, ISS range) are labelled "to be verified"; quality factors are approximate.
- HR 108 in the brief is amber, but the brief's own table makes it red; Evexia follows the table.
- Claude path tested with mocks and an unreachable endpoint, not live (no key available).
- `npm audit`: two moderate React Router 6 advisories (not reachable: hard-coded routes, no SSR); dev-tool advisories (Vite 5/Vitest 2/esbuild) need major upgrades and don't ship.
- Deployment, FortiGuard classification and the private-window check need the team's accounts.

## How to re-run

```bash
npm install && npm run seed
npm run lint && npm test
npm run test:e2e                 # builds the client first
npx playwright show-report
E2E_GPU=0 npm run test:e2e       # software WebGL (Linux CI style)
npm run data:nasa                # refresh RadLab + DONKI data from NASA
```
