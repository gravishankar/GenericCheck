/* GeneriCheck mock database — 15 fictional generic-drug products.
   Manufacturers ("Demo Labs A–F"), NDCs, events, and scores are fictional
   teaching fixtures. Active-ingredient education is real and sourced.
   The Yuka-style pipeline: NDC lookup -> quality-signal score -> flags ->
   same-medicine alternatives. */

'use strict';

/* Real, sourced medication education per active ingredient. */
const DRUG_EDUCATION = {
  atorvastatin: {
    ingredient: 'Atorvastatin', drugClass: 'Statin',
    uses: 'Lowers LDL ("bad") cholesterol and reduces the risk of heart attack and stroke in people with high cholesterol or heart-disease risk factors.',
    cautions: 'Tell your prescriber about unexplained muscle pain, tenderness or weakness, dark urine, or yellowing of the skin or eyes — these can signal rare muscle or liver injury.',
    monitoring: 'Periodic liver function tests and lipid panels; the dose is tuned to your cholesterol target.',
    nti: false,
    source: { name: 'MedlinePlus — Atorvastatin', url: 'https://medlineplus.gov/druginfo/meds/a600045.html' },
  },
  levothyroxine: {
    ingredient: 'Levothyroxine', drugClass: 'Thyroid hormone',
    uses: 'Replaces missing thyroid hormone in hypothyroidism, usually taken once a day for life.',
    cautions: 'This is a narrow-therapeutic-index (NTI) medicine — small dose differences can change its effect. Take it consistently, at the same time each day, and tell your prescriber if your pharmacy switches manufacturers.',
    monitoring: 'TSH blood tests about 6–8 weeks after any dose change, then periodically (often yearly).',
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
    cautions: 'Antidepressants can increase suicidal thoughts in people under 24 — watch for new or worsening mood changes. Do not stop abruptly; bleeding risk rises with aspirin/NSAIDs/warfarin; never combine with MAOIs.',
    monitoring: 'Close follow-up in the first months and after dose changes.',
    nti: false,
    source: { name: 'MedlinePlus — Sertraline', url: 'https://medlineplus.gov/druginfo/meds/a697048.html' },
  },
  warfarin: {
    ingredient: 'Warfarin', drugClass: 'Anticoagulant (vitamin K antagonist)',
    uses: 'Prevents harmful blood clots in atrial fibrillation, mechanical valves, and clotting disorders.',
    cautions: 'This is a narrow-therapeutic-index (NTI) medicine. Keep vitamin K intake (leafy greens) consistent week to week, and tell every provider about all medicines and supplements — interactions are common.',
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

/* 15 fictional generic products. "quality" attributes are 0–100 teaching
   values (null = not assessed); booleans trigger barrier caps. */
const PRODUCTS = [
  {
    ndc: '90909-0011-10', labeler: 'Demo Labs A', ingredientKey: 'atorvastatin',
    subcategory: 'Atorvastatin 10 mg oral tablet',
    attrs: { inspectionRecord: 100, recallHistory: 100, batchConsistency: 90, supplyReliability: 85, qualityTransparency: 80, bioequivalenceRecord: 95, classIRecall: false, classIIRecall: false, oaiInspection: false, importAlert: false, ntiConcern: false },
    events: [],
  },
  {
    ndc: '90910-0011-30', labeler: 'Demo Labs B', ingredientKey: 'atorvastatin',
    subcategory: 'Atorvastatin 10 mg oral tablet',
    attrs: { inspectionRecord: 70, recallHistory: 40, batchConsistency: 65, supplyReliability: 70, qualityTransparency: 55, bioequivalenceRecord: 75, classIRecall: false, classIIRecall: true, oaiInspection: false, importAlert: false, ntiConcern: false },
    events: [
      { kind: 'Class II recall', when: 'March 2026', scope: 'two lots of 10 mg tablets', status: 'resolved — product back in distribution' },
      { kind: 'VAI inspection (Form FDA 483)', when: 'January 2026', scope: 'packaging line 3', status: 'voluntary corrections accepted' },
    ],
  },
  {
    ndc: '90911-0011-90', labeler: 'Demo Labs C', ingredientKey: 'atorvastatin',
    subcategory: 'Atorvastatin 10 mg oral tablet',
    attrs: { inspectionRecord: 30, recallHistory: 0, batchConsistency: 45, supplyReliability: 55, qualityTransparency: 30, bioequivalenceRecord: 60, classIRecall: true, classIIRecall: false, oaiInspection: true, importAlert: false, ntiConcern: false },
    events: [
      { kind: 'Class I recall', when: 'August 2026', scope: 'three lots — subpotency found on stability testing', status: 'ongoing' },
      { kind: 'OAI inspection', when: 'February 2026', scope: 'main finished-dose facility', status: 'remediation under FDA review' },
    ],
  },
  {
    ndc: '90909-0021-30', labeler: 'Demo Labs A', ingredientKey: 'levothyroxine',
    subcategory: 'Levothyroxine 50 mcg oral tablet',
    attrs: { inspectionRecord: 95, recallHistory: 100, batchConsistency: 85, supplyReliability: 80, qualityTransparency: 75, bioequivalenceRecord: 90, classIRecall: false, classIIRecall: false, oaiInspection: false, importAlert: false, ntiConcern: false },
    events: [],
  },
  {
    ndc: '90912-0021-30', labeler: 'Demo Labs D', ingredientKey: 'levothyroxine',
    subcategory: 'Levothyroxine 50 mcg oral tablet',
    attrs: { inspectionRecord: 75, recallHistory: 90, batchConsistency: 55, supplyReliability: 75, qualityTransparency: 60, bioequivalenceRecord: 40, classIRecall: false, classIIRecall: false, oaiInspection: false, importAlert: false, ntiConcern: true },
    events: [
      { kind: 'FDA bioequivalence inquiry', when: 'May 2026', scope: 'dissolution variability across batches of 50 mcg tablets', status: 'open' },
    ],
  },
  {
    ndc: '90909-0031-60', labeler: 'Demo Labs A', ingredientKey: 'metformin',
    subcategory: 'Metformin 500 mg ER oral tablet',
    attrs: { inspectionRecord: 90, recallHistory: 100, batchConsistency: 80, supplyReliability: 85, qualityTransparency: null, bioequivalenceRecord: 85, classIRecall: false, classIIRecall: false, oaiInspection: false, importAlert: false, ntiConcern: false },
    events: [],
  },
  {
    ndc: '90913-0031-60', labeler: 'Demo Labs E', ingredientKey: 'metformin',
    subcategory: 'Metformin 500 mg ER oral tablet',
    attrs: { inspectionRecord: 65, recallHistory: 100, batchConsistency: 60, supplyReliability: 50, qualityTransparency: 50, bioequivalenceRecord: 70, classIRecall: false, classIIRecall: false, oaiInspection: false, importAlert: false, ntiConcern: false },
    events: [
      { kind: 'VAI inspection (Form FDA 483)', when: 'June 2026', scope: 'granulation suite', status: 'corrections under review' },
      { kind: 'Recurring shortage', when: '2024–2026', scope: '500 mg ER tablets, multiple quarters', status: 'resolved for now' },
    ],
  },
  {
    ndc: '90910-0041-90', labeler: 'Demo Labs B', ingredientKey: 'lisinopril',
    subcategory: 'Lisinopril 10 mg oral tablet',
    attrs: { inspectionRecord: 60, recallHistory: 100, batchConsistency: 70, supplyReliability: 65, qualityTransparency: 45, bioequivalenceRecord: 75, classIRecall: false, classIIRecall: false, oaiInspection: false, importAlert: false, ntiConcern: false },
    events: [
      { kind: 'VAI inspection (Form FDA 483)', when: 'January 2026', scope: 'packaging line 3', status: 'voluntary corrections accepted' },
    ],
  },
  {
    ndc: '90914-0041-90', labeler: 'Demo Labs F', ingredientKey: 'lisinopril',
    subcategory: 'Lisinopril 10 mg oral tablet',
    attrs: { inspectionRecord: 35, recallHistory: 60, batchConsistency: 50, supplyReliability: 40, qualityTransparency: 25, bioequivalenceRecord: 65, classIRecall: false, classIIRecall: false, oaiInspection: false, importAlert: true, ntiConcern: false },
    events: [
      { kind: 'FDA import alert', when: 'November 2025', scope: 'manufacturing site listed on import alert', status: 'active' },
    ],
  },
  {
    ndc: '90910-0051-30', labeler: 'Demo Labs B', ingredientKey: 'sertraline',
    subcategory: 'Sertraline 50 mg oral tablet',
    attrs: { inspectionRecord: 70, recallHistory: 100, batchConsistency: 75, supplyReliability: 60, qualityTransparency: 55, bioequivalenceRecord: 80, classIRecall: false, classIIRecall: false, oaiInspection: false, importAlert: false, ntiConcern: false },
    events: [
      { kind: 'VAI inspection (Form FDA 483)', when: 'January 2026', scope: 'packaging line 3', status: 'voluntary corrections accepted' },
    ],
  },
  {
    ndc: '90913-0051-30', labeler: 'Demo Labs E', ingredientKey: 'sertraline',
    subcategory: 'Sertraline 50 mg oral tablet',
    attrs: { inspectionRecord: 55, recallHistory: 70, batchConsistency: 50, supplyReliability: 65, qualityTransparency: 40, bioequivalenceRecord: 60, classIRecall: false, classIIRecall: false, oaiInspection: false, importAlert: false, ntiConcern: false },
    events: [
      { kind: 'Class III recall', when: 'April 2026', scope: 'one lot — labeling error', status: 'resolved' },
    ],
  },
  {
    ndc: '90912-0061-10', labeler: 'Demo Labs D', ingredientKey: 'warfarin',
    subcategory: 'Warfarin 5 mg oral tablet',
    attrs: { inspectionRecord: 65, recallHistory: 100, batchConsistency: 50, supplyReliability: 60, qualityTransparency: 45, bioequivalenceRecord: 50, classIRecall: false, classIIRecall: false, oaiInspection: false, importAlert: false, ntiConcern: true },
    events: [
      { kind: 'FDA bioequivalence inquiry', when: 'June 2026', scope: 'NTI bioequivalence questions on 5 mg tablets', status: 'open' },
    ],
  },
  {
    ndc: '90913-0061-10', labeler: 'Demo Labs E', ingredientKey: 'warfarin',
    subcategory: 'Warfarin 5 mg oral tablet',
    attrs: { inspectionRecord: 50, recallHistory: 70, batchConsistency: 45, supplyReliability: 55, qualityTransparency: 35, bioequivalenceRecord: 55, classIRecall: false, classIIRecall: false, oaiInspection: false, importAlert: false, ntiConcern: false },
    events: [
      { kind: 'Class III recall', when: 'April 2026', scope: 'one lot — labeling error (sertraline site)', status: 'resolved' },
    ],
  },
  {
    ndc: '90909-0071-90', labeler: 'Demo Labs A', ingredientKey: 'amlodipine',
    subcategory: 'Amlodipine 5 mg oral tablet',
    attrs: { inspectionRecord: 85, recallHistory: 100, batchConsistency: 80, supplyReliability: 75, qualityTransparency: 65, bioequivalenceRecord: 85, classIRecall: false, classIIRecall: false, oaiInspection: false, importAlert: false, ntiConcern: false },
    events: [],
  },
  {
    ndc: '90912-0071-90', labeler: 'Demo Labs D', ingredientKey: 'amlodipine',
    subcategory: 'Amlodipine 5 mg oral tablet',
    attrs: { inspectionRecord: 60, recallHistory: 100, batchConsistency: 55, supplyReliability: 30, qualityTransparency: 50, bioequivalenceRecord: 70, classIRecall: false, classIIRecall: false, oaiInspection: false, importAlert: false, ntiConcern: false },
    events: [
      { kind: 'Recurring shortage', when: '2025–2026', scope: '5 mg tablets, two quarters', status: 'resolved for now' },
    ],
  },
];
