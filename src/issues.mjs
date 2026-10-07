// Turns data/last-run.json into GitHub issues: one per high/medium event, updated (not duplicated) when
// the same thing changes again. On the first run, all differences from the audit go into one issue.
// Needs GITHUB_TOKEN and GITHUB_REPOSITORY (set automatically in GitHub Actions).
import { readFileSync } from 'node:fs';

const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, GITHUB_SERVER_URL: server = 'https://github.com', GITHUB_SHA: sha = '' } = process.env;
if (!token || !repo) { console.log('GITHUB_TOKEN or GITHUB_REPOSITORY not set: skipping issues.'); process.exit(0); }
const run = JSON.parse(readFileSync('data/last-run.json', 'utf8'));
const cfg = JSON.parse(readFileSync('watchlist.json', 'utf8'));
const api = async (method, path, body) => {
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok && r.status !== 422) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
};

const LABELS = { 'source-watch': '5C6380', hook: 'E5462F', 'fact-check': 'F6B3A6', 'rank-change': '14A383' };
for (const [name, color] of Object.entries(LABELS)) await api('POST', '/labels', { name, color }); // 422 = exists

const open = [];
for (let page = 1; page < 10; page++) {
  const batch = await api('GET', `/issues?state=open&labels=source-watch&per_page=100&page=${page}`);
  open.push(...batch);
  if (batch.length < 100) break;
}
const marker = (key) => `<!-- source-watch:${key} -->`;
const report = `${server}/${repo}/blob/${sha || 'main'}/REPORT.md`;
const body = (e) => [
  marker(e.key), `**${e.title}**`, '',
  `- Page: [${e.publisher}](${e.url})`, `- Before: ${e.before}`, `- Now: ${e.after}`, `- Seen: ${run.date}`,
  ...(e.action ? [`- Next step: ${e.action}`] : []), '', `Full table: [REPORT.md](${report})`,
].join('\n');
// "hook" = something to mention in outreach: the client moved on a cited list, or the client changed its own page.
const labelsFor = (e) => ['source-watch', e.kind === 'fact-check' ? 'fact-check' : 'rank-change', ...(e.kind === 'client-rank' || (e.kind === 'fact-check' && e.publisher === cfg.client.name) ? ['hook'] : [])];

const important = run.events.filter((e) => e.severity !== 'low');
const vsAudit = important.filter((e) => e.source === 'audit');
const regular = important.filter((e) => e.source !== 'audit');

async function upsert(key, title, text, labels) {
  const found = open.find((i) => (i.body || '').includes(marker(key)));
  if (found) { await api('POST', `/issues/${found.number}/comments`, { body: text }); console.log(`updated #${found.number} ${title}`); }
  else { const i = await api('POST', '/issues', { title, body: text, labels }); console.log(`opened #${i.number} ${title}`); }
}
for (const e of regular) await upsert(e.key, e.title, body(e), labelsFor(e));
if (vsAudit.length) {
  const lines = vsAudit.map((e) => `- [${e.publisher}](${e.url}): ${e.before} in the audit → ${e.after} now`);
  await upsert(`audit-diff:${run.date}`, `${vsAudit.length} cited lists differ from the ${cfg.baseline_date} audit`,
    [marker(`audit-diff:${run.date}`), `On their first read, these lists rank ${cfg.client.name} differently from the audit of ${cfg.baseline_date}. Check each one: either the page changed since the audit, or the rank reader misreads it (then fix the page entry in watchlist.json).`, '', ...lines, '', `Full table: [REPORT.md](${report})`].join('\n'), ['source-watch', 'rank-change']);
}
console.log(`${regular.length + (vsAudit.length ? 1 : 0)} issue updates; ${run.events.length - important.length} low-severity events left in REPORT.md only.`);
