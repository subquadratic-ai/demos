# Candidate Screening POC

> **Demo only. Do not use it for real hiring decisions.** Automated screening
> of job candidates is regulated in many places (for example NYC Local Law 144
> and the EU AI Act), with bias-audit, notice, and human-oversight duties this
> demo does not meet.

Screen multiple resumes against a single job description using the subQ
**Decisions API** (`subq-snap-latest`). The model makes narrow judgments; the
app's code decides what happens next (advance / review / reject) and ranks the
candidates.

## How it works

1. You attach a **job description** (paste *or* upload, not both) and **one
   or more resumes** (PDF, DOCX, TXT, MD). Limits: 5 MB per file, 20 resumes
   per run.
2. The server extracts text from each file and sends one Decisions API request
   per candidate with the JD + resume as `state`.
3. For each candidate the model answers four questions:
   | Question | Type | What it means |
   | --- | --- | --- |
   | `advance` | noul | Yes/no gate: move to a recruiter screen? |
   | `recommendation` | choice | `strong_advance` / `advance` / `maybe` / `reject` |
   | `skills_match` | score | Weak → Partial → Strong match vs. the JD |
   | `seniority` | score | Below → At → Above the role's level |
4. Code in [`lib/screening.ts`](./lib/screening.ts) combines the answers into a
   `nextStep` and a ranking. Low-confidence or `maybe` cases are routed to a
   human for review.

The key stays server-side; see [`lib/decisions.ts`](./lib/decisions.ts) for the
thin API client (with `429`/`503` retry + backoff).

## Setup

Needs Node.js 22 or newer.

```bash
cd candidate-screening
cp .env.example .env.local   # then paste your SUBQ_API_KEY
npm install
npm run dev
```

Open http://localhost:3000. For a production build: `npm run build && npm start`.
`npm run lint` runs ESLint.

Environment variables (server-side only):

| Variable | Default | Notes |
| --- | --- | --- |
| `SUBQ_API_KEY` | (required) | `SNAP_API_KEY` or `SNAP_KEY` are read as fallbacks. |
| `SUBQ_MODEL` | `subq-snap-latest` | `SNAP_MODEL` is read as a fallback. |
| `SUBQ_BASE_URL` | `https://api.subq.ai/v1` | |

All Snap calls for one run share a 55 s budget; past that the API returns a
504 and asks you to try fewer resumes.

### Quick test data

Sample files live in [`sample-data/`](./sample-data): one job description and a
few resumes you can drag in to see a ranked result immediately.

## Tuning

Everything you'd adjust for a real pipeline is in code, not prompts:

- **Questions** — edit `SCREENING_QUESTIONS` in `lib/screening.ts`.
- **Thresholds** — `ADVANCE_THRESHOLD` / `CONFIDENCE_THRESHOLD` in the same file.
  Set these from your own labeled data.
- **Ranking** — `rankScore` in `screenCandidate`.
- **Concurrency** — `CONCURRENCY` in `app/api/screen/route.ts`.
