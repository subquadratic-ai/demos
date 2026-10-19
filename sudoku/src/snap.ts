import { useCallback, useEffect, useState } from 'react'
import { sleep } from './format'

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

/** One Snap move: the question to ask, what to do with the chosen option, and data the UI keeps with the decision. */
export type SnapTurn<M> = {
  state: string
  question: ChoiceQuestion
  meta: M
  apply: (choice: string) => void
}

export type SnapDecision<M> = { probs: Record<string, number>; choice: string; meta: M }

/**
 * Plays Snap's turn in a board game: ask, show the distribution for a beat, then apply the choice.
 * Pass a memoised `turn` (null when it isn't Snap's move); each new object is a new turn.
 * A turn with a single option is played without asking, since the Decisions API needs at least two.
 */
export function useSnapTurn<M>(turn: SnapTurn<M> | null) {
  const { askSnap } = useSnap()
  const [decision, setDecision] = useState<SnapDecision<M> | null>(null)
  const [showHeat, setShowHeat] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!turn || error) return
    const options = Object.keys(turn.question.criteria)
    if (options.length === 1) {
      const timer = setTimeout(() => turn.apply(options[0]), 400)
      return () => clearTimeout(timer)
    }
    const controller = new AbortController()
    setThinking(true)
    setDecision(null)
    ;(async () => {
      try {
        const answers = await askSnap(turn.state, { move: turn.question }, controller.signal)
        const a = answers.move
        if (!a) throw new SnapError('no legal move returned', 502)
        setDecision({ probs: normalise(a.probabilities), choice: a.choice, meta: turn.meta })
        setShowHeat(true)
        await sleep(1100)
        if (controller.signal.aborted) return
        turn.apply(a.choice)
        setShowHeat(false)
      } catch (e) {
        if (controller.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!controller.signal.aborted) setThinking(false)
      }
    })()
    return () => {
      controller.abort()
      setThinking(false)
    }
    // attempt re-runs the turn after Retry.
  }, [turn, error, attempt, askSnap])

  const retry = useCallback(() => {
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  /** Clear the last decision and any error, for a new game. */
  const reset = useCallback(() => {
    setDecision(null)
    setShowHeat(false)
    setError(null)
  }, [])

  return { decision, showHeat, thinking, error, retry, reset }
}
