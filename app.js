/* FixIndex — scoring engine, barcode input, and rendering.
   Pattern adapted from Yuka's published model:
   identify -> metadata lookup -> weighted score with caps -> alternatives. */

'use strict';

/* ============ Scoring engine ============ */

const MAX_SOFTWARE_YEARS = 7;
const RECOMMENDATION_THRESHOLD = 60;

function softwareNorm(years) {
  return Math.round((Math.min(years, MAX_SOFTWARE_YEARS) / MAX_SOFTWARE_YEARS) * 100);
}

/* Each criterion contributes weight × value to the 0–100 index. */
const CRITERIA = [
  { key: 'partsAvailability', label: 'Spare parts supply', weight: 0.25,
    hint: 'Official and third-party parts stay on sale after launch' },
  { key: 'repairManuals', label: 'Repair documentation', weight: 0.20,
    hint: 'Free teardown guides, schematics and part numbers' },
  { key: 'disassemblyDifficulty', label: 'Ease of disassembly', weight: 0.20, invert: true,
    hint: 'Modular, fastener-based assembly vs fused and glued' },
  { key: 'batteryReplaceability', label: 'Battery serviceability', weight: 0.20,
    hint: 'Replacing the battery with standard tools' },
  { key: 'sparePartsPriceIndex', label: 'Parts affordability', weight: 0.10,
    hint: 'Spare-part cost relative to the device price' },
  { key: 'softwareSupportYears', label: 'Software support', weight: 0.05, norm: softwareNorm,
    hint: 'Pledged years of updates, normalized to 7 years' },
];

/* Hard barriers cap the final score, Yuka hazard-cap style. */
const BARRIERS = [
  { test: (a) => a.partsPairingLock, cap: 24, severity: 'severe',
    title: 'Serialized parts pairing',
    note: 'Swapped components are rejected or degraded until re-registered with the vendor — a hard repair blocker.' },
  { test: (a) => a.batteryReplaceability <= 15, cap: 49, severity: 'moderate',
    title: 'Battery not serviceable',
    note: 'The battery is glued or soldered in; replacement is destructive and expensive.' },
  { test: (a) => a.disassemblyDifficulty >= 90, cap: 49, severity: 'moderate',
    title: 'No service entry point',
    note: 'The chassis is fused — opening it without damage is not practical.' },
];

/* Additional risk flags shown on the card, without capping. */
const RISKS = [
  { test: (a) => a.disassemblyDifficulty >= 70 && a.disassemblyDifficulty < 90,
    title: 'Adhesive-heavy assembly', severity: 'moderate',
    note: 'Heat and prying required — high risk of cosmetic damage during repair.' },
  { test: (a) => a.batteryReplaceability > 15 && a.batteryReplaceability <= 40,
    title: 'Battery swap needs full teardown', severity: 'moderate',
    note: 'The battery is reachable only after removing many other components.' },
  { test: (a) => a.repairManuals <= 35,
    title: 'No free repair documentation', severity: 'moderate',
    note: 'Official guides or schematics are not published for this model.' },
  { test: (a) => a.partsAvailability <= 30,
    title: 'Scarce parts supply', severity: 'moderate',
    note: 'Spare parts are hard to find outside authorized channels.' },
  { test: (a) => a.sparePartsPriceIndex <= 25,
    title: 'Pricey spare parts', severity: 'moderate',
    note: 'Replacement parts cost a large share of the device price.' },
  { test: (a) => a.softwareSupportYears <= 4,
    title: 'Short update window', severity: 'moderate',
    note: (a) => `Only ${a.softwareSupportYears} years of software support — the device ages fast even if the hardware lasts.` },
];

/* Positive flags. */
const POSITIVES = [
  { test: (a) => a.repairManuals >= 80,
    title: 'Official repair hub',
    note: 'Free teardown guides and schematics are published for this model.' },
  { test: (a) => a.partsAvailability >= 80,
    title: 'Deep parts catalog',
    note: 'Official and third-party parts stay on sale for years.' },
  { test: (a) => a.batteryReplaceability >= 80,
    title: 'User-replaceable battery',
    note: 'Swappable with standard tools in minutes.' },
  { test: (a) => a.disassemblyDifficulty <= 25,
    title: 'Modular, fastener-based build',
    note: 'Opens with standard screwdrivers — no adhesive gauntlet.' },
  { test: (a) => a.sparePartsPriceIndex >= 65,
    title: 'Affordable spares',
    note: 'Replacement parts cost a small share of the device price.' },
  { test: (a) => a.softwareSupportYears >= 7,
    title: (a) => `${a.softwareSupportYears}-year update pledge`,
    note: 'Software support outlasts the typical ownership period.' },
];

function tierFor(score) {
  if (score >= 70) return { id: 'green', label: 'Repair-friendly' };
  if (score >= 40) return { id: 'yellow', label: 'Mixed repairability' };
  return { id: 'red', label: 'Repair-hostile' };
}

function gradeItem(item) {
  const contributions = CRITERIA.map((c) => {
    const raw = c.norm
      ? c.norm(item.attrs[c.key])
      : c.invert ? 100 - item.attrs[c.key] : item.attrs[c.key];
    return { ...c, value: Math.max(0, Math.min(100, raw)), points: raw * c.weight };
  });
  const rawScore = Math.round(contributions.reduce((sum, c) => sum + c.points, 0));

  const barriers = BARRIERS.filter((b) => b.test(item.attrs));
  const cap = barriers.length ? Math.min(...barriers.map((b) => b.cap)) : null;
  const score = cap !== null ? Math.min(rawScore, cap) : rawScore;

  return {
    item, rawScore, cap, score, contributions, barriers,
    tier: tierFor(score),
    capped: cap !== null && rawScore > cap,
  };
}

function findAlternatives(item) {
  const scored = ITEMS.map(gradeItem);
  return scored
    .filter((g) => g.item.subcategory === item.subcategory && g.score > gradeItem(item).score)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/* ============ Rendering ============ */

const resultEl = document.getElementById('result');
const CIRCUMFERENCE = 2 * Math.PI * 54;

function dialSvg(score, tier) {
  return `
    <div class="dial" role="img" aria-label="Repairability score ${score} out of 100, ${tier.label}">
      <svg viewBox="0 0 132 132" aria-hidden="true">
        <circle class="dial-track" cx="66" cy="66" r="54"></circle>
        <circle class="dial-fill tier-${tier.id}" cx="66" cy="66" r="54"
          stroke-dasharray="${CIRCUMFERENCE.toFixed(2)}"
          stroke-dashoffset="${(CIRCUMFERENCE * (1 - score / 100)).toFixed(2)}"></circle>
      </svg>
      <span class="dial-number">${score}</span>
    </div>`;
}

function resolveText(v, attrs) {
  return typeof v === 'function' ? v(attrs) : v;
}

function flagCard(flag, kind) {
  const dot = kind === 'positive' ? 'dot-green' : (flag.severity === 'severe' ? 'dot-red' : 'dot-yellow');
  return `
    <div class="flag-card">
      <div class="flag-head"><span class="dot ${dot}" aria-hidden="true"></span>
        <span class="flag-title">${resolveText(flag.title, flag._attrs)}</span></div>
      <p class="flag-note">${resolveText(flag.note, flag._attrs)}</p>
    </div>`;
}

function renderResult(item) {
  const g = gradeItem(item);
  const risks = [
    ...g.barriers,
    ...RISKS.filter((r) => r.test(item.attrs)).map((r) => ({ ...r, _attrs: item.attrs })),
  ];
  const positives = POSITIVES
    .filter((p) => p.test(item.attrs))
    .map((p) => ({ ...p, _attrs: item.attrs }));

  const recs = g.score < RECOMMENDATION_THRESHOLD ? findAlternatives(item) : null;

  const capNotice = g.capped ? `
    <div class="cap-notice ${g.barriers.some((b) => b.severity === 'severe') ? 'is-severe' : 'is-moderate'}">
      <strong>Score capped at ${g.cap}</strong>
      ${g.barriers.map((b) => b.title).join(' · ')} — raw weighted score of ${g.rawScore} is limited by this barrier.
    </div>` : '';

  const recSection = recs === null ? '' : `
    <section class="recs" aria-labelledby="recHeading">
      <h3 id="recHeading">Better alternatives — ${item.subcategory}</h3>
      ${recs.length
        ? `<div class="rec-list">${recs.map((r) => `
            <button class="rec-card" data-barcode="${r.item.barcode}" type="button">
              <span class="rec-id">
                <span class="dot dot-${r.tier.id}" aria-hidden="true"></span>
                <span><span class="rec-name">${r.item.brand} ${r.item.model}</span><br>
                <span class="rec-brand">${r.item.subcategory}</span></span>
              </span>
              <span class="rec-score">${r.score}</span>
            </button>`).join('')}</div>`
        : `<p class="rec-none">No higher-scoring ${item.subcategory.toLowerCase()} exists in the database yet — this one already tops its subcategory.</p>`}
      <p class="recs-note">Independent picks: same subcategory, strictly higher score, ordered by score. Triggered below ${RECOMMENDATION_THRESHOLD}/100. Brands can't pay for placement.</p>
    </section>`;

  resultEl.innerHTML = `
    <article class="result-card">
      <div class="result-head">
        <div class="result-id">
          <p class="result-brand">${item.brand}</p>
          <h2 class="result-name">${item.model}</h2>
          <p class="result-barcode">${item.subcategory} · barcode ${item.barcode}</p>
        </div>
        <div class="score-block">
          ${dialSvg(g.score, g.tier)}
          <div class="score-meta">
            <span class="badge badge-${g.tier.id}"><span class="dot dot-${g.tier.id}" aria-hidden="true"></span>${g.tier.label}</span>
            <p class="score-caption">
              <strong>${g.score}/100 repairability.</strong>
              Weighted across six criteria${g.capped ? ', then capped by a hard barrier' : ''}.
            </p>
          </div>
        </div>
      </div>

      ${capNotice}

      <section class="breakdown" aria-labelledby="bkHeading">
        <h3 id="bkHeading">Score breakdown</h3>
        ${g.contributions.map((c) => `
          <div class="criterion">
            <div class="criterion-row">
              <span class="criterion-name" title="${c.hint}">${c.label}</span>
              <span class="criterion-pts"><span class="val">${c.points.toFixed(1)}</span> / ${(c.weight * 100).toFixed(0)} pts</span>
            </div>
            <div class="bar-track"><div class="bar-fill tier-${tierFor(c.value).id}" style="width:${c.value}%"></div></div>
          </div>`).join('')}
        <p class="recs-note">Score = Σ (criterion 0–100 × weight)${g.cap !== null ? `, capped at ${g.cap} by barriers` : ''}. Raw score before caps: ${g.rawScore}.</p>
      </section>

      <section class="flags" aria-labelledby="flagHeading">
        <h3 id="flagHeading">Risk and positive flags</h3>
        <div class="flag-grid">
          ${risks.map((r) => flagCard(r, 'risk')).join('')}
          ${positives.map((p) => flagCard(p, 'positive')).join('')}
        </div>
      </section>

      ${recSection}
    </article>`;

  resultEl.hidden = false;
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderNotFound(code) {
  resultEl.innerHTML = `
    <section class="not-found">
      <h3>Code not in the database</h3>
      <p><span class="code">${code}</span> isn't one of the ${ITEMS.length} fictional products in this
      prototype's database. In a production app, this is where users could photograph and submit a
      product for review — the same flow Yuka uses for uncatalogued items.</p>
      <button class="btn btn-ghost" id="browseCatalogBtn" type="button">Browse the mock catalog</button>
    </section>`;
  resultEl.hidden = false;
  document.getElementById('browseCatalogBtn').addEventListener('click', () => {
    document.querySelector('.catalog').scrollIntoView({ behavior: 'smooth' });
  });
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============ Lookup ============ */

function normalizeCode(s) {
  return String(s || '').replace(/[\s-]/g, '');
}

function lookup(code) {
  const c = normalizeCode(code);
  const item = ITEMS.find((i) => i.barcode === c);
  if (item) renderResult(item);
  else renderNotFound(c);
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
    setScanError('Camera scanning needs a secure (https) context. Type a code instead.');
    return;
  }
  if (!('BarcodeDetector' in window)) {
    setScanError('This browser has no built-in barcode detection (Safari, for instance). Type the code instead — sample codes are below.');
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (err) {
    setScanError('Camera unavailable or permission denied. Type a code instead.');
    return;
  }

  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    detector = new window.BarcodeDetector({ formats });
  } catch (err) {
    detector = new window.BarcodeDetector();
  }

  video.srcObject = stream;
  await video.play();
  videoWrap.classList.add('is-live');
  videoIdle.setAttribute('hidden', '');
  startCameraBtn.hidden = true;
  stopCameraBtn.hidden = false;
  scanStatus.textContent = 'Scanning — hold a barcode inside the frame';
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

/* Feature-detect on load and set expectations in the idle overlay. */
(function checkSupport() {
  if (!('BarcodeDetector' in window)) {
    scanSupportNote.textContent = 'This browser has no built-in barcode detection — type a code instead.';
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
  if (normalizeCode(input.value).length === 0) {
    input.focus();
    return;
  }
  lookup(input.value);
});

/* Sample chips */
const SAMPLES = [
  { barcode: '0012345678905', label: 'Aster 6' },
  { barcode: '0012345678912', label: 'Aster 6 Pro' },
  { barcode: '0012345678981', label: 'Pip 3 earbuds' },
  { barcode: '0000000000000', label: 'Unknown code' },
];

const chipRow = document.getElementById('chipRow');
chipRow.innerHTML = SAMPLES.map((s) =>
  `<button class="chip" data-barcode="${s.barcode}" type="button">
     <span class="chip-label">${s.label}</span>${s.barcode}
   </button>`).join('');
chipRow.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) lookup(chip.dataset.barcode);
});

/* Catalog */
const catalogGrid = document.getElementById('catalogGrid');
catalogGrid.innerHTML = ITEMS.map((item) => {
  const g = gradeItem(item);
  return `
    <button class="catalog-card" data-barcode="${item.barcode}" type="button">
      <div class="catalog-top">
        <span class="catalog-cat">${item.category}</span>
        <span class="catalog-score"><span class="dot dot-${g.tier.id}" aria-hidden="true"></span>${g.score}</span>
      </div>
      <span class="catalog-name">${item.brand} ${item.model}</span>
      <span class="catalog-brand">${item.subcategory}</span>
    </button>`;
}).join('');
catalogGrid.addEventListener('click', (e) => {
  const card = e.target.closest('.catalog-card');
  if (card) lookup(card.dataset.barcode);
});

/* Recommendation cards inside results (delegated). */
resultEl.addEventListener('click', (e) => {
  const rec = e.target.closest('.rec-card');
  if (rec) lookup(rec.dataset.barcode);
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
