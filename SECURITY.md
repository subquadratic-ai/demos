# Security

Please don't open a public issue for a security problem. Report it privately through [GitHub's private vulnerability reporting](https://github.com/subquadratic-ai/demos/security/advisories/new) for this repository.

## Your API key

- Keep `SUBQ_API_KEY` in `.env`, which git ignores. Never commit it.
- Never give it a `VITE_` prefix: Vite puts `VITE_` variables in the browser bundle.
- The dev server listens on `localhost` only. Anyone who can reach it can spend your credits, so don't run it with `--host` on a shared network.
- If a key leaks, revoke it in the [SubQ Console](https://console.subq.ai) and make a new one.
