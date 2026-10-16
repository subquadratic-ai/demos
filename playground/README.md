# SubQ Snap Playground

Add a document, ask multiple-choice questions about it, and see the probability Snap gives every answer.

A small React app for trying **SubQ Snap** (`subq-snap-preview`) on your own text through the [SubQ Decisions API](https://docs.subq.ai/endpoints/decisions-api/). Paste a résumé, a sales lead, a support ticket or anything else, write a few questions, and Snap answers them all in one call.

## Run it

You need Node.js 20.19+ (or 22.12+) and a SubQ API key from the [SubQ Console](https://console.subq.ai).

```bash
cp .env.example .env    # then paste your key after SUBQ_API_KEY=
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Using it

1. **Add a document.** Paste text, drop a file, or click Attach file. Text, Markdown, CSV and JSON files are read in the browser. For PDF or Word, copy the text and paste it in.
2. **Ask questions.** Each question is multiple choice: type an option and press Enter to add it. Up to 16 questions per run.
3. **Ask Snap** (or ⌘↵). Each question card shows Snap's pick and the probability it gave every option.

Not sure what to ask? **Try an example** loads one of three ready-made setups (with documents starring the staff of Dunder Mifflin):

| Example | Document | Questions |
| --- | --- | --- |
| Screen a candidate | Dwight Schrute's résumé for Assistant Regional Manager | Level, fit for the role, next step |
| Qualify a lead | Ryan Howard's demo request for Dunder Mifflin Infinity | Ideal-customer fit, buying stage, priority |
| Triage a ticket | Bob Vance, charged twice and locked out | Queue, urgency, sentiment |

**Custom** starts from a blank document.

## How it works

Your document becomes the request's `state.text`, and each question becomes a `choice` question. Its options are the chips you typed, keyed by a lowercase version of each label. All questions go in one request:

```json
{
  "model": "subq-snap-preview",
  "state": { "text": "From: bob.vance@… Subject: URGENT — charged twice…" },
  "questions": {
    "q1": {
      "type": "choice",
      "instructions": "Which queue should this ticket go to?",
      "criteria": { "billing": "Charges, refunds, invoices, plans", "bug": "Something in the product is broken" }
    }
  }
}
```

The browser never sees your API key. It sends the request to `/api/decide`, a route served by the local Vite server (`snap-server.ts`). That route checks the request, adds the model name and your key, and forwards it to `https://api.subq.ai/v1/systemone`.

```
browser ──POST /api/decide──▶ snap-server.ts ──Bearer $SUBQ_API_KEY──▶ api.subq.ai/v1/systemone
```

## Where to look

- `src/playground/presets.ts`: the examples, plus how drafts become Decisions API questions (`buildQuestions`).
- `src/playground/PlaygroundDemo.tsx`: the document box, question cards and results.
- `src/snap.ts`: calls `/api/decide`.
- `snap-server.ts`: the local route that holds your key.

## Keep your key safe

- `.env` is in `.gitignore`. Don't commit it, and don't rename `SUBQ_API_KEY` to start with `VITE_`: Vite puts `VITE_` variables in the browser bundle.
- The server listens on `localhost` only. Anyone who can reach it can spend your credits, so don't expose it with `--host` on a shared network.
- `npm run build` makes static files with no `/api/decide` route. To host this, put the logic from `snap-server.ts` behind your own backend with its own sign-in and rate limits.

## License

MIT. See [LICENSE](../LICENSE).
