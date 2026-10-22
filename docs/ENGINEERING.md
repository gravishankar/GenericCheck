# GeneriCheck — Engineering & Maintenance Guide

Audience: developers maintaining or extending GeneriCheck. For end-user documentation see [README.md](../README.md).

---

## 1. What this app is

A single-page web application that adapts the Yuka pattern (input identification → metadata lookup → weighted scoring → alternative recommendation) to prescription generic drugs. It is **static, dependency-free vanilla HTML/CSS/JS with no build step and no backend** — by design, for privacy: medicine lists never leave the user's device.

Two artifacts ship from the same source:

1. **The hosted preview** — the files in this folder, served as-is. Runs in a sandboxed iframe where browser storage APIs are unavailable, so lists are in-memory plus export/import to JSON files.
2. **The standalone single file** (`genericheck-standalone.html`, generated one level *above* this folder by `scripts/build-standalone.py`) — everything inlined into one HTML file plus a small storage adapter, so lists auto-save on the user's device.

## 2. File map

```
fixindex/
├── index.html          App shell: sections, forms, methodology dialog, footer
├── styles.css          Design system (CSS custom properties) + all component styles
├── data.js             Two exports: DRUG_EDUCATION (real, sourced) and PRODUCTS (fictional fixtures)
├── app.js              All logic: scoring engine, recommendations, rendering, live FDA check, medicine lists
├── scripts/
│   └── build-standalone.py   Builds ../genericheck-standalone.html (single file + storage adapter)
├── README.md           End-user documentation
└── docs/ENGINEERING.md This document
```

No bundler, no framework, no npm dependencies for the app itself. `data.js` and `app.js` are plain scripts loaded in order by `index.html`.

## 3. Core design principles

These principles are **load-bearing** — regressions against them are bugs even when tests still pass:

1. **Evidence status over confident claims.** Identity ("who made it") is reported with an evidence status (`one-known-site` / `multiple-known-sites` / `unconfirmed`). "Unconfirmed" is a legitimate, displayed answer. Nothing is ever guessed.
2. **Score only what's evidenced; cap only what's active.** The mock index caps only for events that are both **product-level** and **active**. Resolved and labeler-wide events inform history but never cap.
3. **Real data is never scored.** openFDA records are rendered, clearly labeled, and never mixed into the mock index.
4. **Honest failure semantics.** "No matching records in this query" ≠ "no recalls exist". Source failures say so and never masquerade as "nothing found".
5. **Local-first PII.** No accounts, no server, no uploads. The only network calls carry drug names to the FDA's public API.
6. **Never medical advice.** Alternatives are "candidates to discuss with your pharmacist"; the disclaimer bar and education copy enforce this everywhere.
7. **Escape everything.** All user input and API data passes through `escapeHtml()` before reaching the DOM.
8. **Legal notices are structural, not cosmetic.** The persistent disclaimer bar (`.sticky-disclaimer`, fixed, non-dismissible, present on every view and scroll position), the full Terms & Disclaimer dialog (`#termsDialog`), and the in-place notices (mock badge, "never scored" labels, pharmacist framing) are load-bearing. Any new user-facing section must keep these notices intact and must not weaken their wording. QA must verify: bar visible at top/mid/full scroll (desktop + mobile), dialog opens from all three entry points (`#termsBtn`, `#topTermsBtn`, `#footerTermsBtn`), and the mobile bar text fits (the `.bar-full` span is hidden under 640px so the bar stays ≤ 2 lines).

## 4. Data model (`data.js`)

### DRUG_EDUCATION
Keyed by ingredient (`atorvastatin`, `levothyroxine`, `metformin`, `lisinopril`, `sertraline`, `warfarin`, `amlodipine`). Each entry: `uses`, `cautions`, `monitoring` (clinical wording, e.g. lipid panels, TSH, INR), `nti` flag + `ntiNote`, and a MedlinePlus source URL. **These are real, sourced facts — do not invent education content.**

### PRODUCTS (15 fictional fixtures)
Six fictional labelers (`Demo Labs A`–`F`, plus `Demo Repack Inc.` — a repackager whose registered maker is Demo Labs F, deliberately included to teach the labeler ≠ maker lesson).

```js
{
  ndc: '90910-0011-30',            // 3-segment, dashed
  labeler: 'Demo Labs B',
  brand: '…', ingredientKey: 'atorvastatin', strength: '10 mg', form: 'tablet',
  subcategory: 'Atorvastatin 10 mg oral tablet',   // identity for alternatives matching
  teStatus: 'ab' | 'inquiry',      // categorical, never scored
  manufacturing: {
    maker: 'Demo Labs B',          // registered maker (mock)
    sites: ['…', '…'],
    siteStatus: 'one-known-site' | 'multiple-known-sites' | 'unconfirmed',
    evidence: 'mock teaching fixture',
  },
  attrs: { /* criterion inputs; null = not assessed */ },
  events: [/* structured events */],
}
```

### Events (structured, not free-text)

```js
{
  kind: 'recall' | 'inspection' | 'import-alert' | 'bioequiv-inquiry' | 'shortage',
  class: 'I' | 'II' | 'III',       // recalls only
  outcome: 'NAI' | 'VAI' | 'OAI',  // inspections only
  level: 'product' | 'labeler',    // scope — ONLY product-level events may cap
  status: 'active' | 'resolved',  // explicit — ONLY active events may cap
  statusNote: 'human sentence shown in the UI',
  when: 'March 2026', scope: 'one lot (L4471)',
}
```

The `status` field replaced free-text status parsing (a past bug source). Never revert to regex-matching status strings.

## 5. Scoring engine (`app.js`)

### Criteria (weights sum to 1.0)

| Key | Weight |
|---|---|
| `inspectionRecord` | 0.30 |
| `recallHistory` | 0.25 |
| `batchConsistency` | 0.20 |
| `supplyReliability` | 0.15 |
| `qualityTransparency` | 0.10 |

### Pipeline

```
gradeItem(product)
  → assess each criterion (attrs; null → unassessed)
  → rawScore = Σ(weight × value) over assessed criteria, renormalized
  → coverage = { assessed, total, weight }  → shown as a chip; renormalization is NOT silent
  → barriers: match events (see BARRIERS) → cap = min barrier cap
  → final = capped ? cap : round(rawScore)   (cap applies only when raw > cap)
  → tier: green ≥ 70, yellow 40–69, red < 40
```

### Barriers (caps)

| Match (all must hold) | Cap |
|---|---|
| `recall` class I, level product, status active | 24 |
| `inspection` OAI, level product, status active | 24 |
| `import-alert`, level product, status active | 24 |
| `recall` class II, level product, status active | 49 |
| `bioequiv-inquiry`, level product, status active | 49 |

### Recommendations (`findAlternatives`)

- Triggered when `score < RECOMMENDATION_THRESHOLD` (60).
- Candidates: **same `subcategory`**, **strictly higher score**, up to 3, sorted by score.
- If none qualify, the "No higher-scoring labeler" state renders (Demo Labs E warfarin is the fixture for this).

### Invariants — maintain these tests

1. Scores bounded 0–100; cap applied only when `raw > cap`.
2. Resolved events never cap (Demo Labs B atorvastatin, raw 59, no cap).
3. Labeler-wide events never cap a product (Demo Labs E warfarin, 59, no cap).
4. Renormalization only for null criteria; coverage always displayed; note states it's not neutral.
5. Alternatives: exact `subcategory` match, strictly higher score, threshold 60.
6. No-better-match state exists and renders.
7. `escapeHtml()` on every interpolation of user/API data (validated: injection test).
8. `NDC_PATTERN = /^\d{10,11}$/` gate before any lookup; unsupported payloads render a safe message.

## 6. Live regulatory check (openFDA + Rx Inspector data)

Three record sources, rendered client-side, **records only — never scored, badged, or judged**:

- `drug/ndc.json` (openFDA) — identity lookup. **Gotcha:** openFDA indexes NDCs in *dashed* format; the lookup tries raw-as-typed, dashed package NDC, and product NDC before concluding "no match". Recall lookups by generic name use the *resolved* generic name from an NDC hit, not the raw input (past bug).
- `drug/enforcement.json` (openFDA) — recall records via harmonized `openfda.generic_name`, sorted by `report_date:desc`. 404 = "no matching records" (honest wording); non-404 errors = source failure.
- **Rx Inspector data release** (ProPublica, CC BY-NC 4.0) — registered manufacturing facilities per product NDC. `ndc_fei.csv` (~3 MB, 47k rows) is fetched once per visit from GitHub raw, parsed with `parseCsv()` (state machine — registrant names contain quoted commas), indexed into a `Map` by product NDC, cached in memory. Product-NDC candidates are derived from dashed or bare-digit input (NDC segment ambiguity is handled by trying all plausible splits). Facility records render with linkage-method glosses, the registrant ≠ labeler caveat, a link out to Rx Inspector for inspection histories, the release vintage (currently hard-coded `RX_RELEASE_VINTAGE = 'November 2025'` — update on new releases), and the attribution footer (license obligation). A second `escapeHtml` pass covers all CSV fields — external data is untrusted input.

Attribution obligations on every result + site footer: FDA (public domain/CC0) + ProPublica (CC BY-NC 4.0, noncommercial only — the app must stay free).

Rate limits: 1,000 req/day per IP without an openFDA key (240/min), 120,000/day with a free key. The monthly report queries sequentially per medicine — keep lists ≤ 10 meds or add throttling.

### Camera scanning (two decode paths)

- **Native path:** `BarcodeDetector` (Chrome/Edge) — feature-detected; `getUserMedia` with rear camera; `detect()` loop.
- **Software fallback:** browsers without `BarcodeDetector` (notably iOS Safari) load [ZXing](https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js) from a CDN on first camera start (`startCameraZxing()` → `BrowserMultiFormatReader.decodeFromConstraints`), which manages the camera itself. `stopCamera()` must reset both paths (ZXing `reader.reset()` + stream stop). First use needs an internet connection on fallback browsers — disclosed in the UI. A camera-unavailable failure and a blocked-CDN failure render different honest messages.

## 7. Medicine lists (local-first)

- Storage behind an adapter: `window.GC_STORAGE` (injected **only** in the standalone build) with `read(key)` / `write(key, value)`. The hosted preview defines no adapter → in-memory + Export/Import JSON files.
- **Why an adapter:** the preview platform's deploy validator forbids storage API literals in deployed files. Never write storage-API calls directly in `app.js`/`index.html`; always go through `GC_STORAGE`, and keep `genericheck-standalone.html` **outside** the deploy folder.
- Export format: `{ app: 'GeneriCheck', version: 1, exportedAt, lists: [...] }` — validated on import via `validList()`; dedupe by id.
- .ics generation: single `VEVENT`, `RRULE:FREQ=MONTHLY`, next month's 1st, 09:00, with the medicine list in the description and a display alarm.
- Email handoff: `mailto:` with the report encoded in the body. The app never sends email itself.

## 8. Build & deployment

### Standalone build
```
python3 scripts/build-standalone.py
```
Inlines `styles.css`, `data.js`, `app.js` into a copy of `index.html`, injects the `GC_STORAGE` adapter *before* the app script, and rewrites the privacy copy to first-person ("this file is the standalone version"). Output: `../genericheck-standalone.html`. **Re-run after every source change** (or the standalone goes stale).

### Hosted deployment
Static deploy of this folder (`index.html` as entry point). Notes:
- The deploy validator scans all shipped files for forbidden browser APIs — the reason for the adapter pattern and the standalone living outside the folder.
- After deploying, verify the live URL manually (bot-verification walls can block automated checks).

## 9. QA harnesses

Patterns that worked (recreate as needed; they live in /tmp in the original build environment):

- **Scoring tests (Node):** eval `data.js` + `app.js` + assertions in one `eval` scope (separate evals can't share `const` scope); stub `document` with a Proxy. Assert the invariants in §5 against the fixtures.
- **Browser QA (Playwright):** run against `file://` for full flows (works because openFDA allows cross-origin browser requests). Key techniques:
  - Stub camera: `page.addInitScript` / `evaluate` defining a fake `BarcodeDetector` (empty `detect()` loop) → exercises the permission-failure and unsupported paths.
  - Fake camera (real ZXing path): launch Chromium with BOTH `--use-fake-device-for-media-stream` AND `--use-fake-ui-for-media-stream` — the second flag auto-grants the permission prompt; without it, getUserMedia fails with NotAllowedError and can be mistaken for a file:// restriction (a past harness lesson: verify suspected platform blocks with corrected flags before documenting them).
  - Simulate blocked storage: `addInitScript` redefining `window.localStorage` with a throwing getter.
  - Downloads: `Promise.all([page.waitForEvent('download'), page.click(...)])`.
  - HTML-injection check: submit `<img src=x onerror=…>` payloads and assert no `img` lands in the DOM.
- **Visual QA:** full-page screenshots of every new section; note that the sticky header renders mid-page in full-page captures (screenshot artifact, not a bug).

## 10. Extending the app

### Add a product / manufacturer
Add to `PRODUCTS` with the full schema (§4). Keep at least: one capped-red item, one resolved-event item, one labeler-wide-event item, one repackager item, one partial-coverage (null criterion) item, and one best-in-subcategory item — the tests and teaching value depend on these fixtures existing.

### Add or change a criterion
Edit `CRITERIA` (weights must sum to 1.0), add assessment logic in `gradeItem`, add a bar renderer. Update the methodology dialog in `index.html` and the README table. Re-run scoring tests. If a criterion can be legitimately unknown, it must support `null` (renormalization + coverage).

### Wire in more real data sources
All of these are browser-callable (CORS-open) or downloadable:
- **Orange Book** — TE codes; already modeled as `teStatus`, currently fixture-backed. FDA publishes monthly data files and an API.
- **NDC Directory (full)** — already used for identity; could drive labeler/maker verification for the mock catalog.
- **ProPublica Rx Inspector data** — GitHub, Creative Commons (noncommercial, attribution). NDC→FEI links could replace the fictional `manufacturing` blocks with real factory mapping. Respect the license.
- **EudraGMDP / MHRA / Health Canada** — non-US regulator records for the monitoring checklist; no APIs as convenient as openFDA.
- Any new source must keep principle §3.4: no-match and failure states rendered differently, and real data never scored.

### Future directions (in rough order of fit)
- **PWA / offline**: add a service worker + manifest to the standalone build (the deploy validator constrains what can ship hosted; the standalone file is free).
- **Scheduled email**: requires an email connector + a scheduled task *outside* this codebase (the app is deliberately serverless). Keep the mailto/calendar handoff as the default.
- **i18n**: strings are currently inline; extract to a dictionary keyed per section.
- **Backend for sync** (if ever requested): would break the local-first privacy model — require an explicit product decision, and keep export/import files working regardless.

## 11. Real-data bridge — risk profile (implemented)

The shipped design: for any real NDC, surface real quality signals — openFDA recall records + the registered factory's inspection history from ProPublica's Rx Inspector data release — mapped onto the same criteria as evidence cards, with **no composite 0–100 score for real companies**. Risk profile as verified October 2026:

### Licensing
- **openFDA (FDA):** data is public domain under a CC0 1.0 dedication — copy, modify, distribute, even commercially ([openFDA license](https://open.fda.gov/license/)). Attribution is *requested*, not required ("Data provided by the U.S. Food and Drug Administration (https://open.fda.gov)"). The *service* is "as is" with no warranties; FDA disclaims liability to the fullest extent ([terms](https://open.fda.gov/terms/)). When republishing data, keep openFDA's own disclaimer text visible (already rendered in the live check).
- **ProPublica Rx Inspector data:** Creative Commons **BY-NC 4.0** ([repo](https://github.com/propublica/rx-inspector-data)) — noncommercial use with attribution to ProPublica and a link back to Rx Inspector. Free educational app qualifies today; **if the app ever monetizes, this license breaks** — remove the dataset or negotiate. Note: ProPublica *articles* are CC BY-NC-ND (no derivatives) — use the dataset, not the journalism.

### Accuracy & completeness (the real risk driver)
- openFDA data is unvalidated by FDA's own statement; recall records are firm-reported and lag.
- Rx Inspector links ~80% of generics to a factory ([methodology](https://www.propublica.org/article/rx-inspector-fda-generic-drug-tool-methodology)); inspection outcomes come from FDA's dashboard (2008+) plus records ProPublica obtained by suing FDA. Coverage gaps are structural.
- The silent-switch problem applies to the *data*: an NDC→factory mapping can be stale the day a labeler shifts production. Any UI built on it must show data vintage and per-lookup coverage, and use "unconfirmed" states rather than inferring cleanliness.

### Defamation / misrepresentation
- Republishing official records verbatim (recall classifications, inspection outcomes): low risk — facts from government records.
- Derivative judgments on real companies (traffic-light badges, composite scores computed from possibly-stale mappings): the highest-risk feature. A wrong "red" attached to a real company is a potentially false statement of fact. This is why the bridge design is **evidence panel, not scoring** — show records + criteria mapping + provenance, never a verdict number for real companies.

### Endorsement & marks
- Never use FDA or ProPublica logos; state "not affiliated with, endorsed by, or supported by" both. Don't imply FDA endorsement (FDA Website Policies).

### Required disclaimer changes if the bridge is built
1. Terms §4 (Third-party data): name both datasets, their licenses with links, and add explicit non-endorsement of FDA and ProPublica.
2. Add data-vintage language: "information may be outdated or incomplete; absence of records is not evidence of absence."
3. Attribution footer (CC BY-NC obligation): "Data provided by the U.S. Food and Drug Administration (open.fda.gov) · Rx Inspector data © ProPublica, used under CC BY-NC 4.0" with a link to Rx Inspector.
4. Keep openFDA's verbatim disclaimer text on every panel that renders its data.
5. README: add a data-licensing section mirroring the above.

### Operational
- openFDA rate limits (current): 240 req/min and **1,000 req/day per IP without a key**; 120,000/day with a free key. Fine for family use; get a key if the app grows.
- Both datasets contain no PII; queries still carry only drug names.

## 12. Known limitations

- Camera decode verified via stubs and (software path) a fake camera device; real-world iPhone scanning is the main untested path — typing the NDC is the designed fallback.
- The hosted preview cannot persist lists (sandboxed iframe) — by design, mitigated by export/import.
- `standalone.html` is a build artifact and can go stale if `scripts/build-standalone.py` isn't re-run.
- Mock education content must remain sourced (MedlinePlus); mock fixtures must remain fictional and badged.

---

*Maintained as a teaching prototype. All manufacturers in the mock data are fictional; no real company is rated.*
