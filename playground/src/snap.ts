import { useCallback } from 'react'

/** One multiple-choice question for Snap. `criteria` maps option key → description. */
export type ChoiceQuestion = {
  type: 'choice'
  instructions: string
  criteria: Record<string, string>
}

export type SnapAnswer = {
  choice: string
  /** Snap's probability for every option it scored (option key → 0..1). */
  probabilities: Record<string, number>
  confidence: number | null
}

export class SnapError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * Returns `askSnap(stateText, questions)` — one SubQ Snap decision call via
 * POST /api/decide (served by snap-server.ts, which adds your API key).
 * Answers whose choice is off the ballot are dropped by the server, so a
 * missing key means "unanswered".
 */
export function useSnap() {
  const askSnap = useCallback(
    async (stateText: string, questions: Record<string, ChoiceQuestion>, signal?: AbortSignal) => {
      const res = await fetch('/api/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: { text: stateText }, questions }),
        signal,
      })
      if (!res.ok) {
        let detail = `Snap request failed (${res.status})`
        try {
          const body = await res.json()
          if (typeof body?.detail === 'string') detail = body.detail
        } catch { /* keep generic message */ }
        throw new SnapError(detail, res.status)
      }
      const body = (await res.json()) as { answers: Record<string, SnapAnswer> }
      return body.answers
    },
    [],
  )

  return { askSnap }
}

/** Normalise a probability map so values sum to 1 (empty map stays empty). */
export function normalise(probs: Record<string, number>): Record<string, number> {
  const total = Object.values(probs).reduce((a, b) => a + b, 0)
  if (total <= 0) return probs
  return Object.fromEntries(Object.entries(probs).map(([k, v]) => [k, v / total]))
}
