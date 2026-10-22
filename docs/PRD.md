# Product Requirements Document — GeneriCheck

| | |
|---|---|
| **Status** | v1.1 — reflects shipped product + deployment |
| **Public URL** | https://gravishankar.github.io/GenericCheck/ (GitHub Pages) |
| **Last updated** | October 22, 2026 |
| **Owner** | Product: GeneriCheck |
| **Related docs** | [README.md](../README.md) (end users) · [docs/ENGINEERING.md](ENGINEERING.md) (architecture, maintenance, expansion) |

---

## 1. Problem statement

When a pharmacy fills a generic prescription, the patient receives almost no information about **who actually made the drug** or **what that maker's regulatory record looks like** — even though this information is publicly available in fragmented form.

Three specific gaps:

1. **Identity opacity.** The NDC on the label identifies the labeler, not the factory. Labelers can be repackagers; production can shift between plants under the same NDC ("the silent switch") without a single digit changing on the barcode.
2. **Scattered signals.** Recall enforcement reports (FDA openFDA), facility registrations (DRLS), and inspection outcomes (FDA dashboards, ProPublica's Rx Inspector) live in separate systems a layperson cannot join or interpret.
3. **No safe interpretation layer.** Raw regulatory records are unreadable to patients — what a Class I recall means, whether *their* lot is affected, what to ask a pharmacist. Existing tools either don't target patients or rate real companies with methodology the public can't audit.

Meanwhile, the highest-stakes population — patients on **narrow-therapeutic-index drugs** (levothyroxine, warfarin) — has a specific, legitimate need: knowing when their generic's maker changes, because consistency matters clinically.

## 2. Product vision & objectives

**Vision:** an educational, privacy-first companion that helps people understand who makes their generics, read the public regulatory record with honest framing, and maintain a monthly monitoring rhythm — without ever pretending to be medical advice.

### Objectives

| # | Objective | Measure (see §9 — this product ships no telemetry) |
|---|---|---|
| O1 | Users can identify a generic's labeler and registered maker from its NDC | Manual usability testing: 5/5 participants complete an NDC lookup unaided |
| O2 | Users can find real recall records and facility registrations for their own medicines | Same |
| O3 | Users sustain a monthly monitoring rhythm | Structured user check-ins at 3 months: did they run ≥2 monthly reports |
| O4 | Users understand what the tool does NOT do | Survey: ≥80% correctly answer "this tool never rates real companies" |

### Non-goals (deliberate)

- **Rate, score, rank, or badge real companies.** Permanent non-goal — for honesty (public data is incomplete) and legal reasons (defamation exposure). The 0-100 traffic-light experience exists **only** on fictional teaching data.
- **Give medical advice or switching instructions.** Alternatives are framed as "candidates to discuss with your pharmacist."
- **Store any user data server-side.** No accounts, no database, no analytics.
- **Send email or run scheduled checks autonomously.** Reminders are the user's own calendar file; reports are handed off via the user's own email client.

## 3. Target users

**Primary — The vigilant medicine manager.** Manages medications for self or family (often multiple people, often older adults on chronic generics). Motivated, non-expert in regulation. Needs: simple input, plain-language results, a repeatable monthly routine, zero privacy exposure.

**Secondary — The pharmacist-conversation preparer.** Brings specific questions to a professional. Needs: lot numbers, firm names, recall classes — evidence they can quote accurately.

**Tertiary — Educators / writers.** Use the teaching sandbox to explain quality-signal concepts. Benefit from the transparent, published methodology.

## 4. Key use cases

| # | Use case | Priority |
|---|---|---|
| UC1 | Scan or type an NDC; learn what it does and doesn't identify | P0 |
| UC2 | For a fictional product, read a transparent scored result (traffic light, flags, capped events) — the training mode | P0 |
| UC3 | For a real drug name/NDC, see real recall records and registered facilities — evidence only, never scored | P0 |
| UC4 | Save one medicine list per person, on-device only | P0 |
| UC5 | Generate a monthly report per person from real FDA records | P0 |
| UC6 | Download a recurring monthly calendar reminder per person | P0 |
| UC7 | Hand the report to the person's email in one click | P1 |
| UC8 | Export/import medicine lists as files (backup, preview-sandbox survival) | P1 |
| UC9 | Understand the methodology and every legal disclaimer, always visible | P0 |

## 5. Functional requirements

### 5.1 Input layer
- **FR1 (P0):** NDC entry via keyboard, 10-11 digits, dashed or not; validation rejects non-NDC payloads with a safe message (HTML-escaped).
- **FR2 (P0):** Camera barcode scanning with two decode paths: native `BarcodeDetector` (Chrome/Edge) and a ZXing software decoder loaded on first use where native is absent (iOS Safari). Camera-unavailable and decoder-load failures render distinct honest messages; manual entry is always the fallback.
- **FR3 (P1):** Mock catalog of 15 fictional products for guided exploration (sample chips).

### 5.2 Teaching mode (fictional scoring)
- **FR4 (P0):** 0-100 illustrative quality-signal index over five weighted criteria (inspection 30%, recalls 25%, batch consistency 20%, supply 15%, transparency 10%); green/yellow/red tiers at 70/40.
- **FR5 (P0):** Hazard caps: active product-level Class I recall / OAI / import alert → cap 24; active Class II recall / open NTI bioequivalence inquiry → cap 49. Resolved and labeler-wide events never cap.
- **FR6 (P0):** Coverage display: unassessed criteria excluded with weights renormalized and the non-neutrality disclosed.
- **FR7 (P0):** Alternatives: below 60, up to three higher-scoring same-subcategory labelers, framed as pharmacist-discussion candidates.
- **FR8 (P0):** Fictional-data badge on every scored view; therapeutic-equivalence status shown as a categorical badge, never scored.

### 5.3 Live regulatory check (real data, records only)
- **FR9 (P0):** NDC Directory identity lookup (labeler, product) with honest no-match wording.
- **FR10 (P0):** Recall enforcement records (classification, firm, lots, dates, status) via openFDA, with the FDA's own unvalidated-data disclaimer shown.
- **FR11 (P0):** Registered manufacturing facilities from ProPublica's Rx Inspector release (registrant, country, FEI, linkage method, application numbers), with registrant ≠ labeler caveat, release vintage, ~80% coverage caveat, and links out to Rx Inspector for inspection histories.
- **FR12 (P0):** Provenance block on every result: sources, licenses, attribution, vintage, "absence of records is not evidence of absence."
- **FR13 (P0):** No score, badge, color-coded judgment, or comparative language applied to any real company.

### 5.4 Education
- **FR14 (P0):** Per-ingredient education (uses, cautions, monitoring) sourced from MedlinePlus, with source attribution; NTI-specific notes for levothyroxine/warfarin including TSH/INR recheck guidance framed as questions for a prescriber.

### 5.5 Medicine lists & monthly rhythm
- **FR15 (P0):** Multi-person lists (name, optional email, up to 10 meds each), stored on-device (browser storage where available; in-memory + file export/import where the environment forbids storage).
- **FR16 (P0):** Monthly report per person: sequential real openFDA recall queries per medicine; source failures distinguished from no-match.
- **FR17 (P0):** Per-person recurring monthly .ics calendar reminder with the medicine list embedded and a never-stop-medication note.
- **FR18 (P1):** One-click email handoff (mailto with the full report drafted; the app never sends email itself).

### 5.6 Legal & trust surface
- **FR19 (P0):** Persistent, non-dismissible disclaimer bar visible at all times and all scroll positions, desktop and mobile.
- **FR20 (P0):** Full Terms & Disclaimer dialog (10 sections: educational purpose, no advice/no provider relationship, fictional data, third-party data "as is" with licenses and non-endorsement, no warranty, liability limitation, user responsibility, privacy, emergencies, changes), reachable from three entry points.
- **FR21 (P0):** Attribution footer satisfying the CC BY-NC obligation (FDA public-domain credit + ProPublica attribution with license link).

## 6. Non-functional requirements

| # | Requirement |
|---|---|
| NFR1 | **Privacy (hard constraint):** no accounts, no server-side storage, no analytics, no telemetry. Only network calls: FDA openFDA API and the Rx Inspector data file, carrying drug names only. Names/emails never leave the device except via user-chosen calendar/email files. |
| NFR2 | **Performance:** static app, no build step; live check responds in ≤ a few seconds (openFDA); facility data is a one-time ~3 MB download per visit, in-memory only; monthly reports sequential to respect rate limits (≤10 meds/list). |
| NFR3 | **Accessibility:** semantic markup, aria-live status regions, labeled inputs, keyboard-operable dialogs, ≥4.5:1 contrast on body text. |
| NFR4 | **Browser support:** evergreen Chrome/Edge/Safari/Firefox; camera degrades gracefully (FR2); storage degrades gracefully (FR15); everything else works everywhere. |
| NFR5 | **Legal compliance:** persistent disclaimer (FR19-21); licenses honored — openFDA CC0/public domain, Rx Inspector **CC BY-NC 4.0 → the product must remain noncommercial**; no FDA/ProPublica marks or implied endorsement. |
| NFR6 | **Security:** all user input and third-party data HTML-escaped before DOM insertion (injection-tested); no eval of external data. |
| NFR7 | **Honesty in failure:** every source failure, no-match, and coverage gap renders its distinct truthful wording — never "no findings." |

## 7. Constraints & dependencies

- **CC BY-NC 4.0** on the Rx Inspector dataset: product must stay free/noncommercial; monetization would require removing the dataset or negotiating with ProPublica.
- **openFDA limits:** 1,000 queries/day per IP without a key; free key raises to 120,000/day. Budget for growth.
- **Data recency:** Rx Inspector release is a snapshot (currently November 2025) — vintage is displayed, and the NDC→factory mapping can be stale (silent switch applies to the data too).
- **No backend by design:** static hosting only; the sandboxed preview environment forbids browser storage APIs (hence the adapter pattern and file export/import).

## 8. Distribution & deployment

The product ships as one codebase in three forms:

| Channel | What it is | Audience | Medicine lists |
|---|---|---|---|
| **GitHub Pages** (primary public) | `https://gravishankar.github.io/GenericCheck/` — served from the `master` branch of the owner's repo | Anyone with the link; no account needed | Last for the visit; Export/Import backup |
| **Standalone single file** (`genericheck-standalone.html`) | A downloadable one-file build with a storage adapter | Personal copies for committed monthly users | Auto-save on the device where it runs |
| **Development preview** (private) | The Perplexity `/computer/a` preview the app is developed in | The owner and collaborators | Last for the visit (sandboxed environment) |

Deployment facts: updates are a `git push` to `master` (Pages rebuilds in ~1-2 minutes); a `.nojekyll` file is committed so GitHub serves the files as-is; the repo is the source of truth. The camera scanner requires https — all public channels serve over https, so scanning works everywhere including iPhone (software-decoder fallback). A `pplx.app` publication was attempted and remains unreliable due to a platform serving issue — not used for distribution; GitHub Pages is the public home. **The standalone build must be regenerated (`scripts/build-standalone.py`) after any source change** — see the engineering guide.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Users treat records as verdicts; act without a pharmacist | Never-badged records, mandatory "discuss with your pharmacist" framing, persistent disclaimer, emergency clause |
| Defamation exposure from real-company judgments | Permanent non-goal; records-only design; legal review before wider distribution |
| Stale facility mapping misleads a user about who made their bottle | Registrant ≠ labeler caveat, lot-number guidance, vintage display, "unconfirmed" states |
| License breach if product is commercialized | License flagged in README, PRD, and engineering doc as a standing condition |
| Data source unavailability (FDA API, CDN, GitHub raw) | Distinct failure states with honest wording; manual-entry fallbacks everywhere |
| Users lose lists (cleared browser data, sandboxed preview) | Export/import files; standalone version auto-saves; docs explain both |

## 10. Success metrics

This product deliberately ships **no telemetry** (NFR1), so success is measured qualitatively:

- **Usability:** 5-participant moderated tests of the three core flows (NDC lookup, live check, monthly report).
- **Rhythm:** user check-ins at 3 months (did they run ≥2 monthly reports; did the calendar file stick).
- **Comprehension:** short survey — do users correctly state what the tool never does (rate real companies, give medical advice, store their data)?
- **Trust signals:** unprompted user feedback citing the honesty framing; pharmacist-reported quality of user-prepared questions.

## 11. Roadmap (proposed, not committed)

| Priority | Candidate | Note |
|---|---|---|
| P2 | Orange Book TE-code lookup integration | Already modeled categorically; needs an API/data pipeline |
| P2 | EU/UK/Canada regulator records (EudraGMDP, MHRA, Health Canada) | Extends the monitoring checklist; no openFDA-equivalent APIs |
| P2 | PWA / offline service worker for the standalone build | Deployed preview environment constrains what can ship hosted |
| P2 | Host the standalone auto-save version at `/standalone.html` on the public site | Lets committed users get the auto-saving version as a link instead of a file; pending owner decision |
| P3 | i18n | Strings currently inline |
| P3 | Automated monthly email | Requires an email connector + scheduled task outside this codebase; breaks the serverless design — explicit product decision required |
| — | Backend sync of medicine lists | **Rejected** unless users demand it; would break the local-first privacy model. Export/import files must keep working regardless |

## 12. Open questions

1. ~~How should the app be distributed?~~ **Resolved:** GitHub Pages is the public home; the standalone file is the personal-copy channel.
2. Is a licensed-attorney review of the Terms & Disclaimer warranted before distribution beyond friends and family? (Recommended.)
3. If ProPublica updates the Rx Inspector release, who owns the vintage-refresh chore? (Currently: maintainers, per the engineering guide.)
4. Should a custom domain (e.g. `genericheck.app`) be pointed at GitHub Pages? Cosmetic + discoverability decision only.
5. First-user feedback round: the original requester is exploring the app; her feedback should drive the next iteration (v1.2).

---

*GeneriCheck is an educational prototype. It does not rate real companies; all mock data is fictional; nothing in this document or the product is medical advice.*
