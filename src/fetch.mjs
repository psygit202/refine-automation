// Polite fetching: one identified user agent, robots.txt respected, a headless browser only for pages
// that build their content with JavaScript (watchlist "render": true).
export const BOT = 'refine-source-watch';
export const UA = `Mozilla/5.0 (compatible; ${BOT}/1.0; +https://github.com/psygit202/refine-automation)`;

// Minimal robots.txt: the group naming this bot, else "*"; longest matching Allow/Disallow wins.
export function robotsAllows(txt, path, bot = BOT) {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === 'allow' || key === 'disallow')) cur.rules.push({ allow: key === 'allow', path: val });
    }
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== '*' && bot.toLowerCase().includes(a)));
  const group = mine || groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  const toRx = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
  let best = null;
  for (const r of group.rules) {
    if (!r.path) continue; // "Disallow:" with no path allows everything
    if (toRx(r.path).test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

const robotsCache = new Map();
async function allowedByRobots(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let txt = '';
    try {
      const r = await fetch(u.origin + '/robots.txt', { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
      if (r.ok) txt = await r.text();
    } catch { /* unreachable robots.txt: treat as allowed */ }
    robotsCache.set(u.origin, txt);
  }
  return robotsAllows(robotsCache.get(u.origin), u.pathname + u.search);
}

let browser = null;
// Pages that keep polling never go network-idle, so wait for a text the content must contain (`waitFor`),
// or else for the load event plus a short settle.
async function render(url, timeout, waitFor) {
  if (!browser) {
    let pw;
    try { pw = await import('playwright'); } catch { throw new Error('playwright is not installed (npm ci, then npx playwright install chromium)'); }
    browser = await pw.chromium.launch();
  }
  const page = await browser.newPage({ userAgent: UA });
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    if (waitFor) await page.waitForFunction((t) => document.body && document.body.innerText.includes(t), waitFor, { timeout });
    else { await page.waitForLoadState('load', { timeout }).catch(() => {}); await page.waitForTimeout(3000); }
    return { http: resp ? resp.status() : 0, html: await page.content(), text: await page.evaluate(() => document.body.innerText) };
  } finally {
    await page.close();
  }
}
export async function closeBrowser() { if (browser) await browser.close(); browser = null; }

// Returns { status: ok | blocked | gone | error | robots, http, html, text? }.
export async function getPage(url, { render: useBrowser = false, waitFor = '', timeout = 30000, tries = 2 } = {}) {
  if (!(await allowedByRobots(url))) return { status: 'robots', http: 0, html: '' };
  let last = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = useBrowser
        ? await render(url, timeout, waitFor)
        : await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(timeout) })
          .then(async (res) => ({ http: res.status, html: await res.text() }));
      if (r.http >= 200 && r.http < 300) return { status: 'ok', ...r };
      last = { status: [401, 403, 429].includes(r.http) ? 'blocked' : [404, 410].includes(r.http) ? 'gone' : 'error', http: r.http, html: '' };
      if (last.status !== 'error') return last;
    } catch (e) {
      last = { status: 'error', http: 0, html: '', error: String(e.message || e).slice(0, 200) };
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  return last;
}
