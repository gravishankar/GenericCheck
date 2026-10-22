/* GeneriCheck server — Express backend for medicine lists + monthly reports.
   Serves the static app and exposes:
     GET    /api/lists              all saved medicine lists
     POST   /api/lists              save a person's medicine list
     DELETE /api/lists/:id          remove a list
     GET    /api/lists/:id/report   monthly report (real openFDA recall queries)
     GET    /api/lists/:id/ics      recurring monthly calendar reminder
   Storage: JSON file on disk (prototype durability — see disclosure in UI). */

'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '256kb' }));

const DATA_DIR = path.join(__dirname, 'data');
const STORE = path.join(DATA_DIR, 'lists.json');

function readLists() {
  try {
    return JSON.parse(fs.readFileSync(STORE, 'utf8'));
  } catch {
    return [];
  }
}

function writeLists(lists) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STORE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(lists, null, 2));
  fs.renameSync(tmp, STORE);
}

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

/* ---- openFDA queries (server-side) ---- */

async function fdaFetch(query) {
  const res = await fetch('https://api.fda.gov/' + query, {
    headers: { 'User-Agent': 'GeneriCheck-prototype' },
  });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) return { error: 'HTTP ' + res.status };
  return res.json();
}

function esc(v) {
  const s = Array.isArray(v) ? v.join(', ') : (v ?? '');
  return String(s);
}

async function buildReport(list) {
  const meds = [];
  for (const med of list.meds) {
    const entry = { ...med, source: 'openFDA drug enforcement reports', queriedAt: new Date().toISOString() };
    try {
      const rec = await fdaFetch(
        'drug/enforcement.json?search=openfda.generic_name:"' +
          encodeURIComponent(med.drug) + '"&sort=report_date:desc&limit=5'
      );
      if (rec.error) {
        entry.status = 'source-failure';
        entry.error = rec.error;
      } else if (rec.notFound) {
        entry.status = 'no-matching-records';
      } else {
        entry.status = 'ok';
        entry.recalls = rec.results.map((r) => ({
          classification: esc(r.classification),
          status: esc(r.status),
          reportDate: esc(r.report_date),
          recallingFirm: esc(r.recalling_firm),
          product: esc(r.product_description),
          reason: esc(r.reason_for_recall),
          lots: esc(r.code_info),
        }));
      }
    } catch (err) {
      entry.status = 'source-failure';
      entry.error = 'network';
    }
    meds.push(entry);
  }
  return {
    generatedAt: new Date().toISOString(),
    personName: list.personName,
    email: list.email || '',
    meds,
    notes: [
      'No matching records means none found in this query — not "no recalls exist anywhere".',
      'A recalling firm or drug name alone does not confirm YOUR bottle is affected — check the lot number and NDC with your pharmacist.',
      'Also check the factory and inspection history at ProPublica Rx Inspector, and the TE code in the Orange Book.',
      'Update this list whenever a label shows a new maker. Never stop or change a medication on your own — discuss findings with your pharmacist or prescriber.',
    ],
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function buildIcs(list) {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const dt = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T090000`;
  const medSummary = list.meds
    .map((m) => `${m.drug}${m.strength ? ' ' + m.strength : ''}${m.maker ? ' (' + m.maker + ')' : ''}`)
    .join('; ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GeneriCheck//Medicine Monitor//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:' + list.id + '@genericheck',
    'DTSTAMP:' + dt(now) + 'Z',
    'DTSTART:' + dt(next),
    'RRULE:FREQ=MONTHLY;INTERVAL=1',
    'SUMMARY:Monthly medicine quality check — ' + list.personName,
    'DESCRIPTION:Check recalls & maker changes for: ' + medSummary +
      '. Open GeneriCheck and run the monthly report. Check the lot number on each bottle. Never stop a medication on your own — talk to your pharmacist.',
    'BEGIN:VALARM',
    'TRIGGER:-PT0M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Monthly medicine quality check',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

/* ---- API routes ---- */

app.get('/api/lists', (req, res) => {
  const lists = readLists().map((l) => ({
    id: l.id,
    personName: l.personName,
    email: l.email,
    meds: l.meds.map((m) => ({ drug: m.drug })),
    createdAt: l.createdAt,
  }));
  res.json({ lists });
});

app.post('/api/lists', (req, res) => {
  const parsed = validList(req.body);
  if (!parsed) {
    res.status(400).json({ error: 'A person name and at least one medicine (with drug name) are required. Email must look like an email address if provided.' });
    return;
  }
  const lists = readLists();
  const list = {
    id: crypto.randomUUID(),
    ...parsed,
    createdAt: new Date().toISOString(),
  };
  lists.push(list);
  writeLists(lists);
  res.status(201).json({ id: list.id, personName: list.personName });
});

app.delete('/api/lists/:id', (req, res) => {
  const lists = readLists();
  const next = lists.filter((l) => l.id !== req.params.id);
  if (next.length === lists.length) {
    res.status(404).json({ error: 'List not found.' });
    return;
  }
  writeLists(next);
  res.json({ ok: true });
});

app.get('/api/lists/:id/report', async (req, res) => {
  const list = readLists().find((l) => l.id === req.params.id);
  if (!list) {
    res.status(404).json({ error: 'List not found.' });
    return;
  }
  const report = await buildReport(list);
  res.json(report);
});

app.get('/api/lists/:id/ics', (req, res) => {
  const list = readLists().find((l) => l.id === req.params.id);
  if (!list) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="medicine-check-' + encodeURIComponent(list.personName) + '.ics"');
  res.send(buildIcs(list));
});

/* ---- static files (local dev mode; deploy_website serves these itself) ---- */

app.use(express.static(__dirname));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('GeneriCheck server listening on ' + PORT);
});
