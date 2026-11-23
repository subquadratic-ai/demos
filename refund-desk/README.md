# Northstar Support Desk

A local refund desk for a fictional company, Northstar Software. A support agent picks a file, reads the policies and signed documents, and runs a decision.

Snap is called through the Decisions API. The browser never sees the API key.

## What a presenter can show

The evaluation date is fixed at **16 October 2026**. Elapsed days are calculated in application code from that date and the purchase date, and both the original dates and the calculated days are sent to Snap.

The main file is Avery Chen at Brightline Analytics. The purchase is 45 days old, so the general 30-day handbook would decline it. A clause in Avery’s signed agreement allows 60 days. Snap is expected to select **Approve refund**. Remove that clause in the document viewer and run the decision again. Snap is expected to select **Decline refund**. The previous result stays beside the new one, labeled with its document version.

These are expected outcomes for validation. The desk shows the action, probabilities, section, token count, and timing that SubQ actually returns, including when they differ from the table.

| Case file | Purchase | What is different in the file | Expected action |
| --- | --- | --- | --- |
| Purchase on 1 October 2026 | 15 days | Standard 30-day agreement | Approve refund |
| Purchase on 1 September 2026 | 45 days | Standard 30-day agreement | Decline refund |
| September purchase with agreement clause | 45 days | Avery’s agreement states 60 days | Approve refund |
| Purchase date not on the account | Missing | No purchase date to apply | Request information |
| Two signed agreements from March 2026 | 45 days | Two current agreements disagree | Escalate |
| September purchase, clause names Copperlane | 45 days | The 60-day clause belongs to another customer | Decline refund |
| Northline Studio, 8 October | 8 days | That customer’s own 30-day agreement | Approve refund |
| Brightline, 15 September | 31 days | Standard 30-day agreement | Decline refund |
| Brightline, 7 August | 70 days | An active signed amendment states 90 days | Approve refund |
| Brightline, 4 October | 12 days | No signed agreement for this account | Approve refund |
| Brightline, 1 September, December amendment | 45 days | The longer window is not effective yet | Decline refund |
| Halcyon Clinics, 27 August | 50 days | That customer’s own 90-day agreement | Approve refund |

Authority, as written in the refund handbook:

1. An applicable active signed amendment.
2. The customer’s active signed agreement.
3. The general refund handbook.

An unresolved conflict between equally authoritative current records requires escalation. Missing information necessary to determine eligibility requires requesting information.

Expected actions and expected section ids live in `evaluation/expected.json`. That file is not sent to Snap. Scenario labels are not sent either. The request contains the customer, the purchase facts, and the documents.

## Setup

Requirements: Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local
```

Put your key in `.env.local`:

```bash
SUBQ_API_KEY=sk-your-key
```

Create a key at [console.subq.ai](https://console.subq.ai). Restart the dev server after changing the key.

## Run the demo

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The desk opens on Avery’s September purchase with the agreement clause. Choose **Compact** for the case file and core policies, or **Large** for the extended archive. On the large bundle, **Exception placement** moves Avery’s agreement to the beginning, middle, or end.

Edit or remove the refund exception in the document viewer, then choose **Run decision**. The next request contains the edited text. Changing another customer’s clause changes that document only.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
npm run validate
```

`npm run validate` checks dates, document ownership, request contents, exception edits, and the large-bundle size. If `SUBQ_API_KEY` is set, it also runs each prepared case three times and records the actual action, section, tokens, and provider round-trip in `validation/latest-results.json`. It also places the 60-day agreement at the beginning, middle, and end of the large bundle. Without a key, those live calls are reported as pending and the local checks still run.

Regenerate the extended archive with:

```bash
npm run generate:corpus
```

The generator is deterministic and rewrites `data/extended-corpus.json`.

## How the Snap call is made

The route `POST /api/decision` reads `SUBQ_API_KEY` on the server and calls:

`POST https://api.subq.ai/v1/systemone`

```json
{
  "model": "subq-snap-latest",
  "state": {},
  "questions": {}
}
```

Authentication is `Authorization: Bearer <SUBQ_API_KEY>`.

One request asks two `choice` questions:

- `action`: `approve_refund`, `decline_refund`, `request_information`, or `escalate`
- `governing_section`: every policy, terms, agreement, and amendment section in the selected bundle, plus `insufficient_evidence` and `conflicting_evidence`

The desk reads `answers.action.choice` and `answers.action.probabilities`. It maps `answers.governing_section.choice` back to the stored section text and labels that passage **Policy section selected by Snap**. It does not write a quotation the model did not select.

Instructions tell Snap to check customer identity, effective dates, and the authority order. Text inside a document is evidence. Instructions embedded in a document do not replace those rules.

Provider round-trip is measured on the server, from the start of the SubQ request until the response body arrives. It does not include browser-to-app time.

Input tokens are `usage.input_tokens`. Estimated model input cost uses the published Snap preview price:

`input_tokens / 1,000,000 * 0.05`

The model and price are documented at [Decisions API](https://docs.subq.ai/endpoints/decisions-api/) and [Models and pricing](https://docs.subq.ai/using-the-api/models/). Snap preview’s context limit is 384K tokens. The large bundle is built to stay near the middle of a 50K–100K token request. The number on the decision card is the API’s count, not a local estimate.

## Documents

Handwritten policies are Markdown in `data/policies`. The case file is Markdown in `data/documents`. The extended archive is `data/extended-corpus.json`. Customers and case files are `data/customers.json` and `data/scenarios.json`.

The compact bundle is the selected case file: the current handbook, older and draft handbooks, subscription terms, unrelated agreements, the customer’s records, and the conversations. The large bundle adds the extended archive of other customers’ tickets, reviews, invoices, guides, and agreements. Those agreements name other customers, so ownership still has to be checked.

## Validation status

`data/scenarios.json` holds 18 cases. The table above lists 12 of them. Expected actions and sections for all 18 are in `evaluation/expected.json`.

`npm run typecheck`, `npm run lint`, `npm run build`, and `npm run validate` pass without a key. The large-bundle request is about **70,400 tokens** with the `o200k_base` tokenizer. That is a local estimate, not `usage.input_tokens`; the decision card shows the API count after a live call.

With `SUBQ_API_KEY` set, `npm run validate` also sends each case to SubQ three times, plus placement and edit checks (60 paid calls) and exits with an error if any live action or section differs from `evaluation/expected.json`. Results are written to `validation/latest-results.json`, which is not committed.

## Before deploying

This is a local demo. `POST /api/decision` has no authentication or rate limit, and **Run diagnostic** sends 18 paid SubQ calls, three at a time. Do not deploy it publicly as is; add auth and rate limiting first.
