# SubQ Demos

Small, self-contained apps built on **SubQ Snap** (`subq-snap-preview`) and the [SubQ Decisions API](https://docs.subq.ai/endpoints/decisions-api/). Three play a game against Snap; the playground asks Snap about your own documents. Every one shows the probability Snap puts on each option.

| Demo | What you'll see |
| --- | --- |
| [Chess](chess/) | Play a full game. Before every reply, Snap puts a probability on each legal move and shows you all of them. |
| [Go](go/) | A 9×9 game. See where Snap is looking before each stone lands. |
| [Sudoku](sudoku/) | Snap fills a cell only when it’s sure. Watch it solve, or race it. |
| [Playground](playground/) | Add a document, ask multiple-choice questions about it, and see the probability Snap gives every answer. Includes candidate screening, lead qualification and ticket triage examples. |

## Quick start

You need Node.js 20.19+ (or 22.12+) and a SubQ API key from the [SubQ Console](https://console.subq.ai).

```bash
git clone https://github.com/subquadratic-ai/demos.git
cd demos/chess            # or go, sudoku, playground
cp .env.example .env      # then paste your key after SUBQ_API_KEY=
npm install
npm run dev
```

Each folder stands alone: copy just the one you want and it runs.

## How the demos are built

Every demo is a Vite + React app with the same shape:

- **The app runs in the browser.** Rules, the board and the prompt Snap sees all live in `src/<game>/` (the playground's examples live in `src/playground/presets.ts`).
- **Your API key stays on your machine.** The browser calls `/api/decide`, a route served by the local Vite server (`snap-server.ts`). It checks the request, adds your key and forwards it to the Decisions API. The key is never sent to the browser or put in the build.
- **One question per decision.** Each move is a `choice` question whose options are the legal moves. Snap answers with a choice plus a probability for every option, which the app draws on the board. The playground sends up to 16 of your own questions in one request.

## Adding a demo

Copy an existing folder, replace `src/<game>/` with your game, and point `src/App.tsx` at it. `src/snap.ts` (`useSnapTurn`) handles asking Snap, showing its probabilities and playing its choice.

## Security

The local server only accepts same-origin JSON requests from the page and listens on `localhost`. Please report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
