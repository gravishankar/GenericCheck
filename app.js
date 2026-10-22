/* GeneriCheck — scoring engine, NDC input, and rendering.
   Yuka-style pipeline adapted to generic-drug manufacturer quality:
   identify (NDC) -> quality-signal index -> flags -> same-medicine candidates. */

'use strict';

/* ============ Scoring engine ============ */

const RECOMMENDATION_THRESHOLD = 60;
const NDC_PATTERN = /^\d{10,11}$/;

/* Illustrative quality-signal index. Weights and caps are teaching choices
   modeled on real FDA frameworks — NOT an FDA or WHO rating. Therapeutic
   equivalence (Orange Book code) is a categorical badge, deliberately not
   scored: an AB rating is a yes/no determination, not a graduated ranking. */
const CRITERIA = [
  { key: 'inspectionRecord', label: 'FDA inspection record', weight: 0.30,
    hint: 'Recent inspection outcomes: NAI (clean), VAI (voluntary fixes), OAI (regulatory action)' },
  { key: 'recallHistory', label: 'Recall history', weight: 0.25,
    hint: 'No recalls = 100; Class III/II/I recalls reduce the signal' },
  { key: 'batchConsistency', label: 'Batch consistency', weight: 0.20,
    hint: 'Simulated teaching value: potency and dissolution variability across batches' },
  { key: 'supplyReliability', label: 'Supply reliability', weight: 0.15,
    hint: 'Shortage history — relevant because switches between makers are common' },
  { key: 'qualityTransparency', label: 'Quality transparency', weight: 0.10,
    hint: 'Publicly shared quality metrics and site registrations' },
];

/* Hard barriers derive from structured events — only events that are both
   product-level and unresolved cap the index. Resolved events inform the
   historical criteria but never cap. */
const BARRIERS = [
  { match: (e) => e.kind === 'recall' && e.class === 'I' && e.level === 'product' && isActive(e),
    cap: 24, severity: 'severe', title: 'Class I recall (active)',
    note: 'A Class I recall means there is a reasonable probability that using the product causes serious harm. Caps the index at 24.' },
  { match: (e) => e.kind === 'inspection' && e.outcome === 'OAI' && isActive(e),
    cap: 24, severity: 'severe', title: 'OAI inspection outcome',
    note: 'FDA classified the facility as Official Action Indicated — an unacceptable state of compliance. Caps the index at 24.' },
  { match: (e) => e.kind === 'import-alert' && isActive(e),
    cap: 24, severity: 'severe', title: 'Active import alert',
    note: 'The manufacturing site is on an FDA import alert, keeping its drugs from legally entering the US. Caps the index at 24.' },
  { match: (e) => e.kind === 'recall' && e.class === 'II' && e.level === 'product' && isActive(e),
    cap: 49, severity: 'moderate', title: 'Class II recall (active)',
    note: 'A Class II recall involves temporary or reversible harm. Caps the index at 49.' },
  { match: (e) => e.kind === 'bioequiv-inquiry' && isActive(e),
    cap: 49, severity: 'moderate', title: 'Open NTI bioequivalence inquiry',
    note: 'Open FDA questions about bioequivalence on a narrow-therapeutic-index drug. Caps the index at 49.' },
];

function isActive(event) {
  return !/^resolved/i.test(event.status);
}

/* Risk signals shown as amber cards without capping. */
const RISKS = [
  { test: (a) => a.inspectionRecord >= 55 && a.inspectionRecord < 85,
    title: 'VAI inspection finding', severity: 'moderate',
    note: 'A Form FDA 483 was issued and the firm is correcting deficiencies voluntarily.' },
  { test: (a) => a.supplyReliability < 55,
    title: 'Shortage-prone product', severity: 'moderate',
    note: 'This product has been in shortage — switching among manufacturers is common, which matters most for narrow-therapeutic-index drugs.' },
  { test: (a) => a.qualityTransparency !== null && a.qualityTransparency < 55,
    title: 'Limited quality transparency', severity: 'moderate',
    note: 'Little public quality data — not proof of a problem, just less visibility.' },
  { test: (a) => a.batchConsistency < 65,
    title: 'Batch variability noted', severity: 'moderate',
    note: 'Simulated teaching value: potency or dissolution varies more across batches than peers — a signal to watch, not a safety verdict.' },
];

/* Positive signals. */
const POSITIVES = [
  { test: (a) => a.inspectionRecord >= 85,
    title: 'Clean inspection record (NAI)',
    note: 'No objectionable conditions found in recent FDA inspections.' },
  { test: (a) => a.recallHistory >= 95,
    title: 'No recalls in 5 years',
    note: 'No FDA recalls for this labeler\'s product line in the mock record.' },
  { test: (a) => a.batchConsistency >= 75,
    title: 'Tight batch consistency',
    note: 'Simulated teaching value: batches stay close to target potency and dissolution specs.' },
  { test: (a) => a.supplyReliability >= 75,
    title: 'Reliable supply',
    note: 'No shortage history — you are less likely to be switched between manufacturers.' },
  { test: (a) => a.qualityTransparency >= 70,
    title: 'Publishes quality metrics',
    note: 'Voluntarily shares quality data beyond regulatory minimums.' },
];

function tierFor(score) {
  if (score >= 70) return { id: 'green', label: 'Strong quality signals' };
  if (score >= 40) return { id: 'yellow', label: 'Mixed quality signals' };
  return { id: 'red', label: 'Serious quality concerns' };
}

function gradeItem(item) {
  const contributions = CRITERIA.map((c) => {
    const raw = item.attrs[c.key];
    return {
      ...c,
      value: raw === null ? null : Math.max(0, Math.min(100, raw)),
      points: raw === null ? null : raw * c.weight,
    };
  });

  const assessed = contributions.filter((c) => c.value !== null);
  const assessedWeight = assessed.reduce((s, c) => s + c.weight, 0);
  const rawScore = Math.round(
    assessed.reduce((s, c) => s + c.points, 0) / assessedWeight
  );

  const barriers = BARRIERS.filter((b) => (item.events || []).some(b.match));
  const cap = barriers.length ? Math.min(...barriers.map((b) => b.cap)) : null;
  const score = cap !== null ? Math.min(rawScore, cap) : rawScore;

  return {
    item, rawScore, cap, score, contributions, barriers,
    unassessed: contributions.filter((c) => c.value === null).map((c) => c.label),
    coverage: { assessed: assessed.length, total: CRITERIA.length, weight: Math.round(assessedWeight * 100) },
    tier: tierFor(score),
    capped: cap !== null && rawScore > cap,
  };
}

/* Same active ingredient + strength + form — discussion candidates only. */
function findAlternatives(item) {
  const base = gradeItem(item);
  return PRODUCTS.map(gradeItem)
    .filter((g) => g.item.subcategory === item.subcategory && g.score > base.score)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/* ============ Helpers ============ */

function ndcDigits(ndc) {
  return String(ndc || '').replace(/\D/g, '');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&' + 'amp;')
    .replace(/</g, '&' + 'lt;')
    .replace(/>/g, '&' + 'gt;')
    .replace(/"/g, '&' + 'quot;')
    .replace(/'/g, '&' + '#39;');
}

function tierClassFor(value) {
  if (value === null) return 'unassessed';
  if (value >= 70) return 'tier-green';
  if (value >= 40) return 'tier-yellow';
  return 'tier-red';
}

/* ============ Rendering ============ */

const resultEl = document.getElementById('result');
const CIRCUMFERENCE = 2 * Math.PI * 54;

function dialSvg(score, tier) {
  return `
    <div class="dial" role="img" aria-label="Illustrative quality-signal score ${score} out of 100, ${tier.label}">
      <svg viewBox="0 0 132 132" aria-hidden="true">
        <circle class="dial-track" cx="66" cy="66" r="54"></circle>
        <circle class="dial-fill ${'tier-' + tier.id}" cx="66" cy="66" r="54"
          stroke-dasharray="${CIRCUMFERENCE.toFixed(2)}"
          stroke-dashoffset="${(CIRCUMFERENCE * (1 - score / 100)).toFixed(2)}"></circle>
      </svg>
      <span class="dial-number">${score}</span>
    </div>`;
}

function flagCard(flag, kind) {
  const dot = kind === 'positive' ? 'dot-green' : (flag.severity === 'severe' ? 'dot-red' : 'dot-yellow');
  return `
    <div class="flag-card">
      <div class="flag-head"><span class="dot ${dot}" aria-hidden="true"></span>
        <span class="flag-title">${flag.title}</span></div>
      <p class="flag-note">${flag.note}</p>
    </div>`;
}

function teCard(item) {
  if (item.teStatus === 'inquiry') {
    return flagCard({ severity: 'moderate', title: 'Open bioequivalence inquiry',
      note: 'Therapeutic-equivalence status is under FDA review for this product (mock scenario). Not a safety verdict.' }, 'risk');
  }
  return flagCard({ title: 'Orange Book AB rating (mock)',
    note: 'FDA-rated therapeutically equivalent to the reference product. Shown as a categorical badge — deliberately not part of the numeric index, since an AB rating is not a graduated ranking.' }, 'positive');
}

function renderResult(item) {
  const g = gradeItem(item);
  const edu = DRUG_EDUCATION[item.ingredientKey];
  const risks = RISKS.filter((r) => r.test(item.attrs));
  const positives = POSITIVES.filter((p) => p.test(item.attrs));
  const candidates = g.score < RECOMMENDATION_THRESHOLD ? findAlternatives(item) : null;
  const labelerEvents = (item.events || []).filter((e) => e.level === 'labeler');

  const capNotice = g.capped ? `
    <div class="cap-notice ${g.barriers.some((b) => b.severity === 'severe') ? 'is-severe' : 'is-moderate'}">
      <strong>Index capped at ${g.cap}</strong>
      ${g.barriers.map((b) => b.title).join(' · ')} — raw weighted index of ${g.rawScore} is limited by this active barrier.
    </div>` : '';

  const coverageChip = `
    <p class="coverage-chip">
      ${g.coverage.assessed} of ${g.coverage.total} signals assessed · ${g.coverage.weight}% of weight covered
    </p>`;

  const unassessedNotice = g.unassessed.length ? `
    <p class="recs-note">Not assessed (excluded, weights re-normalized): ${g.unassessed.join(', ')}. Re-normalizing is not neutral — excluding a low signal can raise the index — so treat partial coverage with caution.</p>` : '';

  const eventsSection = (item.events || []).length ? `
    <section class="flags" aria-labelledby="eventsHeading">
      <h3 id="eventsHeading">Documented events (mock)</h3>
      <ul class="event-list">
        ${(item.events || []).map((e) => `
          <li class="event-item">
            <span class="event-kind">${escapeHtml(e.kind === 'recall' ? `Class ${e.class} recall` : e.kind === 'inspection' ? `${e.outcome} inspection` : e.kind)}${e.level === 'labeler' ? ' · labeler-wide (other product)' : ''}</span>
            <span class="event-meta">${escapeHtml(e.when)} · ${escapeHtml(e.scope)} · ${escapeHtml(e.status)}</span>
          </li>`).join('')}
      </ul>
      <p class="recs-note">Only active, product-level events cap the index. Resolved events and labeler-wide context are track-record signals — an old or unrelated recall does not mean this product is currently affected.</p>
    </section>` : '';

  const ntiCallout = edu.nti ? `
    <div class="nti-callout">
      <strong>Narrow therapeutic index.</strong> ${edu.ntiNote}
    </div>` : '';

  const candidatesSection = candidates === null ? '' : `
    <section class="recs" aria-labelledby="recHeading">
      <h3 id="recHeading">Same medicine, other labelers — candidates to discuss</h3>
      ${candidates.length
        ? `<div class="rec-list">${candidates.map((r) => `
            <button class="rec-card" data-ndc="${r.item.ndc}" type="button">
              <span class="rec-id">
                <span class="dot dot-${r.tier.id}" aria-hidden="true"></span>
                <span><span class="rec-name">${r.item.labeler}</span><br>
                <span class="rec-brand">${r.item.subcategory}</span></span>
              </span>
              <span class="rec-score">${r.score}</span>
            </button>`).join('')}</div>`
        : `<p class="rec-none">No higher-scoring labeler for this exact medicine exists in the mock database yet.</p>`}
      <p class="recs-note">
        Same active ingredient, strength, and form; strictly higher illustrative score; ordered by score.
        These are conversation starters for your pharmacist — <strong>not switching instructions</strong>.
        Do not stop or change a prescribed medication based on this tool.
      </p>
    </section>`;

  resultEl.innerHTML = `
    <article class="result-card">
      <div class="result-head">
        <div class="result-id">
          <p class="result-brand">${item.labeler} (fictional)</p>
          <h2 class="result-name">${item.subcategory}</h2>
          <p class="result-barcode">NDC ${item.ndc}</p>
        </div>
        <span class="mock-badge">Mock scenario</span>
      </div>

      <section class="identity" aria-labelledby="identityHeading">
        <h3 id="identityHeading">What the code identifies</h3>
        <p class="identity-ndc">
          <span class="ndc-seg">${item.ndc.split('-')[0]}</span>–<span class="ndc-seg">${item.ndc.split('-')[1]}</span>–<span class="ndc-seg">${item.ndc.split('-')[2]}</span>
        </p>
        <p class="recs-note">
          The first segment is the <strong>labeler code</strong> — the company named on the drug label.
          It may be the maker, or a repackager or distributor. The middle segment is the specific
          product (ingredient + strength + form); the last is the package size. An NDC identifies a
          product, not a lot — check the lot and expiry printed near it.
        </p>
      </section>

      <div class="score-block">
        ${dialSvg(g.score, g.tier)}
        <div class="score-meta">
          <span class="badge badge-${g.tier.id}"><span class="dot dot-${g.tier.id}" aria-hidden="true"></span>${g.tier.label}</span>
          ${coverageChip}
          <p class="score-caption">
            <strong>Illustrative quality-signal index.</strong> A teaching score about the
            <strong>labeler's regulatory track record</strong> — not a measure of whether this
            medicine is right for you, or of its clinical safety or effectiveness.
          </p>
        </div>
      </div>

      ${capNotice}

      <section class="breakdown" aria-labelledby="bkHeading">
        <h3 id="bkHeading">Index breakdown</h3>
        ${g.contributions.map((c) => `
          <div class="criterion">
            <div class="criterion-row">
              <span class="criterion-name" title="${c.hint}">${c.label}</span>
              <span class="criterion-pts">${c.value === null
                ? '<span class="val not-assessed-val">Not assessed</span>'
                : `<span class="val">${c.points.toFixed(1)}</span> / ${(c.weight * 100).toFixed(0)} pts`}</span>
            </div>
            ${c.value === null
              ? '<div class="bar-track bar-unassessed"></div>'
              : `<div class="bar-track"><div class="bar-fill ${tierClassFor(c.value)}" style="width:${c.value}%"></div></div>`}
          </div>`).join('')}
        ${unassessedNotice}
        <p class="recs-note">Index = Σ (criterion 0–100 × weight)${g.cap !== null ? `, capped at ${g.cap} by active barriers` : ''}. Raw index before caps: ${g.rawScore}. Criterion values are simulated teaching values, not researched product data. Weights and caps are teaching choices modeled on FDA frameworks — not an FDA rating.</p>
      </section>

      <section class="flags" aria-labelledby="flagHeading">
        <h3 id="flagHeading">Quality signals</h3>
        <div class="flag-grid">
          ${g.barriers.map((b) => flagCard(b, 'risk')).join('')}
          ${risks.map((r) => flagCard(r, 'risk')).join('')}
          ${teCard(item)}
          ${positives.map((p) => flagCard(p, 'positive')).join('')}
        </div>
      </section>

      ${eventsSection}

      <section class="edu" aria-labelledby="eduHeading">
        <h3 id="eduHeading">About the medicine itself</h3>
        <p class="edu-sub">${edu.ingredient} · ${edu.drugClass} — independent of the manufacturer score above. Full patient information: <a href="${edu.source.url}" target="_blank" rel="noopener">${edu.source.name}</a>.</p>
        <div class="edu-grid">
          <div class="edu-card"><h4>What it treats</h4><p>${edu.uses}</p></div>
          <div class="edu-card"><h4>Key cautions</h4><p>${edu.cautions}</p></div>
          <div class="edu-card"><h4>Monitoring</h4><p>${edu.monitoring}</p></div>
        </div>
        ${ntiCallout}
        <p class="recs-note">General education from ${edu.source.name}, not personal medical advice.</p>
      </section>

      ${candidatesSection}
    </article>`;

  resultEl.hidden = false;
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderNotFound(code) {
  const safe = escapeHtml(code);
  resultEl.innerHTML = `
    <section class="not-found">
      <h3>NDC not in the mock database</h3>
      <p><span class="code">${safe}</span> isn't one of the ${PRODUCTS.length} fictional products in this
      prototype. A production version would look the NDC up in the FDA's public
      <a href="https://www.fda.gov/drugs/drug-approvals-and-databases/national-drug-code-directory" target="_blank" rel="noopener">NDC Directory</a>.</p>
      <button class="btn btn-ghost" id="browseCatalogBtn" type="button">Browse the mock catalog</button>
    </section>`;
  resultEl.hidden = false;
  document.getElementById('browseCatalogBtn').addEventListener('click', () => {
    document.querySelector('.catalog').scrollIntoView({ behavior: 'smooth' });
  });
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderUnsupportedPayload(payload) {
  const safe = escapeHtml(payload);
  resultEl.innerHTML = `
    <section class="not-found">
      <h3>That barcode doesn't look like an NDC</h3>
      <p>Drug packages also carry lot numbers and expiry codes. The NDC is the 10–11 digit code,
      usually printed in a 5-4-2 pattern like 90909-0011-10. You read: <span class="code">${safe}</span>.
      Type the NDC instead — or pick a sample below.</p>
      <button class="btn btn-ghost" id="browseCatalogBtn" type="button">Browse the mock catalog</button>
    </section>`;
  resultEl.hidden = false;
  document.getElementById('browseCatalogBtn').addEventListener('click', () => {
    document.querySelector('.catalog').scrollIntoView({ behavior: 'smooth' });
  });
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============ Lookup ============ */

function lookup(code) {
  const raw = String(code || '').trim();
  const digits = ndcDigits(raw);
  if (!NDC_PATTERN.test(digits)) {
    renderUnsupportedPayload(raw || '(empty)');
    return;
  }
  const item = PRODUCTS.find((i) => ndcDigits(i.ndc) === digits);
  if (item) renderResult(item);
  else renderNotFound(digits);
}

/* ============ Camera scanning ============ */

const video = document.getElementById('scanVideo');
const videoWrap = document.getElementById('videoWrap');
const videoIdle = document.getElementById('videoIdle');
const startCameraBtn = document.getElementById('startCameraBtn');
const stopCameraBtn = document.getElementById('stopCameraBtn');
const scanStatus = document.getElementById('scanStatus');
const scanSupportNote = document.getElementById('scanSupportNote');

let stream = null;
let detecting = false;
let detector = null;

function setScanError(message) {
  scanStatus.textContent = message;
  scanStatus.classList.add('is-error');
}

async function startCamera() {
  scanStatus.textContent = '';
  scanStatus.classList.remove('is-error');

  if (!window.isSecureContext) {
    setScanError('Camera scanning needs a secure (https) context. Type the NDC instead.');
    return;
  }
  if (!('BarcodeDetector' in window)) {
    setScanError('This browser has no built-in barcode detection (Safari, for instance). Type the NDC instead — sample codes are below.');
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (err) {
    setScanError('Camera unavailable or permission denied. Type the NDC instead.');
    return;
  }

  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    detector = new window.BarcodeDetector({ formats });
  } catch (err) {
    stopCamera();
    setScanError('Barcode detection could not start in this browser. Type the NDC instead.');
    return;
  }

  video.srcObject = stream;
  try {
    await video.play();
  } catch (err) {
    stopCamera();
    setScanError('Camera stream could not be displayed. Type the NDC instead.');
    return;
  }
  videoWrap.classList.add('is-live');
  videoIdle.setAttribute('hidden', '');
  startCameraBtn.hidden = true;
  stopCameraBtn.hidden = false;
  scanStatus.textContent = 'Scanning — hold the package barcode inside the frame';
  detecting = true;
  detectLoop();
}

function stopCamera() {
  detecting = false;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  video.srcObject = null;
  videoWrap.classList.remove('is-live');
  videoIdle.removeAttribute('hidden');
  startCameraBtn.hidden = false;
  stopCameraBtn.hidden = true;
  scanStatus.textContent = '';
}

async function detectLoop() {
  if (!detecting) return;
  try {
    const codes = await detector.detect(video);
    if (codes.length > 0) {
      const value = codes[0].rawValue;
      stopCamera();
      lookup(value);
      return;
    }
  } catch (err) {
    /* transient decode error — keep scanning */
  }
  setTimeout(detectLoop, 250);
}

startCameraBtn.addEventListener('click', startCamera);
stopCameraBtn.addEventListener('click', stopCamera);

(function checkSupport() {
  if (!('BarcodeDetector' in window)) {
    scanSupportNote.textContent = 'This browser has no built-in barcode detection — type the NDC instead.';
  } else if (!window.isSecureContext) {
    scanSupportNote.textContent = 'Camera scanning needs a secure (https) context.';
  }
})();

/* ============ Tabs, form, chips, catalog, dialog ============ */

const tabScan = document.getElementById('tabScan');
const tabManual = document.getElementById('tabManual');
const scanPanel = document.getElementById('scanPanel');
const manualPanel = document.getElementById('manualPanel');

function selectTab(which) {
  const isScan = which === 'scan';
  tabScan.setAttribute('aria-selected', String(isScan));
  tabManual.setAttribute('aria-selected', String(!isScan));
  scanPanel.hidden = !isScan;
  manualPanel.hidden = isScan;
  if (!isScan) stopCamera();
}
tabScan.addEventListener('click', () => selectTab('scan'));
tabManual.addEventListener('click', () => selectTab('manual'));

document.getElementById('manualForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('codeInput');
  if (ndcDigits(input.value).length === 0) {
    input.focus();
    return;
  }
  lookup(input.value);
});

/* Sample chips generated from database records (no hand-typed mismatches). */
const SAMPLE_NDCS = ['90909-0011-10', '90910-0011-30', '90911-0011-90', '90912-0061-10'];
const chipRow = document.getElementById('chipRow');
const sampleChips = SAMPLE_NDCS.map((ndc) => {
  const item = PRODUCTS.find((p) => p.ndc === ndc);
  return { ndc, label: item ? `${item.labeler} · ${item.ingredientKey}` : 'Unknown NDC' };
});
chipRow.innerHTML = sampleChips.map((s) =>
  `<button class="chip" data-ndc="${s.ndc}" type="button">
     <span class="chip-label">${s.label}</span>${s.ndc}
   </button>`).join('');
chipRow.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) lookup(chip.dataset.ndc);
});

/* Catalog */
const catalogGrid = document.getElementById('catalogGrid');
catalogGrid.innerHTML = PRODUCTS.map((item) => {
  const g = gradeItem(item);
  return `
    <button class="catalog-card" data-ndc="${item.ndc}" type="button">
      <div class="catalog-top">
        <span class="catalog-cat">${item.ingredientKey}</span>
        <span class="catalog-score"><span class="dot dot-${g.tier.id}" aria-hidden="true"></span>${g.score}</span>
      </div>
      <span class="catalog-name">${item.labeler}</span>
      <span class="catalog-brand">${item.subcategory}</span>
    </button>`;
}).join('');
catalogGrid.addEventListener('click', (e) => {
  const card = e.target.closest('.catalog-card');
  if (card) lookup(card.dataset.ndc);
});

/* Candidate cards inside results (delegated). */
resultEl.addEventListener('click', (e) => {
  const rec = e.target.closest('.rec-card');
  if (rec) lookup(rec.dataset.ndc);
});

/* Methodology dialog */
const dialog = document.getElementById('methodologyDialog');
document.getElementById('methodologyBtn').addEventListener('click', () => dialog.showModal());
document.getElementById('methodologyClose').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});

document.getElementById('wordmarkHome').addEventListener('click', (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
