// Turns a page's HTML into a small, comparable snapshot: brand ranks, facts and dates.
// Nothing from the page body is stored except brand names, numbers and dates.
import { createHash } from 'node:crypto';

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: '-', mdash: '-', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ecirc: 'ê', ocirc: 'ô', icirc: 'î', ucirc: 'û' };
export function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
export const toText = (html) => decode(String(html).replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr|td|th|section)>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t\f\v\r]+/g, ' ').replace(/\n\s*/g, '\n').trim();

// The article body: <article>, else <main>, else <body>, minus navigation, headers, footers and sidebars.
export function mainHtml(html) {
  let h = String(html).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ');
  const pick = (tag) => {
    const a = h.search(new RegExp('<' + tag + '[\\s>]', 'i'));
    const b = h.toLowerCase().lastIndexOf('</' + tag + '>');
    return a >= 0 && b > a ? h.slice(a, b) : '';
  };
  h = pick('article') || pick('main') || pick('body') || h;
  return h.replace(/<(nav|header|footer|aside|form)[\s>][\s\S]*?<\/\1>/gi, ' ');
}

export const headings = (html) => [...String(html).matchAll(/<h([2-4])[^>]*>([\s\S]*?)<\/h\1>/gi)]
  .map((m) => toText(m[2]).replace(/\s+/g, ' ').trim()).filter(Boolean);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Case-sensitive word match on each alias. start_only brands (names that are also common words) must open the heading.
function brandRx(b) {
  const alts = [b.name, ...(b.aliases || [])].map(esc).join('|');
  return b.start_only
    ? new RegExp('^\\W*(?:#?\\d+[.):]?\\s*)?(?:' + alts + ')(?![\\w-])')
    : new RegExp('(?<![\\w-])(?:' + alts + ')(?![\\w-])');
}

// The page's own numbering ("1. Attio", "11) Folk: ..."): the longest run counting up from 1.
// Unnumbered headings inside the list (Pros, Cons, Pricing) are ignored.
export function numberedItems(heads) {
  let best = [], cur = [];
  for (const h of heads) {
    const m = /^\s*#?(\d{1,2})\s*[.):\-–—]\s*(\S.*)$/.exec(h);
    if (!m) continue;
    const n = Number(m[1]);
    if (n === cur.length + 1) cur.push(m[2]);
    else if (n === 1) { if (cur.length > best.length) best = cur; cur = [m[2]]; }
  }
  if (cur.length > best.length) best = cur;
  return best.length >= 3 ? best : null;
}

const firstBrand = (text, rx) => {
  let best = null;
  for (const { b, re } of rx) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.i)) best = { name: b.name, i: m.index };
  }
  return best && best.name;
};

// Where each brand sits on a list page. A numbered list is read by its numbers, so unknown products
// (often the publisher's own) still count. Otherwise rank = order in which brands first open a heading,
// skipping headings that repeat a ranked brand (comparisons, FAQs). `subject` (the brand a
// "<X> alternatives" page is about) is never ranked.
export function rankBrands(html, brands, subject = '') {
  const rx = brands.filter((b) => b.name !== subject).map((b) => ({ b, re: brandRx(b) }));
  const body = mainHtml(html);
  const variants = [body, String(html).replace(/<(nav|header|footer)[\s>][\s\S]*?<\/\1>/gi, ' '), String(html)];
  let order = null, method = 'headings', length = 0;
  for (const v of variants) {
    const items = numberedItems(headings(v));
    const named = items && items.map((t) => firstBrand(t, rx) || null);
    // Numbered how-to steps are not a product list: at least half the entries must name a known product.
    if (named && named.filter(Boolean).length * 2 >= named.length) { order = named; method = 'numbered'; length = named.length; break; }
  }
  if (!order) {
    const byHeadings = (v) => {
      const o = [];
      for (const h of headings(v)) {
        const name = firstBrand(h, rx);
        if (name && !o.includes(name)) o.push(name);
      }
      return o;
    };
    const isSubseq = (a, b) => { let j = 0; for (const x of b) if (x === a[j]) j++; return j === a.length; };
    const [inMain, inPage, inAll] = variants.map(byHeadings);
    // Prefer the article body; take the page minus menus when it only adds products the body selector cut off.
    order = inMain.length >= 3 ? (inPage.length > inMain.length && isSubseq(inMain, inPage) ? inPage : inMain) : inPage.length >= 3 ? inPage : inAll;
    length = order.length;
  }
  const text = toText(body);
  const ranks = {};
  for (const { b, re } of rx) {
    const k = order.indexOf(b.name);
    if (k >= 0) ranks[b.name] = k + 1;
    else if (!b.start_only && new RegExp(re.source.replace(/^\^/, '')).test(text)) ranks[b.name] = 'mentioned';
  }
  return { ranks, order: order.map((n) => n || '(other)'), length, method, hash: createHash('sha256').update(text).digest('hex').slice(0, 16) };
}

// Last-modified date from the usual places: JSON-LD, meta tags, <time>.
export function pageDates(html) {
  const s = String(html);
  // Keep the page's own calendar date: ISO strings as written; anything else parsed and formatted in local time.
  const iso = (v) => {
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s.slice(0, 10);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  };
  const grab = (re) => { const m = re.exec(s); return m ? iso(m[1]) : ''; };
  return {
    modified: grab(/"dateModified"\s*:\s*"([^"]+)"/) || grab(/<meta[^>]+(?:property|name)=["'](?:article:modified_time|og:updated_time|last-modified)["'][^>]+content=["']([^"']+)/i),
    published: grab(/"datePublished"\s*:\s*"([^"]+)"/) || grab(/<meta[^>]+(?:property|name)=["']article:published_time["'][^>]+content=["']([^"']+)/i),
  };
}

// A fact is a regex run on the page text; capture group `group` (default 1) is the value.
export function readFacts(text, facts = []) {
  const flat = String(text).replace(/\s+/g, ' ');
  return facts.map((f) => {
    const m = new RegExp(f.pattern, f.flags ?? 'i').exec(flat);
    const value = m ? (m[f.group || 1] ?? m[0]).trim() : null;
    const ok = f.expect === 'absent' ? value === null : f.expect === 'present' ? value !== null : value === String(f.expected);
    return { id: f.id, label: f.label, value, expected: f.expect ?? String(f.expected), ok, used_in: f.used_in || '' };
  });
}
