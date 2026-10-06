// Compares this week's snapshot of a page with the last one (or with the audit baseline on the first run)
// and returns the events worth a human's attention.
const show = (r) => (r === undefined || r === null ? 'not listed' : typeof r === 'number' ? '#' + r : r === 'mentioned' ? 'mentioned, not ranked' : String(r));
const num = (r) => (typeof r === 'number' ? r : null);
// Baselines use the audit's wording: "No" = not listed, "Yes" = listed without a rank.
const fromBaseline = (v) => (v === 'No' ? undefined : v === 'Yes' ? 'mentioned' : v);

function rankEvent(page, brand, before, after, isClient, source) {
  if (String(before) === String(after)) return null;
  const b = num(before), a = num(after);
  let direction = 'changed';
  if (before === undefined && after !== undefined) direction = 'added';
  else if (before !== undefined && after === undefined) direction = 'removed';
  else if (b !== null && a !== null) direction = a < b ? 'up' : 'down';
  const good = direction === 'added' || direction === 'up';
  return {
    key: `${page.id}:rank:${brand}`,
    kind: isClient ? 'client-rank' : 'rival-rank',
    severity: isClient ? 'high' : page.priority ? 'medium' : 'low',
    page: page.id, publisher: page.publisher, url: page.url, brand, direction, source,
    before: show(before), after: show(after),
    title: `${page.publisher}: ${brand} ${show(before)} → ${show(after)}`,
    action: isClient
      ? good ? `Proof point for follow-ups: ${page.publisher} now lists ${brand} higher. Check whether AI answers that cite it change.`
        : `${brand} lost ground on a page the AIs cite. Send ${page.publisher} the update pack (pricing, AI features, a startup case study).`
      : direction === 'added' ? `${brand} was added to ${page.publisher}. Ask for a slot for the client next to it.` : '',
  };
}

export function diffPage(page, prev, snap, cfg) {
  const events = [];
  const client = cfg.client.name;
  if (snap.status !== 'ok') {
    if (prev && prev.status === 'ok') events.push({ key: `${page.id}:fetch`, kind: 'fetch', severity: 'low', page: page.id, publisher: page.publisher, url: page.url, title: `${page.publisher}: page now ${snap.status} (HTTP ${snap.http})`, before: 'ok', after: snap.status });
    return events;
  }
  if (page.type === 'list') {
    if (!prev || prev.status !== 'ok') {
      // First readable snapshot: compare the client's rank with the audit.
      if (page.baseline && client in page.baseline) {
        const e = rankEvent(page, client, fromBaseline(page.baseline[client]), snap.ranks[client], true, 'audit');
        if (e) events.push({ ...e, severity: 'medium', title: `${page.publisher}: ${client} ${e.after} (audit on ${cfg.baseline_date}: ${e.before})` });
      }
    } else {
      for (const brand of [client, ...cfg.competitors]) {
        const e = rankEvent(page, brand, prev.ranks[brand], snap.ranks[brand], brand === client, 'last run');
        if (e && (e.kind === 'client-rank' || e.direction === 'added' || e.direction === 'removed' || Math.abs((num(prev.ranks[brand]) ?? 0) - (num(snap.ranks[brand]) ?? 0)) >= 2)) events.push(e);
      }
      const added = snap.order.filter((n) => n !== '(other)' && !prev.order.includes(n));
      const removed = prev.order.filter((n) => n !== '(other)' && !snap.order.includes(n));
      if (snap.length !== prev.length || added.length || removed.length) {
        events.push({ key: `${page.id}:list`, kind: 'list-change', severity: 'low', page: page.id, publisher: page.publisher, url: page.url, title: `${page.publisher}: list ${prev.length} → ${snap.length} items` + (added.length ? `; added ${added.join(', ')}` : '') + (removed.length ? `; removed ${removed.join(', ')}` : ''), before: String(prev.length), after: String(snap.length) });
      }
    }
  }
  for (const f of snap.facts || []) {
    const old = prev && (prev.facts || []).find((x) => x.id === f.id);
    const changed = old ? old.value !== f.value : !f.ok;
    if (!changed) continue;
    events.push({
      key: `${page.id}:fact:${f.id}`, kind: 'fact-check', severity: f.used_in ? 'high' : 'medium', page: page.id, publisher: page.publisher, url: page.url,
      title: `${page.publisher}: ${f.label}: ${old ? old.value ?? 'not found' : 'expected ' + f.expected} → ${f.value ?? 'not found'}`,
      before: old ? String(old.value ?? 'not found') : String(f.expected), after: String(f.value ?? 'not found'),
      action: f.used_in ? `Update everything that quotes this fact: ${f.used_in}.` : '',
    });
  }
  if (prev && prev.status === 'ok' && snap.dates.modified && prev.dates.modified && snap.dates.modified !== prev.dates.modified && page.priority) {
    events.push({ key: `${page.id}:updated`, kind: 'page-updated', severity: 'low', page: page.id, publisher: page.publisher, url: page.url, title: `${page.publisher}: page updated ${prev.dates.modified} → ${snap.dates.modified}`, before: prev.dates.modified, after: snap.dates.modified });
  }
  return events;
}
