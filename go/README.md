# Go vs SubQ Snap

A 9×9 game. See where Snap is looking before each stone lands.

A small React app that plays Go against **SubQ Snap** (`subq-snap-preview`) through the [SubQ Decisions API](https://docs.subq.ai/endpoints/decisions-api/). Before every move, Snap returns a probability for each option, and the app shows them on the board.

## Run it

You need Node.js 20.19+ (or 22.12+) and a SubQ API key from the [SubQ Console](https://console.subq.ai).

```bash
cp .env.example .env    # then paste your key after SUBQ_API_KEY=
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## How it works

Snap gets the board, captures and move history as `state` and one `choice` question whose options are every legal point plus `pass`. The gold discs show its probability for each point before the stone lands. Scoring is area scoring with 7.5 komi.

The browser never sees your API key. It sends the game state and question to `/api/decide`, a route served by the local Vite server (`snap-server.ts`). That route checks the request, adds the model name and your key, and forwards it to `https://api.subq.ai/v1/systemone`.

```
browser ──POST /api/decide──▶ snap-server.ts ──Bearer $SUBQ_API_KEY──▶ api.subq.ai/v1/systemone
```

## Where to look

- `src/go/goRules.ts`: rules (captures, ko, suicide, scoring) and the prompt Snap sees (`stateText`).
- `src/go/GoDemo.tsx`: the board and turn loop.
- `src/snap.ts`: calls `/api/decide` and runs Snap's turn (ask, show the probabilities, play).
- `snap-server.ts`: the local route that holds your key.
- `src/ui.tsx`: the shared panel, status bar and heat discs.

## Keep your key safe

- `.env` is in `.gitignore`. Don't commit it, and don't rename `SUBQ_API_KEY` to start with `VITE_`: Vite puts `VITE_` variables in the browser bundle.
- The server listens on `localhost` only. Anyone who can reach it can spend your credits, so don't expose it with `--host` on a shared network.
- `npm run build` makes static files with no `/api/decide` route. To host this, put the logic from `snap-server.ts` behind your own backend with its own sign-in and rate limits.

## License

MIT. See [LICENSE](../LICENSE).
