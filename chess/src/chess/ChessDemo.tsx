import { Chess, type Move, type Square } from 'chess.js'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useSnapTurn, type SnapTurn } from '../snap'
import { BOARD } from '../format'
import { DecisionList, DemoLayout, HeatDisc, PanelHeading, Segmented, StatusLine, TextButton } from '../ui'

type Color = 'w' | 'b'
/** Per-turn move labels (SAN) and destination squares, kept with Snap's decision for the heat map and list. */
type TurnMeta = { labels: Record<string, string>; targets: Record<string, string> }

const FILES = 'abcdefgh'
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const NAME: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' }
const PROMOTIONS = ['q', 'r', 'b', 'n'] as const
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const colorName = (c: Color) => (c === 'w' ? 'White' : 'Black')

function material(game: Chess) {
  const m = { w: 0, b: 0 }
  for (const row of game.board()) for (const sq of row) if (sq) m[sq.color] += VALUE[sq.type]
  return m
}

function moveLabel(m: Move) {
  const bits: string[] = []
  if (m.captured) bits.push(`captures ${NAME[m.captured]}`)
  if (m.promotion) bits.push(`promotes to ${NAME[m.promotion]}`)
  if (m.san.includes('#')) bits.push('checkmate')
  else if (m.san.includes('+')) bits.push('gives check')
  return [`${NAME[m.piece]} ${m.from}→${m.to}`, ...bits].join(', ')
}

function stateText(game: Chess, snap: Color) {
  const mat = material(game)
  const history = game.history()
  const pairs: string[] = []
  for (let i = 0; i < history.length; i += 2) pairs.push(`${i / 2 + 1}. ${history[i]}${history[i + 1] ? ` ${history[i + 1]}` : ''}`)
  return [
    'GAME: Chess, standard rules.',
    '',
    'RULES',
    '- White moves first; players alternate. Win by checkmating the opposing king.',
    '- Stalemate, threefold repetition, the fifty-move rule and insufficient material are draws.',
    '- Board: files a-h left to right from White\'s side, ranks 1-8 bottom to top. Uppercase = White, lowercase = Black, "." = empty.',
    '',
    'STRATEGY NOTES',
    '- Don\'t leave pieces where they can be captured for free; check what your move allows in reply.',
    '- Develop pieces, control the centre, castle to keep your king safe.',
    '- Look for checks, captures and threats for both sides before choosing.',
    '',
    `YOU ARE PLAYING: ${colorName(snap)}`,
    `MOVE ${game.moveNumber()}, ${colorName(game.turn() as Color)} to move.${game.inCheck() ? ' You are IN CHECK.' : ''}`,
    `Material: White ${mat.w}, Black ${mat.b}.`,
    `FEN: ${game.fen()}`,
    '',
    'BOARD',
    game.ascii(),
    '',
    pairs.length ? `MOVES SO FAR\n${pairs.join(' ')}` : 'No moves yet.',
  ].join('\n')
}

export default function ChessDemo() {
  const gameRef = useRef(new Chess())
  const [fen, setFen] = useState(() => gameRef.current.fen())
  const [userColor, setUserColor] = useState<Color>('w')
  const [selected, setSelected] = useState<Square | null>(null)
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null)
  // The player's promotion moves to one square, waiting for them to pick the piece.
  const [promoting, setPromoting] = useState<Move[] | null>(null)

  const game = gameRef.current
  const snapColor: Color = userColor === 'w' ? 'b' : 'w'
  const turn = game.turn() as Color
  const over = game.isGameOver()

  const applyMove = useCallback((m: { from: string; to: string; promotion?: string }) => {
    const played = gameRef.current.move(m)
    setLastMove({ from: played.from, to: played.to })
    setFen(gameRef.current.fen())
    setSelected(null)
  }, [])

  // Snap's turn: ask for a distribution over every legal move, show it, then play the choice.
  const snapTurn = useMemo<SnapTurn<TurnMeta> | null>(() => {
    if (over || turn !== snapColor) return null
    const g = gameRef.current
    const moves = g.moves({ verbose: true })
    const criteria: Record<string, string> = {}
    const labels: Record<string, string> = {}
    for (const m of moves) {
      criteria[m.san] = moveLabel(m)
      labels[m.san] = m.san
    }
    return {
      state: stateText(g, snapColor),
      question: {
        type: 'choice',
        instructions:
          `You are ${colorName(snapColor)}. Choose the legal move that gives YOUR side the best prospect of winning, ` +
          'assuming strong play from your opponent. Judge each move by the position it leads to.',
        criteria,
      },
      meta: { labels, targets: Object.fromEntries(moves.map((x) => [x.san, x.to])) },
      apply: (san) => {
        const m = moves.find((x) => x.san === san)!
        applyMove({ from: m.from, to: m.to, promotion: m.promotion })
      },
    }
    // The game lives in a ref; fen changes drive turns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, snapColor, turn, over, applyMove])
  const { decision, showHeat, thinking, error, retry, reset } = useSnapTurn(snapTurn)

  const legalFromSelected = useMemo(
    () => (selected ? game.moves({ square: selected, verbose: true }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, fen],
  )

  const onSquare = (sq: Square) => {
    if (over || turn !== userColor || thinking) return
    setPromoting(null)
    const toSq = legalFromSelected.filter((m) => m.to === sq)
    if (toSq.length > 1) {
      // One move per promotion piece: let the player choose.
      setPromoting(toSq)
      return
    }
    if (toSq.length === 1) {
      applyMove({ from: toSq[0].from, to: toSq[0].to })
      return
    }
    const piece = game.get(sq)
    setSelected(piece && piece.color === userColor ? sq : null)
  }

  const promote = (m: Move) => {
    setPromoting(null)
    applyMove({ from: m.from, to: m.to, promotion: m.promotion })
  }

  const newGame = (color: Color) => {
    gameRef.current = new Chess()
    setUserColor(color)
    setSelected(null)
    setLastMove(null)
    setPromoting(null)
    reset()
    setFen(gameRef.current.fen())
  }

  // Probability mass landing on each destination square, for the heat overlay.
  const heatBySquare = useMemo(() => {
    const out: Record<string, number> = {}
    if (!decision || !showHeat) return out
    for (const [san, p] of Object.entries(decision.probs)) {
      const to = decision.meta.targets[san]
      if (to) out[to] = (out[to] ?? 0) + p
    }
    return out
  }, [decision, showHeat])

  const ranks = userColor === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8]
  const files = userColor === 'w' ? FILES.split('') : FILES.split('').reverse()
  const targets = new Set(legalFromSelected.map((m) => m.to))
  const chosenSquare = decision ? decision.meta.targets[decision.choice] : undefined
  const heatRank = Object.entries(heatBySquare).sort((a, b) => b[1] - a[1]).map(([sq]) => sq)

  let result: string
  if (game.isCheckmate()) result = turn === userColor ? 'Checkmate. Snap wins.' : 'Checkmate. You win.'
  else if (game.isStalemate()) result = 'Stalemate. It’s a draw.'
  else if (game.isDraw()) result = 'It’s a draw.'
  else if (turn === userColor) result = game.inCheck() ? 'You’re in check. Your move.' : 'Your move.'
  else result = ''

  const board = (
    <>
      <div
        className="grid aspect-square w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-[6px] select-none"
        role="grid"
        aria-label="Chess board"
      >
        {ranks.map((rank) =>
          files.map((file) => {
            const sq = `${file}${rank}` as Square
            const piece = game.get(sq)
            // a1 (file 0 + rank 1) is dark.
            const dark = (FILES.indexOf(file) + rank) % 2 === 1
            const p = heatBySquare[sq]
            const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq)
            const isTarget = targets.has(sq)
            return (
              <button
                key={sq}
                type="button"
                onClick={() => onSquare(sq)}
                aria-label={`${sq}${piece ? ` ${colorName(piece.color as Color)} ${NAME[piece.type]}` : ''}`}
                className="relative grid min-h-0 min-w-0 place-items-center overflow-hidden focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--sq-content-primary)]"
                style={{
                  background: dark ? BOARD.dark : BOARD.light,
                  boxShadow: selected === sq ? `inset 0 0 0 2px ${BOARD.ink}` : undefined,
                }}
              >
                {isLast && <span className="absolute inset-0" style={{ background: 'rgba(26, 25, 23, 0.09)' }} />}
                {p !== undefined && p >= 0.01 && (
                  <HeatDisc p={p} rank={heatRank.indexOf(sq)} chosen={sq === chosenSquare} label={decision?.probs[decision.choice]} />
                )}
                {isTarget && (
                  <span
                    className={`absolute rounded-full ${piece ? 'inset-[6%] border-[3px] border-[rgba(26,25,23,0.28)]' : 'size-[24%] bg-[rgba(26,25,23,0.24)]'}`}
                  />
                )}
                {piece && !(p !== undefined && sq === chosenSquare) && (
                  <span
                    className="relative text-[clamp(24px,7.4vw,50px)] leading-none"
                    style={piece.color === 'w'
                      ? { color: BOARD.whitePiece, WebkitTextStroke: `1.1px ${BOARD.ink}` }
                      : { color: BOARD.ink }}
                  >
                    {GLYPH[piece.type]}
                  </span>
                )}
                {file === files[0] && (
                  <span className="absolute left-1 top-0.5 font-sans text-[10px]" style={{ color: BOARD.mute }}>{rank}</span>
                )}
                {rank === ranks[7] && (
                  <span className="absolute bottom-0.5 right-1 font-sans text-[10px]" style={{ color: BOARD.mute }}>{file}</span>
                )}
              </button>
            )
          }),
        )}
      </div>
      <StatusLine thinking={thinking} error={error} onRetry={retry}>
        {promoting ? (
          <>
            <span>Promote to</span>
            {PROMOTIONS.map((piece) => {
              const m = promoting.find((x) => x.promotion === piece)
              return m && <TextButton key={piece} onClick={() => promote(m)}>{NAME[piece]}</TextButton>
            })}
          </>
        ) : result}
      </StatusLine>
    </>
  )

  const options = decision
    ? Object.entries(decision.probs).map(([k, p]) => ({ key: k, label: decision.meta.labels[k] ?? k, p }))
    : []
  const history = game.history()
  const pairs: [string, string | undefined][] = []
  for (let i = 0; i < history.length; i += 2) pairs.push([history[i], history[i + 1]])

  const panel = (
    <>
      <div className="grid gap-3">
        <Segmented
          label="Play as"
          value={userColor}
          options={[{ value: 'w', label: 'White' }, { value: 'b', label: 'Black' }]}
          onChange={(c) => newGame(c)}
        />
        <div><TextButton onClick={() => newGame(userColor)}>New game</TextButton></div>
      </div>
      <DecisionList
        options={options}
        choice={decision?.choice}
        empty={turn === userColor ? 'Your move. When Snap replies, its options appear here, ranked.' : 'Snap moves first.'}
      />
      {pairs.length > 0 && (
        <section className="grid gap-3" aria-label="Moves">
          <PanelHeading>Moves</PanelHeading>
          <ol className="grid max-h-44 grid-cols-[28px_1fr_1fr] gap-x-2 gap-y-1 overflow-y-auto font-sans text-[13px] tabular-nums">
            {pairs.map(([w, b], i) => (
              <li key={i} className="contents">
                <span className="text-[var(--sq-content-secondary)]">{i + 1}.</span>
                <span className="text-[var(--sq-content-primary)]">{w}</span>
                <span className="text-[var(--sq-content-primary)]">{b ?? ''}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )

  return <DemoLayout board={board} panel={panel} />
}
