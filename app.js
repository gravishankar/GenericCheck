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
   product-level and explicitly active cap the index. Resolved events inform the
   historical criteria but never cap. */
const BARRIERS = [
  { match: (e) => e.kind === 'recall' && e.class === 'I' && e.level === 'product' && e.status === 'active',
    cap: 24, severity: 'severe', title: 'Class I recall (active)',
    note: 'A Class I recall means there is a reasonable probability that using the product causes serious harm. Caps the index at 24.' },
  { match: (e) => e.kind === 'inspection' && e.outcome === 'OAI' && e.level === 'product' && e.status === 'active',
    cap: 24, severity: 'severe', title: 'OAI inspection outcome',
    note: 'FDA classified the facility as Official Action Indicated — an unacceptable state of compliance. Caps the index at 24.' },
  { match: (e) => e.kind === 'import-alert' && e.level === 'product' && e.status === 'active',
    cap: 24, severity: 'severe', title: 'Active import alert',
    note: 'The manufacturing site is on an FDA import alert, keeping its drugs from legally entering the US. Caps the index at 24.' },
  { match: (e) => e.kind === 'recall' && e.class === 'II' && e.level === 'product' && e.status === 'active',
    cap: 49, severity: 'moderate', title: 'Class II recall (active)',
    note: 'A Class II recall involves temporary or reversible harm. Caps the index at 49.' },
  { match: (e) => e.kind === 'bioequiv-inquiry' && e.level === 'product' && e.status === 'active',
    cap: 49, severity: 'moderate', title: 'Open NTI bioequivalence inquiry',
    note: 'Open FDA questions about bioequivalence on a narrow-therapeutic-index drug. Caps the index at 49.' },
];

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
            <span class="event-meta">${escapeHtml(e.when)} · ${escapeHtml(e.scope)} · ${escapeHtml(e.statusNote)}</span>
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
        <h3 id="identityHeading">What the code identifies — and what it doesn't</h3>
        <p class="identity-ndc">
          <span class="ndc-seg">${item.ndc.split('-')[0]}</span>–<span class="ndc-seg">${item.ndc.split('-')[1]}</span>–<span class="ndc-seg">${item.ndc.split('-')[2]}</span>
        </p>
        <p class="recs-note">
          The NDC confirms the <strong>product and labeler</strong> (the company named on the label — it may be
          the maker, or a repackager or distributor). It does <strong>not</strong> identify the factory.
          Registered maker per the mock record: <strong>${item.manufacturing.maker}</strong>
          ${item.manufacturing.maker !== item.labeler ? `(the labeler is a repackager) ` : ''}—
          identity status: <strong>${item.manufacturing.siteStatus === 'one-known-site' ? 'one known site' : item.manufacturing.siteStatus === 'multiple-known-sites' ? 'multiple known sites' : 'site unconfirmed'}</strong>
          (evidence: ${item.manufacturing.evidence}). In real use, maker identity requires facility-level records —
          ProPublica's Rx Inspector links NDCs to registered factories — and when records can't establish it,
          the honest answer is "unconfirmed", never a guess. An NDC identifies a product, not a lot —
          check the lot and expiry printed near it.
        </p>
      </section>

      <div class="switch-callout">
        <strong>The silent switch.</strong>
        An NDC locks the labeler, not the maker: the labeler can change manufacturers or shift production
        between plants without changing a digit on the barcode. To learn who made your bottle, check the
        lot number with your pharmacist. For medicines you and your prescriber have identified as
        consistency-sensitive (commonly levothyroxine and warfarin), ask whether a maker change warrants
        a lab recheck (TSH or INR).
      </div>

      <section class="supply-chain" aria-labelledby="scHeading">
        <h3 id="scHeading">Supply-chain profile (information only, not scored)</h3>
        <p class="recs-note">
          Known manufacturing sites in the mock record: ${item.manufacturing.sites.join('; ')}.<br>
          ${item.manufacturing.siteStatus === 'one-known-site'
            ? 'One known site — fewer moving parts, but that is a supply-chain fact, not a quality verdict.'
            : item.manufacturing.siteStatus === 'multiple-known-sites'
            ? 'Multiple known sites — production can shift between plants without any NDC change.'
            : 'Site unconfirmed — public records did not establish the producing plant, which is common; it is not evidence of a problem.'}
          Single-plant production is not by itself evidence of higher quality or safety — for
          consistency-sensitive medicines, discuss supply-chain stability with your pharmacist rather than
          assuming a simple rule.
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
    startCameraBtn.hidden = true;
  } else if (!window.isSecureContext) {
    scanSupportNote.textContent = 'Camera scanning needs a secure (https) context.';
    startCameraBtn.hidden = true;
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

/* ============ Live regulatory check (real FDA openFDA API) ============
   Real records, fetched directly from api.fda.gov in the user's browser.
   Completely separate from the mock scoring above: live results are never
   scored, ranked, or mixed into the mock index. */

const liveForm = document.getElementById('liveForm');
const liveInput = document.getElementById('liveInput');
const liveResults = document.getElementById('liveResults');

async function fdaFetch(query) {
  const res = await fetch('https://api.fda.gov/' + query);
  if (res.status === 404) return { notFound: true };
  if (!res.ok) return { error: 'HTTP ' + res.status };
  return res.json();
}

function esc(v) {
  return escapeHtml(Array.isArray(v) ? v.join(', ') : (v ?? '—'));
}

async function runLiveCheck(rawQuery) {
  const digits = ndcDigits(rawQuery);
  const isNdc = /^\d{10,11}$/.test(digits);
  const name = rawQuery.trim().replace(/["]/g, '');
  liveResults.innerHTML = '<p class="live-status">Querying the FDA openFDA API…</p>';

  try {
    let identityHtml = '';
    let genericName = name;

    if (isNdc) {
      // openFDA indexes NDCs in dashed format; try raw-as-typed, digits, and
      // both package/product segments before concluding "no match".
      const raw = rawQuery.trim();
      const productSegment = raw.includes('-') ? raw.split('-').slice(0, 2).join('-') : '';
      const attempts = [];
      if (raw.includes('-')) {
        attempts.push(`drug/ndc.json?search=package_ndc:"${raw}"&limit=5`);
        if (productSegment) attempts.push(`drug/ndc.json?search=product_ndc:"${productSegment}"&limit=5`);
      }
      if (digits.length === 11) attempts.push(`drug/ndc.json?search=package_ndc:"${digits.slice(0,5)}-${digits.slice(5,9)}-${digits.slice(9)}"&limit=5`);
      attempts.push(`drug/ndc.json?search=product_ndc:"${digits}"&limit=5`);
      let ndcData = null;
      for (const q of attempts) {
        const r = await fdaFetch(q);
        if (r.results) { ndcData = r; break; }
        if (r.error) { liveResults.innerHTML = '<p class="live-status is-error">FDA API error (' + r.error + ') — this is a source failure, not "no findings". Try again shortly.</p>'; return; }
      }
      if (ndcData) {
        genericName = ndcData.results[0].generic_name || name;
        identityHtml = `
          <div class="live-card">
            <h4>NDC Directory — product identity (real)</h4>
            ${ndcData.results.map((r) => `
              <p class="live-row"><strong>${esc(r.brand_name)}</strong> (${esc(r.generic_name)}) · labeler: <strong>${esc(r.labeler_name)}</strong> · ${esc(r.active_ingredients ? r.active_ingredients.map((a) => a.name + ' ' + a.strength).join(', ') : '')} · ${esc(r.dosage_form)} · marketing: ${esc(r.marketing_start_date)}–${esc(r.marketing_end_date)}</p>`).join('')}
            <p class="recs-note">The NDC confirms product and labeler — not the factory that made your bottle.</p>
          </div>`;
      } else {
        identityHtml = `<div class="live-card"><h4>NDC Directory</h4><p class="live-row">No matching records found in this query. (That means the query found nothing — not that the product doesn't exist. Check the NDC on the label.)</p></div>`;
      }
    }

    // Recalls: query by generic name via harmonized annotation, fall back to product description
    let rec = await fdaFetch(`drug/enforcement.json?search=openfda.generic_name:"${encodeURIComponent(genericName)}"&sort=report_date:desc&limit=5`);
    if (rec.error) {
      rec = await fdaFetch(`drug/enforcement.json?search=product_description:"${encodeURIComponent(name)}"&sort=report_date:desc&limit=5`);
    }
    if (rec.error) {
      liveResults.innerHTML = identityHtml + '<p class="live-status is-error">FDA API error (' + rec.error + ') — a source failure, not "no findings". Try again shortly.</p>';
      return;
    }

    let recallsHtml;
    if (rec.notFound) {
      recallsHtml = `<div class="live-card"><h4>Recall enforcement reports</h4><p class="live-row">No matching records found in this query — which is not the same as "no recalls exist anywhere". Coverage: drug enforcement reports indexed by openFDA, matched on ${isNdc ? 'generic name for that NDC' : 'the name you entered'}.</p></div>`;
    } else {
      recallsHtml = `
        <div class="live-card">
          <h4>Recall enforcement reports (real, most recent first)</h4>
          ${rec.results.map((r) => `
            <div class="live-recall">
              <p class="live-row"><strong>${esc(r.classification)}</strong> · ${esc(r.status)} · reported ${esc(r.report_date)} · recalling firm: <strong>${esc(r.recalling_firm)}</strong></p>
              <p class="live-row">${esc(r.product_description)}</p>
              <p class="live-row">Reason: ${esc(r.reason_for_recall)} · Lots/NDCs: ${esc(r.code_info)}</p>
            </div>`).join('')}
          <p class="recs-note">A recalling firm's name alone does not confirm your specific bottle is affected — check the lot number and NDC with your pharmacist. Verify applicability before drawing conclusions.</p>
        </div>`;
    }

    liveResults.innerHTML = `
      ${identityHtml}
      ${recallsHtml}
      <p class="recs-note">Source: FDA openFDA API (api.fda.gov), queried ${new Date().toLocaleString()}. Real regulatory records — never scored, ranked, or mixed into the mock index. openFDA's own disclaimer: results are unvalidated; do not rely on them alone for medical decisions.</p>`;
  } catch (err) {
    liveResults.innerHTML = '<p class="live-status is-error">Could not reach the FDA API (network or CORS failure). This is a source failure — not "no findings". You can search the same records at open.fda.gov.</p>';
  }
}

liveForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = liveInput.value;
  if (q.trim().length === 0) { liveInput.focus(); return; }
  runLiveCheck(q);
});

/* ============ Medicine lists & monthly reminders (local-first) ============
   No backend: lists live in the person's own browser (localStorage when
   available, with export/import to a JSON file as the portable backup).
   The only network calls go to the FDA's public openFDA API with the drug
   names being checked — names and emails never leave the device except
   through the actions the user chooses (calendar file, email handoff). */

const STORE_KEY = 'genericheck-medlists-v1';

function storageAvailable() {
  try {
    const k = '__gc_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function readListsLocal() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveListsLocal(lists) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(lists));
    return true;
  } catch {
    return false;
  }
}

const medListForm = document.getElementById('medListForm');
const mlMedRows = document.getElementById('mlMedRows');
const mlAddRow = document.getElementById('mlAddRow');
const mlStatus = document.getElementById('mlStatus');
const medListsEl = document.getElementById('medLists');
const medReportEl = document.getElementById('medReport');
const mlStorageNote = document.getElementById('mlStorageNote');

let canStore = storageAvailable();
let lists = readListsLocal();

function refreshStorageNote() {
  if (canStore) {
    mlStorageNote.textContent = 'This device allows browser storage — the list is saved automatically in this browser only. Use Export to keep a portable backup file.';
  } else {
    mlStorageNote.textContent = 'This preview environment blocks browser storage — the list lasts only for this visit. Use Export to save a copy as a file, and Import to restore it later. In the downloaded app on a normal device, saving works automatically.';
  }
}
refreshStorageNote();

function validList(body) {
  if (!body || typeof body !== 'object') return null;
  const personName = String(body.personName || '').trim().slice(0, 80);
  const email = String(body.email || '').trim().slice(0, 120);
  if (!personName) return null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  const meds = Array.isArray(body.meds)
    ? body.meds
        .map((m) => ({
          drug: String(m.drug || '').trim().slice(0, 60),
          strength: String(m.strength || '').trim().slice(0, 40),
          maker: String(m.maker || '').trim().slice(0, 60),
          ndc: String(m.ndc || '').trim().slice(0, 20),
        }))
        .filter((m) => m.drug.length > 0)
        .slice(0, 15)
    : [];
  if (meds.length === 0) return null;
  return { personName, email, meds };
}

function mlRowHtml(index) {
  return `
    <div class="ml-med-row" data-row="${index}">
      <div class="ml-med-grid">
        <div class="ml-med-field">
          <label class="field-label" for="ml-drug-${index}">Drug</label>
          <input id="ml-drug-${index}" class="code-input" placeholder="metformin" data-med="drug" aria-label="Drug name for medicine ${index + 1}">
        </div>
        <div class="ml-med-field">
          <label class="field-label" for="ml-str-${index}">Strength</label>
          <input id="ml-str-${index}" class="code-input" placeholder="500 mg" data-med="strength" aria-label="Strength for medicine ${index + 1}">
        </div>
        <div class="ml-med-field">
          <label class="field-label" for="ml-maker-${index}">Maker on label</label>
          <input id="ml-maker-${index}" class="code-input" placeholder="Hikma" data-med="maker" aria-label="Maker for medicine ${index + 1}">
        </div>
        <div class="ml-med-field">
          <label class="field-label" for="ml-ndc-${index}">NDC (optional)</label>
          <input id="ml-ndc-${index}" class="code-input" placeholder="0069-2110" data-med="ndc" aria-label="NDC for medicine ${index + 1}">
        </div>
      </div>
      <button class="btn btn-ghost ml-remove" type="button" aria-label="Remove medicine ${index + 1}">Remove this medicine</button>
    </div>`;
}

function addMedRow() {
  const count = mlMedRows.querySelectorAll('.ml-med-row').length;
  if (count >= 10) return;
  mlMedRows.insertAdjacentHTML('beforeend', mlRowHtml(count));
}

addMedRow();
addMedRow();

mlAddRow.addEventListener('click', addMedRow);
mlMedRows.addEventListener('click', (e) => {
  const btn = e.target.closest('.ml-remove');
  if (!btn) return;
  const rows = mlMedRows.querySelectorAll('.ml-med-row');
  if (rows.length <= 1) return;
  btn.closest('.ml-med-row').remove();
});

function collectMedRows() {
  return Array.from(mlMedRows.querySelectorAll('.ml-med-row'))
    .map((row) => {
      const get = (k) => row.querySelector(`[data-med="${k}"]`).value.trim();
      return { drug: get('drug'), strength: get('strength'), maker: get('maker'), ndc: get('ndc') };
    })
    .filter((m) => m.drug.length > 0);
}

medListForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const parsed = validList({
    personName: document.getElementById('mlName').value,
    email: document.getElementById('mlEmail').value,
    meds: collectMedRows(),
  });
  if (!parsed) {
    mlStatus.textContent = 'A person name and at least one medicine (with drug name) are required. Email must look like an email address if provided.';
    mlStatus.classList.add('is-error');
    return;
  }
  const list = { id: crypto.randomUUID(), ...parsed, createdAt: new Date().toISOString() };
  lists.push(list);
  canStore = saveListsLocal(lists) && canStore;
  if (!canStore) refreshStorageNote();
  mlStatus.textContent = `Saved ${escapeHtml(list.personName)}'s medicine list (${list.meds.length} medicine${list.meds.length > 1 ? 's' : ''}) — on this device only.`;
  mlStatus.classList.remove('is-error');
  medListForm.reset();
  mlMedRows.innerHTML = '';
  addMedRow();
  addMedRow();
  renderMedLists();
});

/* Export / Import */
document.getElementById('mlExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'GeneriCheck', version: 1, exportedAt: new Date().toISOString(), lists }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'genericheck-medicine-lists.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('mlImport').addEventListener('click', () => {
  document.getElementById('mlImportFile').click();
});

document.getElementById('mlImportFile').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const imported = Array.isArray(parsed.lists) ? parsed.lists : [];
      const valid = imported.map(validList).filter(Boolean);
      if (!valid.length) throw new Error('no valid lists');
      const existingIds = new Set(lists.map((l) => l.id));
      let added = 0;
      for (const v of valid) {
        if (!existingIds.has(v.id || '')) { lists.push({ id: v.id || crypto.randomUUID(), ...v, createdAt: v.createdAt || new Date().toISOString() }); added++; }
      }
      canStore = saveListsLocal(lists) && canStore;
      if (!canStore) refreshStorageNote();
      mlStatus.textContent = `Imported ${added} medicine list${added === 1 ? '' : 's'} from the file — on this device only.`;
      mlStatus.classList.remove('is-error');
      renderMedLists();
    } catch {
      mlStatus.textContent = 'That file does not look like a GeneriCheck export.';
      mlStatus.classList.add('is-error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

function medCard(list) {
  const meds = list.meds.map((m) => escapeHtml(m.drug)).join(', ');
  return `
    <div class="ml-card" data-id="${list.id}">
      <div class="ml-card-head">
        <div>
          <span class="ml-name">${escapeHtml(list.personName)}</span>
          ${list.email ? `<span class="ml-email">${escapeHtml(list.email)}</span>` : ''}
        </div>
        <span class="ml-count">${list.meds.length} medicine${list.meds.length > 1 ? 's' : ''}</span>
      </div>
      <p class="recs-note">${meds}</p>
      <div class="ml-actions">
        <button class="btn btn-primary ml-report-btn" data-id="${list.id}" type="button">Run monthly report</button>
        <button class="btn btn-ghost ml-ics-btn" data-id="${list.id}" type="button">Calendar reminder (.ics)</button>
        ${list.email ? `<button class="btn btn-ghost ml-mailto-btn" data-id="${list.id}" type="button">Email report</button>` : ''}
        <button class="btn btn-ghost ml-delete-btn" data-id="${list.id}" type="button">Remove</button>
      </div>
    </div>`;
}

function renderMedLists() {
  if (!lists.length) {
    medListsEl.innerHTML = '<p class="live-status">No medicine lists saved on this device yet — add one above (one per person).</p>';
    return;
  }
  medListsEl.innerHTML = lists.map(medCard).join('');
}
renderMedLists();

medListsEl.addEventListener('click', async (e) => {
  const reportBtn = e.target.closest('.ml-report-btn');
  const mailtoBtn = e.target.closest('.ml-mailto-btn');
  const icsBtn = e.target.closest('.ml-ics-btn');
  const deleteBtn = e.target.closest('.ml-delete-btn');
  if (reportBtn) runMonthlyReport(reportBtn.dataset.id);
  if (mailtoBtn) emailReport(mailtoBtn.dataset.id);
  if (icsBtn) downloadIcs(icsBtn.dataset.id);
  if (deleteBtn) removeList(deleteBtn);
});

function removeList(btn) {
  if (btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    btn.textContent = 'Confirm remove?';
    setTimeout(() => { btn.dataset.armed = '0'; btn.textContent = 'Remove'; }, 4000);
    return;
  }
  lists = lists.filter((l) => l.id !== btn.dataset.id);
  saveListsLocal(lists);
  renderMedLists();
  medReportEl.hidden = true;
}

/* Client-side openFDA query (same public API as the live check) */
async function fdaRecallLookup(drugName) {
  try {
    const res = await fetch('https://api.fda.gov/drug/enforcement.json?search=openfda.generic_name:"' + encodeURIComponent(drugName) + '"&sort=report_date:desc&limit=5');
    if (res.status === 404) return { status: 'no-matching-records' };
    if (!res.ok) return { status: 'source-failure', error: 'HTTP ' + res.status };
    const data = await res.json();
    return {
      status: 'ok',
      recalls: data.results.map((r) => ({
        classification: r.classification, status: r.status, reportDate: r.report_date,
        recallingFirm: r.recalling_firm, product: r.product_description,
        reason: r.reason_for_recall, lots: r.code_info,
      })),
    };
  } catch {
    return { status: 'source-failure', error: 'network' };
  }
}

function recallLine(r) {
  return `
    <div class="live-recall">
      <p class="live-row"><strong>${escapeHtml(r.classification)}</strong> · ${escapeHtml(r.status)} · reported ${escapeHtml(r.reportDate)} · recalling firm: <strong>${escapeHtml(r.recallingFirm)}</strong></p>
      <p class="live-row">${escapeHtml(r.product)}</p>
      <p class="live-row">Reason: ${escapeHtml(r.reason)} · Lots/NDCs: ${escapeHtml(Array.isArray(r.lots) ? r.lots.join(', ') : r.lots)}</p>
    </div>`;
}

const REPORT_NOTES = [
  'No matching records means none found in this query — not "no recalls exist anywhere".',
  'A recalling firm or drug name alone does not confirm YOUR bottle is affected — check the lot number and NDC with your pharmacist.',
  'Also check the factory and inspection history at ProPublica Rx Inspector, and the TE code in the Orange Book.',
  'Update this list whenever a label shows a new maker. Never stop or change a medication on your own — discuss findings with your pharmacist or prescriber.',
];

async function buildReportLocal(list) {
  const meds = [];
  for (const med of list.meds) {
    const entry = { ...med, queriedAt: new Date().toISOString() };
    Object.assign(entry, await fdaRecallLookup(med.drug));
    meds.push(entry);
  }
  return { generatedAt: new Date().toISOString(), personName: list.personName, email: list.email, meds, notes: REPORT_NOTES };
}

async function runMonthlyReport(id) {
  const list = lists.find((l) => l.id === id);
  if (!list) return;
  medReportEl.hidden = false;
  medReportEl.innerHTML = '<p class="live-status">Generating the monthly report — querying the FDA openFDA API for each medicine (drug names only are sent; this device\'s name and email are not)…</p>';
  medReportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const report = await buildReportLocal(list);

  const sections = report.meds.map((m) => {
    const head = `
      <h4>${escapeHtml(m.drug)}${m.strength ? ' ' + escapeHtml(m.strength) : ''}${m.maker ? ' — ' + escapeHtml(m.maker) : ''}${m.ndc ? ' · NDC ' + escapeHtml(m.ndc) : ''}</h4>`;
    let body;
    if (m.status === 'source-failure') {
      body = '<p class="live-status is-error">Source unreachable (' + escapeHtml(m.error || 'error') + ') — a check failure, not "no findings". Re-run shortly.</p>';
    } else if (m.status === 'no-matching-records') {
      body = '<p class="live-row">No matching recall records found in this query — which is not the same as "no recalls exist anywhere". Coverage: drug enforcement reports indexed by openFDA, matched on the drug name.</p>';
    } else {
      body = (m.recalls || []).map(recallLine).join('') +
        '<p class="recs-note">A recalling firm or drug name alone does not confirm this person\'s bottle is affected — check the lot number and NDC with the pharmacist.</p>';
    }
    return `<div class="live-card">${head}${body}</div>`;
  }).join('');

  medReportEl.innerHTML = `
    <div class="result-card">
      <div class="result-head">
        <div class="result-id">
          <p class="result-brand">Monthly medicine quality check</p>
          <h2 class="result-name">${escapeHtml(report.personName)}</h2>
          <p class="result-barcode">Generated ${new Date(report.generatedAt).toLocaleString()} · real FDA data — never scored</p>
        </div>
        <span class="mock-badge">Real data</span>
      </div>
      ${sections}
      <ul class="checklist">
        ${report.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}
      </ul>
    </div>`;
}

function downloadIcs(id) {
  const list = lists.find((l) => l.id === id);
  if (!list) return;
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const pad2 = (n) => String(n).padStart(2, '0');
  const dt = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T090000`;
  const medSummary = list.meds
    .map((m) => `${m.drug}${m.strength ? ' ' + m.strength : ''}${m.maker ? ' (' + m.maker + ')' : ''}`)
    .join('; ');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GeneriCheck//Medicine Monitor//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:' + list.id + '@genericheck',
    'DTSTAMP:' + dt(now) + 'Z',
    'DTSTART:' + dt(next),
    'RRULE:FREQ=MONTHLY;INTERVAL=1',
    'SUMMARY:Monthly medicine quality check — ' + list.personName,
    'DESCRIPTION:Check recalls & maker changes for: ' + medSummary + '. Open GeneriCheck and run the monthly report. Check the lot number on each bottle. Never stop a medication on your own — talk to your pharmacist.',
    'BEGIN:VALARM', 'TRIGGER:-PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Monthly medicine quality check', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'medicine-check-' + list.personName.replace(/\s+/g, '-') + '.ics';
  a.click();
  URL.revokeObjectURL(url);
}

async function emailReport(id) {
  const list = lists.find((l) => l.id === id);
  if (!list || !list.email) return;
  const report = await buildReportLocal(list);
  const lines = [`Monthly medicine quality check — ${report.personName}`, `Generated ${new Date(report.generatedAt).toLocaleString()}`, ''];
  for (const m of report.meds) {
    const label = `${m.drug}${m.strength ? ' ' + m.strength : ''}${m.maker ? ' (' + m.maker + ')' : ''}`;
    if (m.status === 'ok') {
      lines.push(`${label}: ${m.recalls.length} matching recall record(s) in openFDA — check lots with your pharmacist.`);
      for (const r of m.recalls) lines.push(`  - ${r.classification}, ${r.status}, reported ${r.reportDate}, firm: ${r.recallingFirm}`);
    } else if (m.status === 'no-matching-records') {
      lines.push(`${label}: no matching recall records in this query (not the same as "no recalls exist").`);
    } else {
      lines.push(`${label}: source unreachable — re-run the check.`);
    }
  }
  lines.push('', 'Never stop or change a medication on your own — discuss findings with your pharmacist or prescriber.');
  const subject = `Monthly medicine quality check — ${report.personName}`;
  window.location.href = 'mailto:' + encodeURIComponent(report.email) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n'));
}
