# Prompt: decide and build Refine's GitHub automation

Paste everything between the two lines into an AI coding agent (for example Claude Code) opened in an empty clone of this repository. The agent first decides which automation to build, then builds, tests and pushes it. The decision this prompt produced on 7 Oct 2026 is at the bottom.

---

You are a senior growth engineer at Refine, a Paris company that helps B2B SaaS brands get recommended by AI assistants (GEO). Your job is to decide which automation to run on GitHub next to an existing n8n pipeline, then build it to production quality.

## Context

**The audit (6 Oct 2026).** folk, a Paris CRM, was audited against Attio and Pipedrive across ChatGPT, Gemini and Perplexity: 37 answers to 5 buyer prompts, every brand and cited source logged, and 37 cited third-party pages opened. Findings:
- folk appears in 7 of 30 category answers (Pipedrive in 30 of 30) and in 0 of 8 "HubSpot alternatives" answers.
- Where folk has a specific page to cite, it wins: #1 in 6 of 7 LinkedIn answers, where a folk.app page was cited every time.
- Lists set the cut-off. Dupple, the most-cited list, ranks folk #8 of 8, and every answer citing it stopped before folk. SaaS Radar ranks folk #6 of 6. folk is on 9 of 37 cited pages; Pipedrive is on 33.

The raw data is in `folk_ai_visibility_audit.xlsx`: the Answers sheet, and the Cited pages sheet with folk, Attio and Pipedrive ranks per page.

**The recommendations.** (1) Ship citable pages, starting with folk's HubSpot comparison page, which is undated, shows Premium at $50 and omits the $24 Standard plan. (2) Get onto, and up, the lists the AIs already read (Dupple, BestCRMforStartups, Rework, SaaS Radar, Zapier, Forbes Advisor). (3) Win the French answers through partners (Cognito, Implemence, independant.io, Digitiz).

**The outreach.** A 3-message LinkedIn sequence to folk's CEO quotes live facts: HubSpot Sales Pro at $90/seat plus $1,500 onboarding, HubSpot Starter at $7, folk Standard at $24 and Premium at $48, and the $50 shown on folk's comparison page.

**Already built (do not rebuild it).** An n8n pipeline that, for each prospect:
1. Designs buyer prompts with Claude.
2. Asks ChatGPT, Gemini and Perplexity through their APIs, 3 runs each.
3. Extracts brands with Claude.
4. Opens the cited pages once.
5. Scores the answers and picks hooks by rule.
6. Drafts the LinkedIn sequence into Google Sheets.

A weekly batch audits up to 35 prospects and costs about $6.70 per audit.

## Step 1: Decide

List 4 to 6 automations that could run on GitHub. Include at least:
- **A port of the n8n audit to GitHub Actions.** It is the obvious idea, so score it honestly.
- **A watcher of the sources the AIs cite.**
- **A prospect-signal feed.**
- **A check that runs inside a client's own website repository.**

Score each from 1 to 5 on these criteria:
1. Does not duplicate the n8n pipeline.
2. Moves a recommendation or the sales sequence forward this month.
3. Uses what GitHub is good at: schedules, git history as a time series, issues as alerts, pull requests as review.
4. Running cost and secrets: prefer $0 and no API keys, since the repository is public.
5. Can be shipped and verified in one session.

Pick the highest total and break ties on criterion 2. Write the decision in the README as a score table plus three sentences. If nothing scores at least 18 of 25, stop and ask before building.

## Step 2: Build the winner

**Rules for any choice:**
- **Stack:** Node 22, ES modules, as few dependencies as possible, and all settings in one JSON file in the repository root.
- **Secrets:** none in the repository. Use only the built-in `GITHUB_TOKEN`.
- **What may be stored:** the repository is public, so store facts only (names, ranks, numbers, dates, hashes). Never store page text, and never store personal data about prospects.
- **Polite web access:** an identified user agent with the repository URL, robots.txt respected, at most one request per page per run, and a headless browser only for pages that need JavaScript.
- **Tests:** `node:test` on small synthetic fixtures, plus a CI workflow on every push.
- **Calibration:** the first run must reproduce the audit. Any page where it doesn't must be fixed or explained in the README.
- **README:** what it does, why it was chosen, how it works, setup, how to reuse it for another company, its limits, and its cost.

**If the source watcher wins, it must:**
1. **Seed `watchlist.json` from the audit's Cited pages sheet.** Include:
   - the client with its aliases, and the competitors;
   - a brand dictionary, where names that are also common words ("Close", "Copper", "Apollo") must open a heading to count;
   - every page, with `type` (list, owned or facts), `priority` (named in the recommendations), `vendor`, `subject` (for "X alternatives" pages) and the audit's ranks as `baseline`.
2. **Read ranks the way a human would.**
   - Use the page's own numbering when at least half the numbered entries name a product. Numbered how-to steps are not a list.
   - Otherwise, use the order in which products first open a heading.
   - Count the publisher's own product, and never rank the page's subject.
   - Report "mentioned" when a brand appears only in the text.
3. **Check facts** with a regex on the page text against an expected value, capturing the currency symbol. For pages built with JavaScript, render in Playwright and wait for a given text, not for network idle.
4. **Compare runs.**
   - On the first run, compare the client's rank with the audit baseline.
   - After that, compare week over week:
     - client rank moves: high;
     - a competitor added to or removed from a priority page: medium;
     - list size changes: low;
     - a fact that changed: high when it is quoted in outreach;
     - a page that became blocked: low.
   - A page that fails keeps its last good snapshot.
5. **Write its outputs:**
   - `data/snapshots/<id>.json` for each page;
   - `data/history.csv`, one row per page per run;
   - `REPORT.md`, with the changes, the facts table and the lists table;
   - GitHub issues for high and medium events, deduplicated by a hidden marker, with the labels `source-watch`, `hook`, `fact-check` and `rank-change`. Put all first-run differences from the audit into one issue.
6. **Run as a workflow** every Monday at 05:00 UTC and on demand, with `contents: write` and `issues: write`. It commits only when data changed and writes the report to the run summary.

## Acceptance checks

- `npm test` passes.
- A local run reads at least 90% of the pages. Blocked pages are reported, never guessed.
- folk's rank matches the audit on:
  - Dupple B2B (#8), Dupple startups (#3), BestCRMforStartups (#11) and Rework (#11);
  - SaaS Radar (#6), Digitiz (#3), Fluid CRM (#6), Expandi (#5) and MyFeedIn (#5).
- folk reads as not listed on Zapier, ToolGrowth, TechSifted, Layer3Labs and both Cognito guides.
- Changing a fact's expected value in `watchlist.json` produces a high-severity event.

## Deliver

Push to `main` on https://github.com/psygit202/refine-automation. Then report:
- what you decided;
- what you built;
- the verification results;
- anything the owner must do by hand, such as granting a token scope or running the workflow once.

---

## Decision produced by this prompt (7 Oct 2026)

| Candidate | 1. Not a duplicate | 2. Moves the plan now | 3. GitHub fit | 4. Cost / secrets | 5. Ship in a session | Total |
|---|---|---|---|---|---|---|
| A. Port the n8n audit to GitHub Actions | 1 | 3 | 3 | 1 (4 API keys, about $6.70 per audit) | 3 | 11 |
| **B. Source watch: cited lists + facts quoted in outreach** | **5** | **5** | **5** | **5** ($0, no keys) | **4** | **24** |
| C. Prospect-signal feed (new "vs" / "alternative" pages in French SaaS sitemaps) | 4 | 3 | 4 | 5 | 4 | 20 |
| D. GEO linter in a client's website repository (dates, price tables, FAQ schema, llms.txt on every PR) | 5 | 2 | 5 | 5 | 3 | 20 |
| E. LinkedIn drafts generated from new issues | 2 | 3 | 3 | 2 | 4 | 14 |

B was built. C is the next candidate, because it feeds the n8n batch with better-timed prospects. D comes after the first client signs, because it needs access to the client's repository.
