import { useCallback, useEffect, useRef, useState } from 'react'
import { useSnap, type ChoiceQuestion } from '../snap'
import { DemoLayout, PanelHeading, Segmented, StatusLine, TextButton } from '../ui'
import { cellName, cellQuestion, clashes, colOf, makePuzzle, rowOf, stateText, type Mistake } from './sudokuRules'

type Owner = 'given' | 'snap' | 'you' | null
const MAX_QUESTIONS = 16
const LEVELS = [
  { id: 'easy', label: 'Easy', clues: 40 },
  { id: 'medium', label: 'Medium', clues: 32 },
  { id: 'hard', label: 'Hard', clues: 26 },
] as const
type Level = (typeof LEVELS)[number]['id']

function newState(level: Level) {
  const clues = LEVELS.find((l) => l.id === level)!.clues
  const { puzzle, solution } = makePuzzle(Math.floor(Math.random() * 2 ** 31), clues)
  return {
    solution,
    grid: puzzle.slice(),
    owner: puzzle.map((d): Owner => (d ? 'given' : null)),
  }
}

export default function SudokuDemo() {
  const { askSnap } = useSnap()
  const [level, setLevel] = useState<Level>('easy')
  const [{ solution, grid, owner }, setBoard] = useState(() => newState('easy'))
  const [log, setLog] = useState<Mistake[]>([])
  const [round, setRound] = useState(0)
  const [lastPlaced, setLastPlaced] = useState<Set<number>>(new Set())
  const [confidence, setConfidence] = useState<Record<number, number>>({})
  const [selected, setSelected] = useState<number | null>(null)
  const [wrongFlash, setWrongFlash] = useState<number | null>(null)
  const [auto, setAuto] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string>('')
  const controllerRef = useRef<AbortController | null>(null)

  const solved = grid.every((d) => d !== 0)
  const snapMistakes = log.length

  const runRound = useCallback(async () => {
    const empties = grid.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0)
    if (!empties.length) return
    const controller = new AbortController()
    controllerRef.current = controller
    const roundNo = round + 1
    // Snap takes at most MAX_QUESTIONS questions per call, so the empty cells go out in parallel batches.
    const batches: Record<string, ChoiceQuestion>[] = []
    empties.forEach((i, k) => {
      if (k % MAX_QUESTIONS === 0) batches.push({})
      batches[batches.length - 1][`c${i}`] = cellQuestion(i)
    })
    setThinking(true)
    setError(null)
    try {
      const text = stateText(grid, log)
      // allSettled: one failed batch (e.g. a 429) shouldn't throw away the answers the others already paid for.
      const settled = await Promise.allSettled(batches.map((qs) => askSnap(text, qs, controller.signal)))
      if (controller.signal.aborted) return
      const failures = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failures.length === settled.length) throw failures[0].reason
      const answers = Object.assign({}, ...settled.map((r) => (r.status === 'fulfilled' ? r.value : {}))) as Awaited<ReturnType<typeof askSnap>>
      const next = grid.slice()
      const nextOwner = owner.slice()
      const placed = new Set<number>()
      const mistakes: Mistake[] = []
      const conf: Record<number, number> = {}
      let best: { i: number; d: number; p: number } | null = null
      // (cell, digit) pairs already logged as mistakes: never replay them as the fallback guess.
      const tried = new Set(log.map((m) => `${m.i}:${m.d}`))

      const commit = (i: number, d: number) => {
        if (d === solution[i]) { next[i] = d; nextOwner[i] = 'snap'; placed.add(i) }
        else mistakes.push({ round: roundNo, i, d, why: clashes(next, i, d) ? 'clashes with a digit in its row, column or box' : 'wrong digit' })
      }

      let committed = 0
      for (const i of empties) {
        const a = answers[`c${i}`]
        if (!a) continue
        const digitProbs = Object.entries(a.probabilities).filter(([k]) => k !== 'abstain')
        for (const [k, p] of digitProbs) {
          if (!tried.has(`${i}:${k}`) && (!best || p > best.p)) best = { i, d: Number(k), p }
        }
        conf[i] = digitProbs.reduce((m, [, p]) => Math.max(m, p), 0)
        if (a.choice !== 'abstain') { committed++; commit(i, Number(a.choice)) }
      }
      // Snap abstained everywhere: play its single most confident digit so the game keeps moving.
      if (!committed && best) commit(best.i, best.d)

      setBoard({ solution, grid: next, owner: nextOwner })
      setLog((l) => [...l, ...mistakes])
      setRound(roundNo)
      setLastPlaced(placed)
      setConfidence(conf)
      setSummary(
        `Round ${roundNo}: ${committed ? `${committed} committed` : best ? 'abstained everywhere, played its best guess' : 'abstained everywhere'}, ` +
          `${placed.size} placed, ${mistakes.length} mistake${mistakes.length === 1 ? '' : 's'}.`,
      )
      // No progress: nothing placed and every mistake is a repeat. Stop instead of looping on the same guesses.
      if (!placed.size && mistakes.every((m) => tried.has(`${m.i}:${m.d}`))) setAuto(false)
      if (failures.length) {
        const reason = failures[0].reason
        setError(`${failures.length} of ${settled.length} batches failed: ${reason instanceof Error ? reason.message : String(reason)}`)
        setAuto(false)
      }
    } catch (e) {
      if (controller.signal.aborted) return
      setError(e instanceof Error ? e.message : String(e))
      setAuto(false)
    } finally {
      if (!controller.signal.aborted) setThinking(false)
    }
  }, [askSnap, grid, log, owner, round, solution])

  useEffect(() => {
    if (auto && !thinking && !solved && !error) void runRound()
  }, [auto, thinking, solved, error, runRound])

  useEffect(() => () => controllerRef.current?.abort(), [])

  const newPuzzle = (lvl: Level) => {
    controllerRef.current?.abort()
    setLevel(lvl)
    setBoard(newState(lvl))
    setLog([])
    setRound(0)
    setLastPlaced(new Set())
    setConfidence({})
    setSelected(null)
    setAuto(false)
    setThinking(false)
    setError(null)
    setSummary('')
  }

  const enterDigit = useCallback((i: number, d: number) => {
    if (owner[i] || thinking) return
    if (d === solution[i]) {
      setBoard((b) => {
        const g = b.grid.slice(), o = b.owner.slice()
        g[i] = d
        o[i] = 'you'
        return { ...b, grid: g, owner: o }
      })
      setSelected(null)
    } else {
      setWrongFlash(i)
      setTimeout(() => setWrongFlash(null), 500)
    }
  }, [owner, solution, thinking])

  useEffect(() => {
    if (selected === null) return
    const onKey = (e: KeyboardEvent) => {
      if (/^[1-9]$/.test(e.key)) enterDigit(selected, Number(e.key))
      else if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, enterDigit])

  const emptyCount = grid.filter((d) => !d).length

  const board = (
    <>
      <div
        className="grid aspect-square w-full grid-cols-9 grid-rows-9 overflow-hidden rounded-[6px] border-[1.5px] border-[var(--sq-content-primary)] bg-[var(--sq-surface-secondary)] select-none"
        role="grid"
        aria-label="Sudoku grid"
      >
        {grid.map((d, i) => {
          const r = rowOf(i), c = colOf(i)
          const o = owner[i]
          const conf = !d ? confidence[i] : undefined
          const boxEdgeR = c % 3 === 2, boxEdgeB = r % 3 === 2
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(o ? null : i)}
              aria-label={`${cellName(i)}${d ? ` ${d}` : ' empty'}`}
              className="relative grid min-h-0 min-w-0 place-items-center overflow-hidden font-sans text-[clamp(17px,4.4vw,27px)] tabular-nums transition-colors duration-200 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--sq-content-primary)]"
              style={{
                borderRight: c === 8 ? undefined : `${boxEdgeR ? 1.5 : 1}px solid ${boxEdgeR ? 'var(--sq-content-primary)' : 'var(--sq-rule)'}`,
                borderBottom: r === 8 ? undefined : `${boxEdgeB ? 1.5 : 1}px solid ${boxEdgeB ? 'var(--sq-content-primary)' : 'var(--sq-rule)'}`,
                background: wrongFlash === i
                  ? 'color-mix(in srgb, var(--accent-red) 22%, transparent)'
                  : selected === i
                    ? 'color-mix(in srgb, var(--sq-content-primary) 9%, transparent)'
                    : o === 'snap'
                      ? 'var(--snap-cell)'
                      : o === 'you'
                        ? 'var(--you-cell)'
                        : undefined,
                boxShadow: selected === i ? 'inset 0 0 0 2px var(--sq-content-primary)' : undefined,
                color: o === 'snap' ? 'var(--snap-digit)' : o === 'you' ? 'var(--you-digit)' : 'var(--sq-content-primary)',
                fontWeight: o === 'given' ? 600 : 500,
              }}
            >
              {conf !== undefined && conf >= 0.05 && (
                <span
                  className="pointer-events-none absolute rounded-full"
                  style={{
                    width: `${18 + conf * 34}%`,
                    height: `${18 + conf * 34}%`,
                    background: `color-mix(in srgb, var(--accent-gold) ${Math.round(20 + conf * 60)}%, transparent)`,
                  }}
                />
              )}
              <span key={lastPlaced.has(i) ? `placed-${round}` : 'still'} className={`relative ${lastPlaced.has(i) ? 'heat-bloom' : ''}`}>
                {d || ''}
              </span>
            </button>
          )
        })}
      </div>
      <StatusLine thinking={thinking} error={error} onRetry={() => void runRound()}>
        {solved
          ? `Solved in ${round} round${round === 1 ? '' : 's'}, with ${snapMistakes} mistake${snapMistakes === 1 ? '' : 's'} from Snap.`
          : summary || 'Ask Snap to fill what it’s sure of, or pick a cell and type a digit.'}
      </StatusLine>
    </>
  )

  const panel = (
    <>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <TextButton strong onClick={() => void runRound()} disabled={thinking || solved || auto}>Ask Snap</TextButton>
          <TextButton onClick={() => setAuto((a) => !a)} disabled={solved} pressed={auto}>
            {auto ? 'Stop solving' : 'Let Snap solve it'}
          </TextButton>
        </div>
        <Segmented
          label="Difficulty"
          value={level}
          options={LEVELS.map((l) => ({ value: l.id, label: l.label }))}
          onChange={(l) => newPuzzle(l)}
        />
        <div><TextButton onClick={() => newPuzzle(level)}>New puzzle</TextButton></div>
      </div>
      <section className="grid gap-3" aria-label="Progress">
        <PanelHeading>Progress</PanelHeading>
        <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 font-sans text-[13px] tabular-nums">
          <dt className="text-[var(--sq-content-secondary)]">Cells left</dt>
          <dd className="text-right text-[var(--sq-content-primary)]">{emptyCount}</dd>
          <dt className="text-[var(--sq-content-secondary)]">Rounds</dt>
          <dd className="text-right text-[var(--sq-content-primary)]">{round}</dd>
          <dt className="text-[var(--sq-content-secondary)]">Snap’s mistakes</dt>
          <dd className="text-right text-[var(--sq-content-primary)]">{snapMistakes}</dd>
        </dl>
        <p className="font-sans text-[12px] leading-relaxed text-[var(--sq-content-secondary)]">
          <span className="rounded-[3px] px-1 font-medium" style={{ color: 'var(--snap-digit)', background: 'var(--snap-cell)' }}>Amber</span> digits are Snap’s,{' '}
          <span className="rounded-[3px] px-1 font-medium" style={{ color: 'var(--you-digit)', background: 'var(--you-cell)' }}>blue</span> are yours. A disc on an empty cell shows how sure Snap is about its best digit there.
        </p>
      </section>
      {log.length > 0 && (
        <section className="grid gap-2" aria-label="Mistakes">
          <PanelHeading>Mistakes</PanelHeading>
          <ul className="grid gap-1 font-sans text-[12px] tabular-nums text-[var(--sq-content-secondary)]">
            {log.slice(-6).reverse().map((m, k) => <li key={k}>Round {m.round}: {m.d} in {cellName(m.i)}, {m.why}</li>)}
          </ul>
          {log.length > 6 && <p className="font-sans text-[12px] text-[var(--sq-content-secondary)]">{log.length - 6} earlier.</p>}
        </section>
      )}
    </>
  )

  return <DemoLayout board={board} panel={panel} />
}
