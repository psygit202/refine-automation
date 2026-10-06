# refine-automation: source watch

Every Monday, this repository reads the pages that ChatGPT, Gemini and Perplexity cite when buyers ask for a CRM. It records where **folk** ranks on each one, and checks that the facts quoted in folk's outreach are still true. When something moves, it opens a GitHub issue. Running it costs nothing and needs no API keys.

It was chosen with [PROMPT.md](PROMPT.md), the prompt that decides and builds this automation. It complements the n8n audit pipeline; it does not repeat it.

| | n8n audit pipeline | This repository |
|---|---|---|
| Watches | What the AI assistants **answer** | The **sources** those answers cite |
| Question it answers | Is the prospect visible? (prospecting) | Did the fixes land, and are our facts still true? (follow-up and delivery) |
| Output | Score, hooks and drafted LinkedIn messages in Google Sheets | `REPORT.md`, a weekly history, and GitHub issues |
| Cost | About $8 per audit, 4 API keys | $0, no keys |

## What it watches for folk

The watchlist is seeded from the 6 Oct 2026 audit (`watchlist.json`):
- **36 cited lists, with folk's rank on 6 Oct as the baseline.** 15 are named in the recommendations (★ in the report): Dupple (folk #8 of 8), SaaS Radar (#6 of 6), Rework (#11 of 15), BestCRMforStartups (#11 of 11), Zapier, Forbes Advisor and the HubSpot-alternative lists (folk absent), the Cognito guides, and Digitiz (#3).
- **folk's HubSpot comparison page.** The page:
  - shows folk Premium at $50, while folk's pricing page says $48;
  - shows HubSpot at its list prices ($20 and $100), while HubSpot advertises $7 and $90;
  - never mentions folk's $24 Standard plan.

  When folk fixes the page, the watcher opens an issue labelled `hook`, ready to use in a follow-up message.
- **The prices quoted in LinkedIn message 3 and the slides:** HubSpot Starter $7, Sales Pro $90 plus $1,500 onboarding, and folk Standard $24 and Premium $48.

## What you get each Monday

- **[REPORT.md](REPORT.md):**
  - the changes this week;
  - the facts quoted in outreach, each marked OK or **CHANGED**;
  - a table of every cited list: folk now vs on 6 Oct, then Attio, Pipedrive and HubSpot, the number of entries, and the page's last update.
- **`data/history.csv`:** one row per page per run, so ranks can be charted over time.
- **`data/snapshots/*.json`:** the latest reading of each page, with ranks, entry order, dates, facts and a content hash. Git history is the change log.
- **Issues:**
  - one per important change, updated rather than duplicated when the same thing moves again;
  - first-run differences from the audit grouped into a single issue;
  - labels: `hook` (something to mention in outreach), `fact-check` (update the copy), `rank-change` and `source-watch`.

## Set up

1. On the **Actions** tab, enable workflows if GitHub asks.
2. Open **Source watch**, then click **Run workflow**. The first run takes about 2 minutes. It commits `data/` and `REPORT.md`, and opens an issue only if a list now ranks folk differently from the audit.
3. After that it runs every Monday at 05:00 UTC (07:00 in Paris in summer).

The workflow declares its own permissions (`contents: write`, `issues: write`) and uses only the built-in `GITHUB_TOKEN`.

## Watch another company

Copy `watchlist.json` and edit it:

| Field | Meaning |
|---|---|
| `client` | Name and spellings (`aliases`) of the company being watched |
| `competitors` | Brands shown as columns and alerted on when added to or removed from a priority page |
| `brands` | Product dictionary for reading lists. Use `start_only: true` for names that are also common words (Close, Copper, Apollo) |
| `pages[].type` | `list` (rank brands), `owned` (the client's own page, checked with facts) or `facts` (prices and other values) |
| `pages[].priority` | Named in the recommendations: shown first, and competitor changes are alerted |
| `pages[].subject` | The brand an "X alternatives" page is about. It is never ranked |
| `pages[].baseline` | Ranks from the audit, compared on the first run |
| `pages[].facts` | `{ id, label, pattern, expected or expect: "absent", used_in }`. The pattern is a regex on the page text; group 1 is the value |
| `pages[].render`, `wait_for` | Open the page in headless Chromium and wait for this text (for pages built with JavaScript) |

## Run locally

```bash
npm ci
npx playwright install chromium
npm test
npm run watch            # or: node src/watch.mjs --only dupple-b2b,folk-pricing
```

## How ranks are read

- **Numbered lists** ("1. Attio", "11. Folk: …") are read by their numbers, so products the dictionary doesn't know still count, including the publisher's own. Numbered how-to steps don't count: at least half the entries must name a known product.
- **Otherwise**, rank is the order in which products first open a heading. Navigation, headers and footers are skipped, and so are repeat mentions in comparisons and FAQs.
- **The publisher's own product counts**, and the page's subject (HubSpot, on "HubSpot alternatives" pages) is never ranked.
- **Calibration:** a test run on 7 Oct 2026 read 36 of 39 pages. It matched the audit's folk rank on all 9 lists that rank folk: Dupple #8 and #3, BestCRMforStartups #11, Rework #11, SaaS Radar #6, Digitiz #3, Fluid CRM #6, Expandi #5 and MyFeedIn #5. folk read as absent on every list where the audit found it absent.

## Limits

- **Blocked pages:** Forbes Advisor, independant.io and Function Fox block bots (HTTP 403). They stay in the watchlist, are retried each run, and their ranks are never guessed.
- **Ranks are a heuristic.** A page redesign can change what the reader sees. That shows up as a rank change, so check the page before acting on it.
- **HubSpot shows prices by visitor location.** GitHub's US runners see USD. Run from elsewhere and the value appears in that currency and is flagged as changed.
- **Only facts are stored:** brand names, ranks, numbers, dates and hashes. No page text is kept.
- **Polite fetching:** each page is fetched once a week with an identified user agent (`refine-source-watch`), and robots.txt is respected.

## Cost

$0. GitHub Actions minutes are free on public repositories. A run takes about 2 minutes, including installing the headless browser.
