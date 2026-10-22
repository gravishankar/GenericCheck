# GeneriCheck

**A transparent quality-signal explorer for prescription generic drugs.**

GeneriCheck answers three practical questions about a generic medicine:

1. **Who makes it?** — What the NDC barcode actually identifies (the labeler), what it doesn't (the factory), and how to find the real maker.
2. **What's on the regulatory record?** — FDA recalls, inspection outcomes, import alerts, and therapeutic-equivalence status, presented with honest evidence framing.
3. **What should I discuss with my pharmacist?** — Same-medicine alternatives with better quality signals, framed as conversation starters, never as switching instructions.

> **Important:** GeneriCheck is an educational tool. It is not medical advice, and it never tells you to stop or change a medication. Every score is a clearly-labeled *illustrative quality-signal index* built on fictional teaching data — real regulatory records (from the FDA) are shown separately and are never scored. Discuss anything you find here with a pharmacist or prescriber.

---

## Contents

- [Two ways to run the app](#two-ways-to-run-the-app)
- [Quick start](#quick-start)
- [Using the app](#using-the-app)
- [Medicine lists and monthly reminders](#medicine-lists-and-monthly-reminders)
- [Understanding the score](#understanding-the-score)
- [Privacy: what stays on your device](#privacy-what-stays-on-your-device)
- [Honest limitations](#honest-limitations)
- [Data sources](#data-sources)
- [Troubleshooting](#troubleshooting)

---

## Two ways to run the app

It's the same app with the same features in both forms — the difference is where your medicine list lives and how you get updates.

| | Hosted preview ("GeneriCheck — Generic drug quality explorer") | Standalone file (`genericheck-standalone.html`) |
|---|---|---|
| **What it is** | A link you open in any browser | A single HTML file you download and keep |
| **Medicine lists** | Last for the visit — use Export to save a backup file, Import to restore | Auto-save on the device where you run the file |
| **Updates** | Automatic — the hosted copy is redeployed when the app changes | Frozen — replace the file to get updates |
| **Internet needed** | Yes (it's a website) | Only for live FDA lookups and facility data; the app itself runs offline |
| **Best for** | Trying the app, one-off lookups, iPhone scanning (hosted pages get the smoothest camera behavior) | Ongoing monthly use by each person — family, friends, anyone you share the file with |

**Rule of thumb:** try the hosted link first; if someone will use the monthly workflow regularly, give them the standalone file and their calendar reminder — their list then lives on their own device with no account, and nothing about them is stored anywhere else.

## Quick start

1. Open the app (preview link, or double-click the downloaded `genericheck-standalone.html` file).
2. Try a **sample NDC** from the home screen (e.g. `90910-0011-30`) to see a full graded result.
3. Type a **real drug name** (e.g. `metformin`) into the *Live regulatory check* to see real FDA recall records.
4. Build a **medicine list** for each person and download their monthly **calendar reminder**.

No account, no sign-up, no installation.

---

## Using the app

### 1. Identify a product — scan or type

- **Scan barcode** — uses your device camera. Chrome and Edge use the browser's built-in barcode detection; browsers without it (notably Safari on iPhone) automatically fall back to a software decoder loaded on first use, which needs an internet connection that once. Typing the NDC always works as the manual alternative.
- **Type the NDC** — the 10–11 digit code on the label, with or without dashes.
- The app also explains what the NDC identifies: the **labeler** (the company on the label — it may be the maker, or a repackager), the product, and the package. It deliberately does *not* claim to identify the factory.

### 2. Read a graded result (mock teaching data)

Each product in the mock catalog gets a traffic-light score with a breakdown of five quality signals, risk and positive flags, documented events (recalls, inspections), and — when relevant — higher-scoring candidates of the same medicine. Everything in this mode is **fictional and clearly badged**; it exists to teach you how to read quality signals.

### 3. Check real FDA records (live check)

Type a drug name or NDC and the app queries the FDA's openFDA API directly:

- **NDC Directory** — confirms product identity, labeler, and marketing dates.
- **Recall enforcement reports** — real recall records with classification, recalling firm, lots, and status.

A few things the app is careful to say: "no matching records found in this query" is not the same as "no recalls exist anywhere", and a recall record does not by itself prove *your* bottle is affected — check the lot number with your pharmacist.

### 4. Learn about the medicine

Each result includes plain-language education for the active ingredient (uses, cautions, monitoring) sourced from [MedlinePlus](https://medlineplus.gov/druginfo/meds/a682461.html), plus context for narrow-therapeutic-index drugs like levothyroxine and warfarin.

---

## Medicine lists and monthly reminders

This is the core workflow for ongoing use — one list per person.

1. **Add a person**: name, optional email, and each medicine from the label (drug, strength, maker, NDC if shown).
2. **Save** — on the standalone version, this happens automatically on the device. In the hosted preview, use **Export** to save the list as a JSON backup file and **Import** to restore it.
3. **Run monthly report** — queries real FDA recall records for every medicine on the list and renders a per-person report with what to discuss with a pharmacist.
4. **Calendar reminder (.ics)** — downloads a recurring monthly event for that person (works with Google Calendar, Apple Calendar, Outlook). The event includes their medicine list in the description.
5. **Email report** — opens the person's own email app with the full report drafted. The app itself never sends email.

**Monthly rhythm**: the calendar file reminds you; open the app, run the monthly report, and note anything new. Update the list whenever a label shows a new maker — and record the lot number from each bottle so recall notices can be checked against it.

---

## Understanding the score

The mock index runs from 0 to 100 across five weighted signals:

| Signal | Weight | What it reflects |
|---|---|---|
| FDA inspection record | 30% | NAI / VAI / OAI inspection outcomes |
| Recall history | 25% | FDA recall classes I–III |
| Batch consistency | 20% | Potency and dissolution variability (simulated) |
| Supply reliability | 15% | Shortage history |
| Quality transparency | 10% | Voluntarily published quality data |

- **Traffic lights**: green ≥ 70, yellow 40–69, red < 40.
- **Hazard caps**: an *active, product-level* Class I recall, OAI inspection, or import alert caps the index at 24; an active Class II recall or open NTI bioequivalence inquiry caps it at 49. Resolved events and labeler-wide events never cap — they only inform the historical signals.
- **Coverage**: if a signal can't be assessed, it is excluded and weights are re-normalized — which is *not* neutral, so the app always shows what fraction of the weight was actually assessed.
- **Alternatives**: below 60, the app suggests up to three higher-scoring labelers of the same medicine — as *candidates to discuss with your pharmacist*, not switching instructions.

Therapeutic-equivalence status (Orange Book "AB") is shown as a categorical badge and deliberately never scored — it is a yes/no determination, not a graduated ranking.

---

## Privacy: what stays on your device

- **Medicine lists, names, and emails never leave the device.** There is no server, no account, no database.
- The only network requests the app makes go to the **FDA's public openFDA API** and carry only the drug names being checked.
- Files you generate (calendar .ics, email drafts, JSON exports) leave the device only when you choose to use them.
- Clearing browser data clears saved lists — keep an **Export** backup file.

---

## Legal & disclaimers

GeneriCheck keeps its legal notices visible at all times, in three layers:

1. **A persistent red banner** fixed to the bottom of every screen, on every page, at every scroll position: *"Educational use only — not medical advice. Do not stop or change any medication based on this tool. Provided 'as is' — no warranty, no liability."* It cannot be dismissed.
2. **The full Terms & Disclaimer dialog** — one tap from the banner, the top notice, or the footer — covering: educational purpose only; no medical, legal, or professional advice and no provider relationship of any kind; fictional data disclosure; third-party data (FDA openFDA, ProPublica, MedlinePlus) provided "as is" with no affiliation or endorsement; no reliance and no warranty; limitation of liability to the maximum extent permitted by law; user responsibility; privacy (no data collection); emergencies (call 911, not this app); and changes to the terms.
3. **In-place notices on every result**: the fictional-data badge on mock scores, "never scored" labels on real FDA records, and pharmacist-consultation framing on every recommendation.

GeneriCheck is an educational prototype and is not a substitute for professional judgment. If any information here conflicts with your prescriber's guidance, follow your prescriber.

## Data sources & licensing

The live check and monthly reports use real, openly licensed data — displayed as records only, never scored or judged:

| Source | What it provides | License |
|---|---|---|
| [FDA openFDA API](https://open.fda.gov/apis/) | Product identity (NDC Directory) and recall enforcement records | Public domain ([CC0](https://open.fda.gov/license/)) |
| [ProPublica Rx Inspector data release](https://github.com/propublica/rx-inspector-data) | Registered manufacturing facilities linked to product NDCs (release: November 2025) | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — noncommercial, attribution required |
| [MedlinePlus](https://medlineplus.gov/druginfo/meds/a682461.html) | Medicine education | Public domain |

Attribution is shown on every result and in the footer. Because the Rx Inspector data is licensed for noncommercial use only, this app must stay free and noncommercial. The app is not affiliated with or endorsed by the FDA or ProPublica.

## Honest limitations

- The **mock scoring is fictional** (fictional manufacturers, clearly badged). It teaches signal-reading; it does not rate real companies.
- **Live FDA data is never scored or ranked** — deliberately.
- "No matching records" means the query found nothing — not that a drug or factory is problem-free.
- On iPhone/iPad, scanning uses a software decoder loaded from a CDN on first use (Safari lacks the native barcode API) — so the first scan needs an internet connection. Real-device camera behavior could not be fully verified in automated testing; typing the NDC always works.
- The app cannot send email or run checks on a schedule by itself — the calendar file and email handoff are the honest mechanisms for that.

## Data sources

- [FDA openFDA API](https://open.fda.gov/apis/drug/enforcement/) — recalls and NDC Directory (live check and monthly reports)
- [ProPublica Rx Inspector](https://projects.propublica.org/rx-inspector/) — links NDCs to registered factories and their inspection timelines
- [FDA Orange Book](https://www.fda.gov/drugs/drug-approvals-and-databases/approved-drug-products-therapeutic-equivalence-evaluations-orange-book) — therapeutic-equivalence codes
- [MedlinePlus](https://medlineplus.gov/druginfo/meds/a682461.html) — medicine education content
- [FDA inspection classifications](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/inspection-basics/inspection-classifications) and [recall classes](https://www.fda.gov/safety/industry-guidance-recalls/recalls-background-and-definitions) — methodology grounding

## Troubleshooting

| Problem | What to do |
|---|---|
| Camera won't start | The page may not be in a secure context, the camera permission was denied, or (Safari) the software decoder couldn't load — check your connection and retry. Typing the NDC always works. |
| "No matching records found" | The query found nothing — that's not "no recalls exist". Verify the drug name/NDC spelling. |
| Lists disappeared after a visit (hosted preview) | Expected in the restricted preview. Use Export before leaving, or use the standalone file, which saves automatically. |
| Monthly report shows a source failure | The FDA API was unreachable or rate-limited — wait a minute and re-run. This is a check failure, not "no findings". |
| ICS file didn't import | Open your calendar app and use its "Import" or "Open calendar file" option on the downloaded .ics. |

---

*GeneriCheck is a prototype for education. It does not rate real manufacturers; all mock data is fictional. Nothing here replaces advice from your pharmacist or prescriber.*
