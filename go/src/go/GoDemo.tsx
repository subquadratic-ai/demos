import { useCallback, useMemo, useState } from 'react'
import { useSnapTurn, type SnapTurn } from '../snap'
import { BOARD } from '../format'
import { DecisionList, DemoLayout, HeatDisc, PanelHeading, Segmented, StatusLine, TextButton } from '../ui'
import {
  BLACK, colorName, columnLetters, coord, EMPTY, legalMoves, moveLabel, newBoard, opp, play, score, stateText,
  WHITE, type GoGame, type Stone,
} from './goRules'

const N = 9
const MAX_MOVES = 160
const STAR_POINTS = new Set([2 * N + 2, 2 * N + 6, 4 * N + 4, 6 * N + 2, 6 * N + 6])

const freshGame = (): GoGame => ({
  n: N, board: newBoard(N), player: BLACK, ko: -1, moveNo: 0, caps: { [BLACK]: 0, [WHITE]: 0 } as GoGame['caps'], history: [], passes: 0,
})

/** Apply a move (board index) or a pass (-1) for the player to move. */
function advance(g: GoGame, i: number): GoGame {
  const name = colorName(g.player)
  if (i < 0) {
    return { ...g, player: opp(g.player), ko: -1, moveNo: g.moveNo + 1, history: [...g.history, `${name} pass`], passes: g.passes + 1 }
  }
  const r = play(g.board, g.n, i, g.player, g.ko)!
  return {
    ...g,
    board: r.board,
    player: opp(g.player),
    ko: r.ko,
    moveNo: g.moveNo + 1,
    caps: { ...g.caps, [g.player]: g.caps[g.player] + r.captured.length },
    history: [...g.history, `${name} ${coord(g.n, i)}`],
    passes: 0,
  }
}

export default function GoDemo() {
  const [game, setGame] = useState<GoGame>(freshGame)
  const [userColor, setUserColor] = useState<Stone>(BLACK)
  const [lastIndex, setLastIndex] = useState(-1)

  const snapColor = opp(userColor)
  const over = game.passes >= 2 || game.moveNo >= MAX_MOVES
  const legal = useMemo(() => legalMoves(game.board, N, game.player, game.ko), [game])
  const legalSet = useMemo(() => new Set(legal.map((m) => m.i)), [legal])

  const move = useCallback((i: number) => {
    setGame((g) => advance(g, i))
    setLastIndex(i)
  }, [])

  // Snap's turn. With no legal point left, `pass` is the only option and is played without asking.
  const snapTurn = useMemo<SnapTurn<null> | null>(() => {
    if (over || game.player !== snapColor) return null
    const criteria: Record<string, string> = {}
    for (const m of legal) criteria[m.name] = moveLabel(m)
    criteria.pass = game.passes ? 'pass (your opponent passed, so this ends the game)' : 'pass'
    return {
      state: stateText(game),
      question: {
        type: 'choice',
        instructions: `You are ${colorName(snapColor)}. Which move gives YOUR side the best prospect of winning, assuming strong play from your opponent?`,
        criteria,
      },
      meta: null,
      apply: (choice) => move(choice === 'pass' ? -1 : legal.find((m) => m.name === choice)!.i),
    }
  }, [game, legal, snapColor, over, move])
  const { decision, showHeat, thinking, error, retry, reset } = useSnapTurn(snapTurn)

  const userTurn = !over && game.player === userColor && !thinking
  const onPoint = (i: number) => {
    if (userTurn && legalSet.has(i)) move(i)
  }

  const newGame = (color: Stone) => {
    setGame(freshGame())
    setUserColor(color)
    setLastIndex(-1)
    reset()
  }

  const sc = score(game.board, N)
  const you = (c: Stone) => (c === userColor ? ' (you)' : '')
  let result = ''
  if (over) {
    const winner = sc.margin > 0 ? BLACK : WHITE
    result = `${winner === userColor ? 'You win' : 'Snap wins'} by ${Math.abs(sc.margin).toFixed(1)} points.`
  } else if (game.player === userColor) {
    result = game.passes ? 'Snap passed. Pass to end the game, or keep playing.' : 'Your move.'
  }

  const heatByName = showHeat && decision ? decision.probs : {}
  const heatRank = Object.entries(heatByName).sort((a, b) => b[1] - a[1]).map(([k]) => k)
  const cell = 100 / N
  const letters = columnLetters(N)

  const board = (
    <>
      <div className="relative aspect-square w-full rounded-[6px] select-none" style={{ background: BOARD.go }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true">
          {Array.from({ length: N }, (_, k) => {
            const p = cell / 2 + k * cell
            return (
              <g key={k} stroke={BOARD.line} strokeWidth="0.22">
                <line x1={cell / 2} y1={p} x2={100 - cell / 2} y2={p} />
                <line x1={p} y1={cell / 2} x2={p} y2={100 - cell / 2} />
              </g>
            )
          })}
          {[...STAR_POINTS].map((i) => (
            <circle key={i} cx={cell / 2 + (i % N) * cell} cy={cell / 2 + Math.floor(i / N) * cell} r="0.8" fill={BOARD.ink} fillOpacity="0.55" />
          ))}
        </svg>
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${N}, minmax(0, 1fr))` }} role="grid" aria-label="Go board">
          {Array.from({ length: N * N }, (_, i) => {
            const v = game.board[i]
            const name = coord(N, i)
            const p = v === EMPTY ? heatByName[name] : undefined
            const clickable = userTurn && legalSet.has(i)
            return (
              <button
                key={i}
                type="button"
                onClick={() => onPoint(i)}
                disabled={!clickable}
                aria-label={`${name}${v === BLACK ? ' black' : v === WHITE ? ' white' : ''}`}
                className="group relative grid min-h-0 min-w-0 place-items-center rounded-full disabled:cursor-default focus-visible:outline-2 focus-visible:outline-[var(--sq-content-primary)]"
              >
                {p !== undefined && p >= 0.01 && (
                  <HeatDisc p={p} rank={heatRank.indexOf(name)} chosen={name === decision?.choice} maxSize={92} />
                )}
                {v !== EMPTY && (
                  <span
                    className="relative size-[84%] rounded-full"
                    style={v === BLACK
                      ? { background: 'radial-gradient(circle at 34% 30%, #55524d, #141312 70%)' }
                      : { background: 'radial-gradient(circle at 34% 30%, #ffffff, #e6e2da 75%)', boxShadow: 'inset 0 0 0 1px rgba(20,19,18,0.18)' }}
                  />
                )}
                {v !== EMPTY && i === lastIndex && (
                  <span className="absolute size-[20%] rounded-full" style={{ background: 'var(--accent-gold)' }} />
                )}
                {clickable && (
                  <span
                    className="absolute size-[70%] rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-35 group-focus-visible:opacity-35"
                    style={{ background: userColor === BLACK ? '#141312' : '#ffffff' }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div className="grid px-0 font-sans text-[10px] text-[var(--sq-content-secondary)]" style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }} aria-hidden="true">
        {letters.map((l) => <span key={l} className="text-center">{l}</span>)}
      </div>
      <StatusLine
        thinking={thinking}
        error={error}
        onRetry={retry}
        action={!over && <TextButton onClick={() => move(-1)} disabled={!userTurn}>Pass</TextButton>}
      >
        {result}
      </StatusLine>
    </>
  )

  const options = decision ? Object.entries(decision.probs).map(([k, p]) => ({ key: k, label: k === 'pass' ? 'Pass' : k, p })) : []

  const panel = (
    <>
      <div className="grid gap-3">
        <Segmented
          label="Play as"
          value={userColor === BLACK ? 'black' : 'white'}
          options={[{ value: 'black', label: 'Black' }, { value: 'white', label: 'White' }]}
          onChange={(c) => newGame(c === 'black' ? BLACK : WHITE)}
        />
        <div><TextButton onClick={() => newGame(userColor)}>New game</TextButton></div>
      </div>
      <DecisionList
        options={options}
        choice={decision?.choice}
        empty={game.player === userColor ? 'Place a stone. When Snap replies, its options appear here, ranked.' : 'Snap moves first.'}
      />
      <section className="grid gap-3" aria-label="Score">
        <PanelHeading>Score</PanelHeading>
        <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 font-sans text-[13px] tabular-nums">
          <dt className="text-[var(--sq-content-secondary)]">Black{you(BLACK)}</dt>
          <dd className="text-right text-[var(--sq-content-primary)]">{sc.black}</dd>
          <dt className="text-[var(--sq-content-secondary)]">White{you(WHITE)}, with 7.5 komi</dt>
          <dd className="text-right text-[var(--sq-content-primary)]">{sc.white}</dd>
        </dl>
      </section>
    </>
  )

  return <DemoLayout board={board} panel={panel} />
}
