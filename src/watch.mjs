// Weekly source watch: read every page in watchlist.json, snapshot it, diff it with last week,
// then write data/snapshots/*.json, data/history.csv, data/last-run.json and REPORT.md.
// Usage: node src/watch.mjs [--only id1,id2]
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPage, closeBrowser } from './fetch.mjs';
import { rankBrands, pageDates, readFacts, toText, decode } from './extract.mjs';
import { diffPage } from './diff.mjs';
import { renderReport } from './report.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(root, 'watchlist.json'), 'utf8'));
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;
const runDate = new Date().toISOString().slice(0, 10);
const snapDir = join(root, 'data', 'snapshots');
mkdirSync(snapDir, { recursive: true });
const brands = [cfg.client, ...cfg.brands];
const keep = new Set([cfg.client.name, ...cfg.competitors]);

function snapshot(page, res) {
  const s = { id: page.id, url: page.url, status: res.status, http: res.http };
  if (res.status !== 'ok') return s;
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(res.html);
  s.title = title ? decode(title[1]).replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  s.dates = pageDates(res.html);
  if (page.type === 'list') {
    // Publishers often list their own product first, so it counts as an entry on its own page.
    const own = brands.some((b) => b.name === page.publisher) ? [] : [{ name: page.publisher, start_only: true }];
    const r = rankBrands(res.html, [...brands, ...own], page.subject || '');
    // Keep the client and competitors always; other brands only when ranked.
    s.ranks = Object.fromEntries(Object.entries(r.ranks).filter(([b, v]) => keep.has(b) || typeof v === 'number'));
    Object.assign(s, { order: r.order.slice(0, 30), length: r.length, method: r.method, hash: r.hash });
  }
  if ((page.facts || []).length) s.facts = readFacts(res.text || toText(res.html), page.facts);
  return s;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const pages = cfg.pages.filter((p) => !only || only.has(p.id));
const results = await pool(pages, 4, async (page) => {
  const res = await getPage(page.url, { render: !!page.render, waitFor: page.wait_for || '', timeout: page.render ? 45000 : 30000 });
  const snap = snapshot(page, res);
  const file = join(snapDir, page.id + '.json');
  const prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  // A page that fails this week keeps its last good snapshot, so next week compares against real data.
  const events = diffPage(page, prev, snap, cfg);
  // Snapshots only change when the page does, so the git history of data/snapshots is the change log.
  // (The run date of every reading is in data/history.csv.)
  if (snap.status === 'ok') {
    const same = prev && prev.status === 'ok' && JSON.stringify({ ...prev, changed: undefined, checked: undefined, last_failure: undefined }) === JSON.stringify({ ...snap, changed: undefined });
    writeFileSync(file, JSON.stringify({ ...snap, changed: same ? prev.changed : runDate }, null, 2) + '\n');
  } else if (!prev) {
    writeFileSync(file, JSON.stringify({ ...snap, changed: runDate }, null, 2) + '\n');
  } else {
    writeFileSync(file, JSON.stringify({ ...prev, last_failure: { date: runDate, status: snap.status, http: snap.http } }, null, 2) + '\n');
  }
  console.log(`${snap.status.padEnd(7)} ${page.id.padEnd(28)} ${page.type === 'list' && snap.status === 'ok' ? cfg.client.name + ' ' + (snap.ranks[cfg.client.name] ?? '-') + ' of ' + snap.length : ''}${(snap.facts || []).map((f) => ` ${f.id}=${f.value}${f.ok ? '' : ' (CHANGED)'}`).join('')}`);
  return { page, snap, events };
});
await closeBrowser();

// History: one row per page per run, for charts over time.
const hist = join(root, 'data', 'history.csv');
if (!existsSync(hist)) writeFileSync(hist, ['date', 'page', 'status', ...[cfg.client.name, ...cfg.competitors].map((b) => b + '_rank'), 'items', 'facts'].join(',') + '\n');
const csv = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v ?? ''));
for (const { page, snap } of results) {
  const ranks = [cfg.client.name, ...cfg.competitors].map((b) => (snap.ranks ? snap.ranks[b] ?? 'no' : ''));
  const facts = (snap.facts || []).map((f) => f.id + '=' + (f.value ?? 'none')).join('; ');
  appendFileSync(hist, [runDate, page.id, snap.status, ...ranks, snap.length ?? '', facts].map(csv).join(',') + '\n');
}

const events = results.flatMap((r) => r.events);
writeFileSync(join(root, 'data', 'last-run.json'), JSON.stringify({ date: runDate, pages: results.length, events }, null, 2) + '\n');
const allSnaps = Object.fromEntries(cfg.pages.map((p) => [p.id, existsSync(join(snapDir, p.id + '.json')) ? JSON.parse(readFileSync(join(snapDir, p.id + '.json'), 'utf8')) : null]));
for (const { page, snap } of results) if (snap.status !== 'ok' && allSnaps[page.id]) allSnaps[page.id] = { ...allSnaps[page.id], status: snap.status };
writeFileSync(join(root, 'REPORT.md'), renderReport(cfg, allSnaps, events, runDate));
console.log(`\n${results.filter((r) => r.snap.status === 'ok').length}/${results.length} pages read, ${events.length} events (${events.filter((e) => e.severity === 'high').length} high). See REPORT.md.`);
