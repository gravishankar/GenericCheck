/* GeneriCheck mock database — 15 fictional generic-drug products.
   Manufacturers ("Demo Labs A–F"), NDCs, events, and scores are fictional
   teaching fixtures. Active-ingredient education is real and sourced.
   Pipeline (Yuka pattern): NDC lookup -> quality-signal index -> flags ->
   same-medicine candidates.

   Event model — scope and status drive the rules:
   - kind: 'recall' | 'inspection' | 'import-alert' | 'bioequiv-inquiry' | 'shortage'
   - level: 'product' (this product/line) | 'labeler' (other products, context only)
   - status: active-ish strings cap the index; 'resolved' events inform the
     historical track-record criteria but never cap. */

'use strict';

/* Real, sourced medication education per active ingredient. */
const DRUG_EDUCATION = {
  atorvastatin: {
    ingredient: 'Atorvastatin', drugClass: 'Statin',
    uses: 'Lowers LDL ("bad") cholesterol and reduces the risk of heart attack and stroke in people with high cholesterol or heart-disease risk factors.',
    cautions: 'Tell your prescriber about unexplained muscle pain, tenderness or weakness, dark urine, or yellowing of the skin or eyes — these can signal rare muscle or liver injury.',
    monitoring: 'Lipid panels to track response; your provider watches for signs of liver or muscle problems.',
    nti: false,
    source: { name: 'MedlinePlus — Atorvastatin', url: 'https://medlineplus.gov/druginfo/meds/a600045.html' },
  },
  levothyroxine: {
    ingredient: 'Levothyroxine', drugClass: 'Thyroid hormone',
    uses: 'Replaces missing thyroid hormone in hypothyroidism, usually taken once a day for life.',
    cautions: 'This is a narrow-therapeutic-index (NTI) medicine — small dose differences can change its effect. Take it consistently, at the same time each day, and tell your prescriber if your pharmacy switches manufacturers.',
    monitoring: 'TSH blood tests after any dose change (commonly 6–8 weeks) and at least yearly once stable.',
    nti: true,
    ntiNote: 'Narrow therapeutic index drug: if the manufacturer changes, your prescriber may recheck TSH.',
    source: { name: 'MedlinePlus — Levothyroxine', url: 'https://medlineplus.gov/druginfo/meds/a682461.html' },
  },
  metformin: {
    ingredient: 'Metformin (extended-release)', drugClass: 'Biguanide antidiabetic',
    uses: 'Used with diet and exercise to improve blood-sugar control in type 2 diabetes.',
    cautions: 'Rare but serious lactic acidosis is a risk if kidneys are impaired; heavy alcohol use increases the risk. It may be paused before surgery or contrast X-rays and restarted after kidney function is rechecked.',
    monitoring: 'Kidney function at least yearly; vitamin B12 levels periodically with long-term use.',
    nti: false,
    source: { name: 'MedlinePlus — Metformin', url: 'https://medlineplus.gov/druginfo/meds/a696005.html' },
  },
  lisinopril: {
    ingredient: 'Lisinopril', drugClass: 'ACE inhibitor',
    uses: 'Treats high blood pressure and heart failure; helps protect the heart after a heart attack.',
    cautions: 'Avoid potassium-containing salt substitutes and NSAIDs like ibuprofen unless your prescriber approves. Stop and seek help for any swelling of the face, lips, or tongue. Not used in pregnancy.',
    monitoring: 'Blood pressure at regular visits; periodic potassium and kidney tests.',
    nti: false,
    source: { name: 'MedlinePlus — Lisinopril', url: 'https://medlineplus.gov/druginfo/meds/a692051.html' },
  },
  sertraline: {
    ingredient: 'Sertraline', drugClass: 'SSRI antidepressant',
    uses: 'Treats depression, anxiety disorders, PTSD, OCD, and related conditions.',
    cautions: 'Antidepressants can increase suicidal thoughts in people up to age 24 — watch for new or worsening mood changes. Do not stop abruptly; bleeding risk rises with aspirin/NSAIDs/warfarin; never combine with MAOIs.',
    monitoring: 'Close follow-up in the first months of treatment and after dose changes.',
    nti: false,
    source: { name: 'MedlinePlus — Sertraline', url: 'https://medlineplus.gov/druginfo/meds/a697048.html' },
  },
  warfarin: {
    ingredient: 'Warfarin', drugClass: 'Anticoagulant (vitamin K antagonist)',
    uses: 'Prevents harmful blood clots in atrial fibrillation, mechanical valves, and clotting disorders.',
    cautions: 'Report unusual bleeding or bruising, dark or tarry stools, or nosebleeds. Keep vitamin K intake (leafy greens) consistent week to week, and tell every provider about all medicines and supplements — interactions are common.',
    monitoring: 'Regular INR blood tests; the dose is adjusted to keep the INR in your target range (often 2–3).',
    nti: true,
    ntiNote: 'Narrow therapeutic index drug: if the manufacturer changes, your prescriber may recheck INR.',
    source: { name: 'MedlinePlus — Warfarin', url: 'https://medlineplus.gov/druginfo/meds/a682277.html' },
  },
  amlodipine: {
    ingredient: 'Amlodipine', drugClass: 'Calcium channel blocker',
    uses: 'Treats high blood pressure and certain types of chest pain (angina).',
    cautions: 'Ankle or leg swelling is a common side effect. Report worsening chest pain, a rapid or irregular heartbeat, or fainting.',
    monitoring: 'Blood pressure at regular visits.',
    nti: false,
    source: { name: 'MedlinePlus — Amlodipine', url: 'https://medlineplus.gov/druginfo/meds/a692044.html' },
  },
};

/* 15 fictional generic products. Numeric attribute values are simulated
   teaching values (null = not assessed). Therapeutic-equivalence status is
   a categorical mock field, deliberately NOT scored. */
const PRODUCTS = [
  {
    ndc: '90909-0011-10', labeler: 'Demo Labs A', ingredientKey: 'atorvastatin',
    subcategory: 'Atorvastatin 10 mg oral tablet', teStatus: 'ab',
    attrs: { inspectionRecord: 100, recallHistory: 100, batchConsistency: 90, supplyReliability: 85, qualityTransparency: 80 },
    events: [],
  },
  {
    ndc: '90910-0011-30', labeler: 'Demo Labs B', ingredientKey: 'atorvastatin',
    subcategory: 'Atorvastatin 10 mg oral tablet', teStatus: 'ab',
    attrs: { inspectionRecord: 65, recallHistory: 40, batchConsistency: 65, supplyReliability: 70, qualityTransparency: 55 },
    events: [
      { kind: 'recall', class: 'II', level: 'product', when: 'March 2026', scope: 'two lots of 10 mg tablets', status: 'resolved — product back in distribution' },
      { kind: 'inspection', outcome: 'VAI', level: 'product', when: 'January 2026', scope: 'packaging line 3 (Form FDA 483)', status: 'voluntary corrections accepted' },
    ],
  },
  {
    ndc: '90911-0011-90', labeler: 'Demo Labs C', ingredientKey: 'atorvastatin',
    subcategory: 'Atorvastatin 10 mg oral tablet', teStatus: 'ab',
    attrs: { inspectionRecord: 30, recallHistory: 0, batchConsistency: 45, supplyReliability: 55, qualityTransparency: 30 },
    events: [
      { kind: 'recall', class: 'I', level: 'product', when: 'August 2026', scope: 'three lots — subpotency found on stability testing', status: 'ongoing' },
      { kind: 'inspection', outcome: 'OAI', level: 'product', when: 'February 2026', scope: 'main finished-dose facility', status: 'remediation under FDA review' },
    ],
  },
  {
    ndc: '90909-0021-30', labeler: 'Demo Labs A', ingredientKey: 'levothyroxine',
    subcategory: 'Levothyroxine 50 mcg oral tablet', teStatus: 'ab',
    attrs: { inspectionRecord: 95, recallHistory: 100, batchConsistency: 85, supplyReliability: 80, qualityTransparency: 75 },
    events: [],
  },
  {
    ndc: '90912-0021-30', labeler: 'Demo Labs D', ingredientKey: 'levothyroxine',
    subcategory: 'Levothyroxine 50 mcg oral tablet', teStatus: 'inquiry',
    attrs: { inspectionRecord: 75, recallHistory: 90, batchConsistency: 55, supplyReliability: 75, qualityTransparency: 60 },
    events: [
      { kind: 'bioequiv-inquiry', level: 'product', when: 'May 2026', scope: 'dissolution variability across batches of 50 mcg tablets', status: 'open' },
    ],
  },
  {
    ndc: '90909-0031-60', labeler: 'Demo Labs A', ingredientKey: 'metformin',
    subcategory: 'Metformin 500 mg ER oral tablet', teStatus: 'ab',
    attrs: { inspectionRecord: 90, recallHistory: 100, batchConsistency: 80, supplyReliability: 85, qualityTransparency: null },
    events: [],
  },
  {
    ndc: '90913-0031-60', labeler: 'Demo Labs E', ingredientKey: 'metformin',
    subcategory: 'Metformin 500 mg ER oral tablet', teStatus: 'ab',
    attrs: { inspectionRecord: 65, recallHistory: 100, batchConsistency: 60, supplyReliability: 50, qualityTransparency: 50 },
    events: [
      { kind: 'inspection', outcome: 'VAI', level: 'product', when: 'June 2026', scope: 'granulation suite (Form FDA 483)', status: 'corrections under review' },
      { kind: 'shortage', level: 'product', when: '2024–2026', scope: '500 mg ER tablets, multiple quarters', status: 'resolved for now' },
    ],
  },
  {
    ndc: '90910-0041-90', labeler: 'Demo Labs B', ingredientKey: 'lisinopril',
    subcategory: 'Lisinopril 10 mg oral tablet', teStatus: 'ab',
    attrs: { inspectionRecord: 60, recallHistory: 100, batchConsistency: 70, supplyReliability: 65, qualityTransparency: 45 },
    events: [
      { kind: 'inspection', outcome: 'VAI', level: 'product', when: 'January 2026', scope: 'packaging line 3 (Form FDA 483)', status: 'voluntary corrections accepted' },
    ],
  },
  {
    ndc: '90914-0041-90', labeler: 'Demo Labs F', ingredientKey: 'lisinopril',
    subcategory: 'Lisinopril 10 mg oral tablet', teStatus: 'ab',
    attrs: { inspectionRecord: 35, recallHistory: 100, batchConsistency: 50, supplyReliability: 40, qualityTransparency: 25 },
    events: [
      { kind: 'import-alert', level: 'product', when: 'November 2025', scope: 'manufacturing site listed on FDA import alert', status: 'active' },
    ],
  },
  {
    ndc: '90910-0051-30', labeler: 'Demo Labs B', ingredientKey: 'sertraline',
    subcategory: 'Sertraline 50 mg oral tablet', teStatus: 'ab',
    attrs: { inspectionRecord: 70, recallHistory: 100, batchConsistency: 75, supplyReliability: 60, qualityTransparency: 55 },
    events: [
      { kind: 'inspection', outcome: 'VAI', level: 'product', when: 'January 2026', scope: 'packaging line 3 (Form FDA 483)', status: 'voluntary corrections accepted' },
    ],
  },
  {
    ndc: '90913-0051-30', labeler: 'Demo Labs E', ingredientKey: 'sertraline',
    subcategory: 'Sertraline 50 mg oral tablet', teStatus: 'ab',
    attrs: { inspectionRecord: 55, recallHistory: 70, batchConsistency: 50, supplyReliability: 65, qualityTransparency: 40 },
    events: [
      { kind: 'recall', class: 'III', level: 'product', when: 'April 2026', scope: 'one lot — labeling error', status: 'resolved' },
    ],
  },
  {
    ndc: '90912-0061-10', labeler: 'Demo Labs D', ingredientKey: 'warfarin',
    subcategory: 'Warfarin 5 mg oral tablet', teStatus: 'inquiry',
    attrs: { inspectionRecord: 65, recallHistory: 100, batchConsistency: 50, supplyReliability: 60, qualityTransparency: 45 },
    events: [
      { kind: 'bioequiv-inquiry', level: 'product', when: 'June 2026', scope: 'NTI bioequivalence questions on 5 mg tablets', status: 'open' },
    ],
  },
  {
    ndc: '90913-0061-10', labeler: 'Demo Labs E', ingredientKey: 'warfarin',
    subcategory: 'Warfarin 5 mg oral tablet', teStatus: 'ab',
    attrs: { inspectionRecord: 50, recallHistory: 100, batchConsistency: 45, supplyReliability: 40, qualityTransparency: 35 },
    events: [
      { kind: 'recall', class: 'III', level: 'labeler', when: 'April 2026', scope: 'one lot of a different product (sertraline) — context only', status: 'resolved' },
    ],
  },
  {
    ndc: '90909-0071-90', labeler: 'Demo Labs A', ingredientKey: 'amlodipine',
    subcategory: 'Amlodipine 5 mg oral tablet', teStatus: 'ab',
    attrs: { inspectionRecord: 85, recallHistory: 100, batchConsistency: 80, supplyReliability: 75, qualityTransparency: 65 },
    events: [],
  },
  {
    ndc: '90912-0071-90', labeler: 'Demo Labs D', ingredientKey: 'amlodipine',
    subcategory: 'Amlodipine 5 mg oral tablet', teStatus: 'ab',
    attrs: { inspectionRecord: 60, recallHistory: 100, batchConsistency: 55, supplyReliability: 30, qualityTransparency: 50 },
    events: [
      { kind: 'shortage', level: 'product', when: '2025–2026', scope: '5 mg tablets, two quarters', status: 'resolved for now' },
    ],
  },
];
