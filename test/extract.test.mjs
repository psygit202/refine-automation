import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankBrands, numberedItems, readFacts, pageDates, mainHtml } from '../src/extract.mjs';

const brands = [
  { name: 'folk', aliases: ['Folk', 'folk CRM'] }, { name: 'Attio' }, { name: 'Pipedrive' }, { name: 'HubSpot', aliases: ['HubSpot CRM'] },
  { name: 'Zoho CRM', aliases: ['Zoho'] }, { name: 'Close', aliases: ['Close CRM'], start_only: true },
];
const page = (body) => `<html><head><title>t</title></head><body><nav><h2>HubSpot login</h2></nav><article>${body}</article><footer><h3>Folk newsletter</h3></footer></body></html>`;

test('numbered list: ranks follow the page numbers, unknown products included', () => {
  const html = page('<h2>Quick comparison</h2><h2>1. Rework: our own CRM</h2><h3>Pros</h3><h2>2. HubSpot CRM: ecosystem</h2><h2>3. Pipedrive: pipelines</h2><h2>4. Attio: flexible</h2><h2>5. Folk: lightweight</h2><h2>FAQ</h2><h3>1. How to choose?</h3>');
  const r = rankBrands(html, brands);
  assert.equal(r.method, 'numbered');
  assert.equal(r.length, 5);
  assert.deepEqual([r.ranks.folk, r.ranks.Attio, r.ranks.Pipedrive, r.ranks.HubSpot], [5, 4, 3, 2]);
  assert.equal(r.order[0], '(other)');
});

test('numbered how-to steps are not mistaken for a product list', () => {
  const html = page('<h2>1. Define your needs</h2><h2>2. Set a budget</h2><h2>3. Test two tools</h2><h2>Pipedrive</h2><h2>HubSpot</h2><h2>Zoho</h2><p>folk is also an option.</p>');
  const r = rankBrands(html, brands);
  assert.equal(r.method, 'headings');
  assert.deepEqual(r.order, ['Pipedrive', 'HubSpot', 'Zoho CRM']);
  assert.equal(r.ranks.folk, 'mentioned');
});

test('heading order: repeats, nav and footer are ignored; the page subject is never ranked', () => {
  const html = page('<h2>Why leave HubSpot?</h2><h2>Pipedrive</h2><h2>Attio</h2><h2>Pipedrive vs Attio</h2><h2>folk CRM</h2><h2>Zoho</h2>');
  const r = rankBrands(html, brands, 'HubSpot');
  assert.deepEqual(r.order, ['Pipedrive', 'Attio', 'folk', 'Zoho CRM']);
  assert.equal(r.ranks.HubSpot, undefined);
  assert.equal(r.ranks.folk, 3);
});

test('a brand that is also a common word only counts when it opens the heading', () => {
  const html = page('<h2>Close more deals with a CRM</h2><h2>1. Pipedrive</h2><h2>2. Close CRM</h2><h2>3. Attio</h2>');
  assert.equal(rankBrands(html, brands).ranks.Close, 2);
  const prose = page('<h2>Pipedrive</h2><h2>How to close more deals</h2><h2>Attio</h2><h2>Zoho</h2>');
  assert.equal(rankBrands(prose, brands).ranks.Close, undefined);
});

test('absent brand is undefined, not "mentioned"', () => {
  const r = rankBrands(page('<h2>Pipedrive</h2><h2>Attio</h2><h2>Zoho</h2>'), brands);
  assert.equal(r.ranks.folk, undefined);
});

test('mainHtml prefers the article and drops navigation', () => {
  const m = mainHtml(page('<h2>Pipedrive</h2>'));
  assert.ok(m.includes('Pipedrive') && !m.includes('HubSpot login') && !m.includes('newsletter'));
});

test('numberedItems keeps the longest run counting up from 1', () => {
  assert.deepEqual(numberedItems(['1. A', 'x', '2) B', '3: C', '1. Step', '2. Step']), ['A', 'B', 'C']);
  assert.equal(numberedItems(['1. A', '2. B']), null);
});

test('facts: expected value, change, and "absent" checks', () => {
  const text = 'Standard Popular $24 22€ /member/month ... Premium $48 43€ /member/month';
  const [std, prem, none] = readFacts(text, [
    { id: 's', pattern: 'Standard[^$]{0,30}\\$(\\d+)[^/]{0,15}/member/month', expected: '24' },
    { id: 'p', pattern: 'Premium[^$]{0,30}\\$(\\d+)[^/]{0,15}/member/month', expected: '50' },
    { id: 'n', pattern: 'Enterprise plan', expect: 'absent' },
  ]);
  assert.deepEqual([std.value, std.ok], ['24', true]);
  assert.deepEqual([prem.value, prem.ok], ['48', false]);
  assert.equal(none.ok, true);
});

test('dates: JSON-LD and meta tags, normalised to YYYY-MM-DD', () => {
  assert.deepEqual(pageDates('<script>{"datePublished":"2026-04-28T10:00:00Z","dateModified":"2026-10-04T08:00:00+02:00"}</script>'), { modified: '2026-10-04', published: '2026-04-28' });
  assert.equal(pageDates('<meta property="article:modified_time" content="June 22, 2026">').modified, '2026-06-22');
});
