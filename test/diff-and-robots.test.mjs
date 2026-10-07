import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffPage } from '../src/diff.mjs';
import { robotsAllows } from '../src/fetch.mjs';
import { renderReport } from '../src/report.mjs';

const cfg = { client: { name: 'folk' }, competitors: ['Attio', 'Pipedrive', 'HubSpot'], baseline_date: '2026-10-06', brands: [] };
const list = { id: 'dupple', type: 'list', publisher: 'Dupple', url: 'https://x', priority: true, baseline: { folk: 8 } };
const snap = (ranks, extra = {}) => ({ status: 'ok', ranks, order: Object.keys(ranks), length: Object.keys(ranks).length, dates: { modified: '2026-10-01' }, ...extra });

test('first run: client rank compared with the audit; equal means no event', () => {
  assert.equal(diffPage(list, null, snap({ Attio: 1, folk: 8 }), cfg).length, 0);
  const [e] = diffPage(list, null, snap({ Attio: 1, folk: 5 }), cfg);
  assert.equal(e.kind, 'client-rank');
  assert.equal(e.source, 'audit');
  assert.match(e.title, /#5 \(audit on 2026-10-06: #8\)/);
});

test('week over week: client moves up = high-severity proof point; rival added on a priority page', () => {
  const prev = snap({ Attio: 1, Pipedrive: 3, folk: 8 });
  const now = snap({ Attio: 1, Pipedrive: 3, folk: 4, HubSpot: 2 });
  const ev = diffPage(list, prev, now, cfg);
  const client = ev.find((e) => e.kind === 'client-rank');
  assert.equal(client.direction, 'up');
  assert.equal(client.severity, 'high');
  assert.match(client.action, /Proof point/);
  assert.ok(ev.some((e) => e.kind === 'rival-rank' && e.brand === 'HubSpot' && e.direction === 'added'));
  assert.ok(ev.some((e) => e.kind === 'list-change'));
});

test('client removed from a list asks for the update pack', () => {
  const [e] = diffPage(list, snap({ Attio: 1, folk: 8 }), snap({ Attio: 1 }), cfg).filter((x) => x.kind === 'client-rank');
  assert.equal(e.direction, 'removed');
  assert.match(e.action, /update pack/);
});

test('facts: a changed price quoted in outreach is high severity', () => {
  const pg = { id: 'hubspot', type: 'facts', publisher: 'HubSpot', url: 'https://h' };
  const prev = { status: 'ok', dates: {}, facts: [{ id: 'pro', value: '$90', ok: true }] };
  const now = { status: 'ok', dates: {}, facts: [{ id: 'pro', label: 'Pro', value: '$100', expected: '$90', ok: false, used_in: 'message 3' }] };
  const [e] = diffPage(pg, prev, now, cfg);
  assert.equal(e.kind, 'fact-check');
  assert.equal(e.severity, 'high');
  assert.match(e.action, /message 3/);
});

test('facts: editing the expected value in the watchlist raises an alert even if the page did not change', () => {
  const pg = { id: 'hubspot', type: 'facts', publisher: 'HubSpot', url: 'https://h' };
  const prev = { status: 'ok', dates: {}, facts: [{ id: 'pro', value: '$90', ok: true }] };
  const now = { status: 'ok', dates: {}, facts: [{ id: 'pro', label: 'Pro', value: '$90', expected: '$95', ok: false, used_in: 'message 3' }] };
  assert.equal(diffPage(pg, prev, now, cfg)[0].kind, 'fact-check');
  // Still wrong the week after, same value: no new alert (the open issue stands).
  assert.equal(diffPage(pg, { ...now }, now, cfg).length, 0);
});

test('a page that becomes blocked is reported once, without touching ranks', () => {
  const ev = diffPage(list, snap({ folk: 8 }), { status: 'blocked', http: 403 }, cfg);
  assert.deepEqual(ev.map((e) => e.kind), ['fetch']);
});

test('robots.txt: bot group beats *, longest rule wins, empty Disallow allows', () => {
  const txt = 'User-agent: *\nDisallow: /blog/\nAllow: /blog/crm\n\nUser-agent: OtherBot\nDisallow: /';
  assert.equal(robotsAllows(txt, '/blog/x'), false);
  assert.equal(robotsAllows(txt, '/blog/crm-guide'), true);
  assert.equal(robotsAllows('User-agent: refine-source-watch\nDisallow:\n\nUser-agent: *\nDisallow: /', '/a'), true);
  assert.equal(robotsAllows('', '/a'), true);
});

test('report renders the fact table and the list table', () => {
  const c = { ...cfg, pages: [list, { id: 'hs', type: 'facts', publisher: 'HubSpot', url: 'https://h', facts: [{ id: 'pro', label: 'Pro price', expected: '$90', used_in: 'message 3' }] }] };
  const md = renderReport(c, { dupple: snap({ folk: 8, Attio: 1 }), hs: { status: 'ok', facts: [{ id: 'pro', value: '$90', ok: true }] } }, [], '2026-10-07');
  assert.match(md, /\| \[Pro price\]\(https:\/\/h\) \| \$90 \| \$90 \| OK \| message 3 \|/);
  assert.match(md, /\| \[Dupple\]\(https:\/\/x\) ★ \| #8 \| #8 \|/);
});
