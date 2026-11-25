# Policy Contradiction Check

A launch demo for **SubQ Snap**, a long-context decision model. Ask whether a claim, such as "Guaranteed 5% return", is within policy. Snap reads the whole 380-page rulebook, about 212K tokens, in one request, names the clauses the claim contradicts, then judges it against each of them. The answer comes back in about 3 seconds, under the claim: the clause it breaks, quoted from the policy, and how many pages and tokens Snap read and how long it took.

Snap never generates text. It takes a `state` and a set of typed questions and returns typed answers with probabilities:

| Type | Returns | Used for |
| --- | --- | --- |
| `choice` | a probability per option, the top option, a confidence | which clause of the whole document the item contradicts; which passage of the item and of the clause the judgement turns on |
| `noul` | one probability that the answer is yes | does this clause apply to the item; does the item comply with it |
| `score` | a probability per ordered level and a weighted score | severity: low, medium, high |

A check is two rounds. First, one request carries the entire document as its state: every chapter heading and every clause's full section, in order, with the item at the end. It asks two questions only, a Choice over `none` and all 109 clauses ("which clause does the item contradict most clearly?") and a Choice over the item's own passages. Then each clause the read points at is judged on its own, in parallel, one small request per clause: the two nouls, the severity score, and the two evidence choices. The verdict is arithmetic over those probabilities, computed in code. No verdict is ever shown without its clause.

## Run it

```bash
npm install
cp .env.example .env.local    # then set SNAP_API_KEY
npm run dev
```

Open http://localhost:3000. Every decision comes from the live Snap API, so the key is required. It is only read on the server; the browser talks to `/api/*`, never to SubQ directly.

**Run it locally; do not deploy it publicly as-is.** `/api/screen` and the upload route (`/api/rulebook`) have no authentication and no rate limit, and each check sends the whole document to Snap on your key, about 212K input tokens a time. Anyone who can reach the server can spend your tokens. Put it behind auth and a rate limit before exposing it.

The page has one flow and asks one question: **Is this in policy?** The page carries no product branding. The left column holds the policy's name and how heavy it is, in three big numbers (pages, words, tokens), level with the check beside it. On the right is the card, which asks "Is this claim within our policy?" in large type and opens on the claim "Guaranteed 5% return"; type over it to check anything else. Under it is the book itself, one tile per page. Pointing at a page opens a thumbnail beside it: its clause, how many words that clause runs to, and the page drawn as grey lines as dense as its text. Clicking pins it and shows the clause's rule in one sentence.

On Check a navy frame draws around the card and the same page grid scans while Snap reads the whole policy; the frame's tab says what is going in ("380 pages · 1 request") and its stopwatch runs. When the answer arrives, the pages of every clause the claim contradicts, or that a person should decide, light up at once and the rest of the book fades, with the page range on the first one or two. A moment later the grid gives way to the answer, joined to the card by a dotted line: one large word (**Yes**, **No** or **Unclear**) and the clause it rests on ("It breaks clause 3.3 and 2 more"). Below it, the clause itself, quoted word for word from the policy with Snap's pick marked, its pages, and "Read the whole section" for the procedures and examples that follow the rule. Then the numbers: pages read, clauses compared, requests, tokens (about 214K, the whole document) and seconds to decide. Changing the words brings the book back.

- **No** (flagged): compliance at 0.15 or below, and Snap at least 0.85 sure the clause applies.
- **Yes** (cleared): compliance at 0.90 or above.
- **Unclear** (needs a human): anything in between, or a read that names no clause. The result says which.

There are five samples, used by `npm run check-samples` and by the field's opening claim: "Guaranteed 5% return" (should flag at 3.3), an ad that calls a variable rate "guaranteed" (flags at 3.3), a real security alert email (clears at 6.5), three $9,900 payments to one vendor on one day (flags at 9.12), and an "up to 3% cashback" ad with its cap on a later screen (needs a human, at 4.5). Only the first appears on the page. Typing any sample's exact words reuses its result if it was already checked. See [Samples](#samples).

Other scripts:

```bash
npm test                    # offline tests only; no key or network needed (see Tests below)
npm run test:live           # the live tests against the Snap API; uses your key, about 860K input tokens a run
npm run typecheck
npm run lint
npm run index -- <document> --usecase <id>   # index a policy into usecases/<id>/rulebook.json
npm run check-samples       # screen the use case's samples live; fails if one misses its group
npm run generate:marketing  # regenerate the synthetic marketing rulebook (deterministic)
```

The demo ships one use case, marketing and communications. To run your own, see [Bring your own use case](#bring-your-own-use-case).

## The Snap API

Every decision comes from the live API through `HttpSnapClient` (`lib/snap/http.ts`), configured in `.env.local`:

```ini
SNAP_API_KEY=sk-...
SNAP_API_URL=https://api.subq.ai/v1/systemone
SNAP_MODEL=subq-snap-latest
```

The frame's stopwatch runs while the page waits on Snap, then shows **Decided in**, as the result does: every choice on the way down plus the judgement at the clause, timed on the server around each Snap request (retry waits excluded). Once the answer is in, the pill also shows the tokens the check used. The result line gives them exactly: tokens read, tokens generated (always 0, since Snap answers with probabilities, not text) and the number of Snap requests.

What `HttpSnapClient` sends for the whole-document read (state trimmed; the real one is 1.08M characters):

```json
{
  "model": "subq-snap-latest",
  "state": "## RULEBOOK Marketing & Communications Policy (Sublinear Financial), 380 pages\n\n## CHAPTER 1 Scope, Definitions and Governance\n\n### CLAUSE 1.1 Purpose and scope (pp. 6-8)\nThis policy applies to every communication … \n\n… 109 clauses, every word of each section …\n\n## ITEM i00 it-036\nkind: ad\nSublinear Save: guaranteed 5.2% returns, whatever the market does. …",
  "questions": {
    "i00.contradicts": { "type": "choice", "instructions": "Which clause of the RULEBOOK does item i00 contradict most clearly? Pick none if it contradicts no clause.", "criteria": { "none": "It contradicts no clause.", "1.1": "Clause 1.1: Purpose and scope", "3.3": "Clause 3.3: Guarantees and certainty language", "…": "… one option per clause, 109 in all" } },
    "i00.evidence.item": { "type": "choice", "instructions": "Which part of item i00 conflicts most with the RULEBOOK? …", "criteria": { "s1": "Sublinear Save: guaranteed 5.2% returns, whatever the market does.", "s2": "Open in four minutes, no minimum balance, withdraw whenever you like." } }
  }
}
```

And what came back from the live model (probabilities trimmed):

```json
{
  "answers": {
    "i00.contradicts": { "type": "choice", "choice": "3.3", "probabilities": { "3.3": 0.874, "3.4": 0.035, "5.1": 0.022, "1.1": 0.006, "none": 0.005 } },
    "i00.evidence.item": { "type": "choice", "choice": "s1", "probabilities": { "s1": 0.977, "s2": 0.023 } }
  },
  "usage": { "input_tokens": 212214 }
}
```

### What a check costs

Measured on the live API in October 2026, four of the five samples (all but the opening claim, it-005) each checked on its own, one after another:

| Sample | Read | Judges | Time to decide | Requests | Input tokens |
| --- | --- | --- | --- | --- | --- |
| it-036, flagged at 3.3 (also 3.4, 5.1) | 2.73 s | 0.48 s | 3.20 s | 4 | 215K |
| it-068, cleared at 6.5 | 2.35 s | 0.28 s | 2.62 s | 2 | 213K |
| it-287, flagged at 9.12 (also 9.2) | 2.38 s | 0.50 s | 2.88 s | 3 | 214K |
| it-251, needs a human at 4.5 | 2.28 s | 0.28 s | 2.55 s | 2 | 213K |

An earlier run of the same reads took 1.1 to 2.4 seconds. The read is about 212K input tokens; each judge adds 0.8K to 1K. Snap answers with probabilities, so output tokens stay at a handful. Time to decide is the read plus the slowest judge, since the judges run side by side.

The read's latency is driven by how many questions it carries, not by the size of the context: the same 212K-token state took 9.4 to 10.9 seconds with 109 nouls (one per clause) and 1.4 to 2.6 seconds with one Choice over all 109 clauses. That is why the read asks two questions per item and leaves the detailed judgement to the small requests. Staging is spiky: a first request occasionally takes 20 to 45 seconds.

The rulebook title and any reviewer corrections form a *session state* that is prepended to every judge request; the read carries the corrections after the document. The place to swap in a server-side session handle, once the API exposes one, is marked with a `TODO` in `lib/snap/http.ts`.

### Setting `SNAP_CONTEXT_TOKENS`

`SNAP_CONTEXT_TOKENS` is Snap's context window (default 262,144). Before the read, `lib/snap/scan.ts` estimates the request at 1.3 tokens per word (measured: 1.20 on the sample) and reads the whole document only when that estimate stays 8K under the window and the document has at most 254 clauses (a Choice offers 255 options, `none` included). The sample estimates at about 230K against a limit of 254K. A document over the limit is refused with a message that says how big it is and how much one request can read (`TooBigError`, a 413 from `/api/screen`). The upload pre-flight still estimates ~650 tokens per page and notes when a document exceeds 80% of the window. Set the variable to the real window size from the model spec.

## Bring your own use case

Everything specific to the marketing demo lives in `usecases/marketing/`. The engine, the questions, the verdict rule and the page are shared by every use case. A use case is one folder:

```
usecases/<id>/
  index.ts        what changes with the domain: item kinds, the field's placeholder, severity wording
  rulebook.json   your policy as chapters and clauses, each clause with its full text and pages
  samples.json    the items in the picker
```

1. **Index your policy.** This reads the document with the same pipeline as the upload, builds the tree, and writes `usecases/hr/rulebook.json` with a starter `index.ts` and an empty `samples.json`:

   ```bash
   npm run index -- path/to/policy.pdf --usecase hr --organisation "Acme Ltd"
   ```

   PDF with a text layer, Word or Markdown. Snap classifies the headings. Check that the chapter and clause counts it prints look right.

2. **Describe it** in `usecases/hr/index.ts`, and register it in `usecases/index.ts`:

   ```ts
   const hr: UseCase = {
     id: "hr",
     kinds: [
       { kind: "claim", label: "expense claim", looksLike: /\bEXP\b|\$\d/i },
       { kind: "note" }, // the last kind is the fallback for typed text
     ],
     question: "Is this claim within our expense policy?",
     placeholder: "Paste an expense claim or a note.",
     severity: {
       // optional; neutral wording when omitted
       audience: "the company",
       levels: { low: "paperwork", medium: "needs fixing before payment", high: "must not be paid" },
     },
   };
   ```

3. **Add samples** to `usecases/hr/samples.json`, each `{ id, kind, source, text, group, hook, clause? }`. `group` is the verdict you expect (`flags`, `clears` or `review`), `hook` says why, and the optional `clause` is the clause it was written against; none of them is shown on the page. Then check them against the live model:

   ```bash
   npm run check-samples -- --usecase hr
   ```

   It exits non-zero for any sample whose live verdict misses its group. Reword that sample or move it to the group it earned.

4. **Run it.** Set `USE_CASE=hr` in `.env.local` and restart `npm run dev`.

`npm test` holds every registered use case to the same offline contract: a rulebook whose clauses carry text, and samples of its own kinds with a group each. A new folder needs no tests of its own. Whether each sample still earns its group is a question for the live model, which is what `npm run check-samples` asks.

## Samples

`usecases/marketing/samples.json` holds five items: id, kind, source, text, the group it was picked for (flags, clears or review), a one-line note on why and the clause it was written against. The first one's text opens in the field; the rest are for maintainers and never appear on the page.

```bash
npm run check-samples
```

This screens every sample against the live API with your `.env.local` key and exits non-zero if any sample's verdict no longer matches its group. Pass ids to check only those samples: `npm run check-samples -- it-036 it-251`. Run it after changing samples, questions or the rulebook; it writes nothing.

To add a sample, append it to `samples.json` and run the check. The samples were picked from a larger seeded set by running it live and keeping the items whose verdict matched what they were written to show. Of 30 seeded violations, the model located 26 at the intended clause. It flagged 15 outright. Most of the rest it sent to a human because it was less than 0.85 sure the clause applied. That is the threshold doing its job, but it makes a poor sample. Twenty-four items made the cut; four of them are kept here, next to the one-line opening claim (it-005). Samples close to a threshold are fragile: renaming the invented company from Corvid to Sublinear once moved two of the 24 across a line by less than 0.02, and a clearer wording fixed both.

Text you write yourself goes to the model the same way.

## Rulebooks

### The sample

One invented rulebook ships pre-indexed, as `usecases/marketing/rulebook.json`:

| Id | Title | Pages | Clauses |
| --- | --- | --- | --- |
| `marketing-policy` | Marketing & Communications Policy | 380 | 109 |

It belongs to "Sublinear Financial", an invented company. The structure mirrors real policy manuals; the text does not. The 109 clauses are hand-written in `usecases/marketing/source/clauses.ts` against the outline in `source/outline.ts`. The procedures, guidance and examples around each clause are expanded deterministically by `source/generate.ts` (`npm run generate:marketing`) to reach the page count: about 176K words, or 212K tokens as the live API counts them. A use case built from a real document needs none of this. The whole-document read sees every word; each judge reads the clause itself, the opening paragraph of each section, and that is also the text quoted beside every verdict.

### Your own rulebook

The page no longer offers an upload, but the API still does: `/api/rulebook` accepts PDF (with a text layer), DOCX and Markdown up to 50 MB. Text is extracted on the server, never in the browser tab, and nothing touches disk. The document lives in server memory for two hours or until it is deleted, whichever comes first. The upload streams progress as NDJSON (upload, extract, pre-flight), then hands off to a background index job polled at `/api/rulebook/jobs`. `uploadRulebook` and `pollIndexJob` in `lib/client/api.ts` call both.

An upload has to become chapters and clauses before it can be read, because the read chooses between clauses and the page lights up their pages. With `PAGEINDEX_API_URL` set, a [PageIndex](https://github.com/VectifyAI/PageIndex) service builds that tree; expect two to five minutes for 250–300 pages. Without it, Snap builds the tree itself. Candidate heading lines are classified in batches of 50 (`noul is_heading`, `score level`), and the accepted headings become the tree. Snap judges each line on its own and is lukewarm on short ones ("7 Pricing" scores about 0.4), so a numbered line that continues the outline ("7" after "6", "6.1" after "6") is accepted from 0.3; any other line needs 0.5. Each clause's summary is its first sentence, and each chapter's is its preamble or the list of its clause titles. No text is generated.

To make a document a use case's rulebook rather than a two-hour upload, use `npm run index` (see [Bring your own use case](#bring-your-own-use-case)). See [`scripts/build-tree.md`](scripts/build-tree.md) for running PageIndex against a real document and the tree shape this app expects (`TreeNode` in `lib/types.ts`; leaves must carry `text`).

## Decision design

All questions are in `lib/snap/questions.ts`; the engine is `lib/snap/scan.ts`; the verdict rules are in `lib/verdict.ts`.

- **Read the whole document.** One request, state = `documentBlock(rulebook)` (every chapter and clause heading, every clause's full section, in order) plus the item. Two questions per item: `contradicts`, a Choice over `none` and every clause (`Clause 3.3: Guarantees and certainty language`), and `evidence.item`, a Choice over the item's passages.
- **Pick the clauses to judge** (`pickCandidates`). The read's top clause always, even when `none` wins, so a clean item is still shown against the clause that governs it. Then runners-up, most likely first, while the read put at least `MIN_FOUND` (0.02) on them and more than on `none`, up to `MAX_CANDIDATES` (3). A clause a reviewer has ruled on for this item is always judged. Live, the two clear breaches put 0.005 and 0.013 on `none` and 0.02 to 0.07 on neighbouring clauses that the judge flags too (3.4 and 5.1 for the "guaranteed" ad, 9.2 for the split payments). The clean alert put 0.78 on `none` and the borderline cashback ad 0.46, so only their top clause is judged. Without the `none` gate the cashback ad would also be judged against 5.5 (credit warnings, read at 0.055), which Snap's judge flags, and it would come back flagged instead of going to a human.
- **Judge each clause on its own.** `noul applies_to_item`, `noul item_complies`, `score severity` over `[low, medium, high]`, against that clause alone. Never "is this compliant with the policy" in one shot. One request per candidate, all at once, with a session state that names the rulebook and carries any corrections.
- **Evidence, in the same request.** Two `choice` questions: which part of the item bears most directly on the clause, and which rule in the clause the item meets or breaks. Their options are the item's sentences, lines and parenthesised asides, and the clause's phrases, cut by `lib/snap/segments.ts` so each is an exact substring of the text the page shows. A side with one segment is not asked, and neither is evidence on a clause with a reviewer correction: live, the extra choices pulled the reviewer-cleared cashback ad from 0.91 to 0.89 complies, so a re-check is asked exactly as before and the page keeps the earlier marks. A pick is kept only when Snap puts at least `EVIDENCE_FLOOR` (0.35, `lib/snap/judge.ts`) on it. When the top clause's judge has no item pick to show, the read's own `evidence.item` pick fills in.
- **Verdict per finding, in code** (`findingVerdict`). Clear if `complies ≥ 0.90`. Flag if `complies ≤ 0.15` and `applies ≥ 0.85`. A clause Snap is less than 0.85 sure applies goes to a human only when the item looks broken under it (`complies ≤ 0.15`); otherwise it counts as cleared, because a clause that may not govern the item, and is not clearly broken, is no contradiction. Live, the clean alert's runner-up 6.10 came back applies 0.26 and complies 0.93. The numbers are `DEFAULT_THRESHOLDS` in `lib/types.ts`.
- **The answer** (`overallVerdict`). Flagged if any finding is, else needs a human if any finding does, else cleared. Findings are ordered most serious first, then by the read's probability, so `findings[0]`, which the result's clause mirrors, always carries the answer. Verdicts are derived, never stored, so changing a threshold recolours every result.
- **Corrections.** The page no longer offers a reviewer override, but `/api/screen` still takes `corrections`. A correction adds a decision that quotes the item to the clause's state, and the item is checked again. The clause is always judged on the re-check, and for that clause only, the applies and complies questions say how to read the decision. Live runs showed both parts are needed: with a terse note and no instruction, "mark cleared" could come back flagged. Live on the whole-document engine, flagging the cleared alert at 6.5 came back flagged (complies 0.03); clearing the cashback ad at 4.5 moved complies from 0.29 to 0.87, just under the clear line.

## Where things live

```
lib/types.ts              every shared type: TreeNode, Rulebook, Sample, Thresholds, ScreenResult, API payloads
lib/config.ts             the only place env vars are read
lib/verdict.ts            each finding's verdict and the answer, from probabilities + thresholds
lib/usecase.ts            the UseCase type: what a domain supplies, and what the page receives
lib/items.ts              item kinds, and guessing one for pasted text
lib/rulebook/tree.ts      pure helpers over the clause tree, incl. clauseOf()
lib/rulebook/extract.ts   PDF / DOCX / Markdown → pages of text (server only)
lib/rulebook/preflight.ts token estimate, warnings, heading count
lib/pageindex/build.ts    tree building: PageIndex service if configured, else Snap-classified headings
lib/snap/types.ts         wire types and the SnapClient interface
lib/snap/questions.ts     every question the app asks, and the whole-document state. The decision design.
lib/snap/segments.ts      cuts an item or a clause into the exact passages the evidence choices pick from
lib/snap/scan.ts          the engine: the whole-document read, then a judge per clause it points at
lib/snap/judge.ts         reading a judge's answers: severity, evidence picks, the session it rides on
lib/snap/http.ts          HttpSnapClient: bearer auth, retries (429/5xx, and once on a timeout or network error), session state
lib/snap/client.ts        getSnapClient(): the live HttpSnapClient, configured from .env.local
lib/server/               in-memory rulebook store, index jobs, first-render data, /api/screen request checks
app/layout.tsx            fonts, self-hosted from the @fontsource packages, so the build fetches nothing from Google Fonts
app/page.tsx              loads the use case's rulebook, samples and copy on the server; no client bootstrap
app/api/                  screen, rulebook upload / fetch / delete, index-job polling
lib/client/               store, the item field, screening, the found beat before the result, what a result comes to
components/Sidebar.tsx    the headline and the policy's pages, words and tokens
components/stage/         the item card, the page card, the scan and the result under the card
components/check/         the scan frame, the page grid, the connector and the highlighted phrase
usecases/index.ts         the registry, USE_CASE lookup and data-file paths
usecases/marketing/       the shipped use case: definition, rulebook, samples, generator
scripts/                  index-rulebook.ts, check-samples.ts, build-tree.md
tests/                    vitest; tests/live calls the Snap API
```

## Tests

```bash
npm test             # offline: no key, no network
npm run test:live    # tests/live, against the Snap API with the key in .env.local
```

There are no mocks, fakes or recorded answers. Everything that involves the model is in `tests/live` and runs against the live Snap API with the key in `.env.local`, exactly as the app does. `npm test` leaves those out, so it passes with no key. The whole-document live tests read the 212K-token book four times, so `npm run test:live` costs about 860K input tokens.

- `tests/live/snap-api.test.ts`: the three question types, usage and timing in one request; a bad key (401) and a malformed question (422) come back with the API's own message.
- `tests/live/scan.test.ts`: the whole-document engine. The "guaranteed" ad is flagged at 3.3 after a read of more than 150K tokens, with evidence on both sides, each found verbatim in the item and the clause. The security alert clears at 6.5 with no other clause judged. A reviewer who flags the alert gets a flag back; one who clears the cashback ad moves its compliance from about 0.29 to above 0.8. A 50K context window is refused before any request is sent.
- `tests/live/indexer.test.ts`: a numbered document indexed into the expected chapters and clauses, a flat numbered outline that keeps every heading, and prose with no headings falling back to page groups.

The rest are plain functions with real inputs and no network: the whole-document state (every clause, in order, uncut), the read request, the context-window check, the candidate rule and finding order on the live read probabilities, the verdict rules, the question builders, the evidence segmenter, tree helpers, text extraction, pre-flight, the item field, the `/api/screen` request checks, and the use-case contract.

What a live suite cannot pin down: the client's retry on a 429 or 5xx, which runs whenever the API asks for it, and its single retry after a timeout or network error (one second later; then `/api/screen` answers 504 for a timeout, 502 for anything else upstream). `npm run check-samples` is the long live run: every sample of the use case, one whole-document read each, about 1.07M input tokens for the five marketing samples (about 214K each). It prints each sample's findings, read and judge times and tokens.

## Rules the app keeps

- Snap only answers `choice`, `noul` and `score`. All verdicts are computed in code from thresholds, never asked of the model.
- No flag without its clause: every contradiction names the clause and its pages, with the words Snap picked from it quoted exactly.
- Uploads never touch disk.
- No real companies, people or regulation text in the shipped use case.
