/**
 * Go rules, ported from Decision Arena's go.js. Board: Int8Array of n*n, 0 empty, 1 black, 2 white;
 * index = row*n + col with row 0 at the top. Coordinates as players write them: columns A..T skipping I,
 * rows numbered from the bottom (A1 = bottom-left). Captures, no suicide, simple ko, passing; area scoring.
 */
export const EMPTY = 0
export const BLACK = 1
export const WHITE = 2
export type Stone = typeof BLACK | typeof WHITE
export const KOMI = 7.5

const LETTERS = 'ABCDEFGHJKLMNOPQRST'
export const opp = (c: Stone): Stone => (c === BLACK ? WHITE : BLACK)
export const colorName = (c: Stone) => (c === BLACK ? 'Black' : 'White')
export const coord = (n: number, i: number) => LETTERS[i % n] + String(n - Math.floor(i / n))
export const columnLetters = (n: number) => LETTERS.slice(0, n).split('')
export const newBoard = (n: number) => new Int8Array(n * n)

const nbrCache = new Map<number, number[][]>()
function neighbors(n: number) {
  const cached = nbrCache.get(n)
  if (cached) return cached
  const N = Array.from({ length: n * n }, (_, i) => {
    const r = Math.floor(i / n), c = i % n, out: number[] = []
    if (r > 0) out.push(i - n)
    if (r < n - 1) out.push(i + n)
    if (c > 0) out.push(i - 1)
    if (c < n - 1) out.push(i + 1)
    return out
  })
  nbrCache.set(n, N)
  return N
}

/** The connected group containing stone i, and its liberties. */
export function group(board: Int8Array, n: number, i: number) {
  const N = neighbors(n), color = board[i], stones = [i], libs = new Set<number>(), seen = new Set([i])
  for (let k = 0; k < stones.length; k++) {
    for (const j of N[stones[k]]) {
      if (board[j] === EMPTY) libs.add(j)
      else if (board[j] === color && !seen.has(j)) { seen.add(j); stones.push(j) }
    }
  }
  return { stones, libs }
}

/** Play colour c at i. Returns null if illegal (occupied, ko, suicide). */
export function play(board: Int8Array, n: number, i: number, c: Stone, ko = -1) {
  if (board[i] !== EMPTY || i === ko) return null
  const b = board.slice(), N = neighbors(n)
  b[i] = c
  let captured: number[] = []
  for (const j of N[i]) {
    if (b[j] === opp(c)) {
      const g = group(b, n, j)
      if (!g.libs.size) { for (const s of g.stones) b[s] = EMPTY; captured = captured.concat(g.stones) }
    }
  }
  const own = group(b, n, i)
  if (!own.libs.size) return null // suicide
  const newKo = captured.length === 1 && own.stones.length === 1 && own.libs.size === 1 && own.libs.has(captured[0]) ? captured[0] : -1
  return { board: b, captured, ko: newKo, libsAfter: own.libs.size }
}

export type LegalMove = { i: number; name: string; captures: number; selfAtari: boolean }

export function legalMoves(board: Int8Array, n: number, c: Stone, ko = -1): LegalMove[] {
  const out: LegalMove[] = []
  for (let i = 0; i < n * n; i++) {
    if (board[i] !== EMPTY) continue
    const r = play(board, n, i, c, ko)
    if (r) out.push({ i, name: coord(n, i), captures: r.captured.length, selfAtari: r.libsAfter === 1 })
  }
  return out
}

/** Area score: stones + empty regions bordered by only one colour. Dead stones are not removed. */
export function score(board: Int8Array, n: number) {
  const N = neighbors(n), seen = new Uint8Array(n * n)
  let black = 0, white = 0
  for (let i = 0; i < n * n; i++) { if (board[i] === BLACK) black++; else if (board[i] === WHITE) white++ }
  for (let i = 0; i < n * n; i++) {
    if (board[i] !== EMPTY || seen[i]) continue
    const region = [i], touch = new Set<number>()
    seen[i] = 1
    for (let k = 0; k < region.length; k++) {
      for (const j of N[region[k]]) {
        if (board[j] === EMPTY) { if (!seen[j]) { seen[j] = 1; region.push(j) } } else touch.add(board[j])
      }
    }
    if (touch.size === 1) { if (touch.has(BLACK)) black += region.length; else white += region.length }
  }
  return { black, white: white + KOMI, margin: black - (white + KOMI) }
}

export function boardText(board: Int8Array, n: number) {
  const head = '    ' + columnLetters(n).join(' ')
  const L = [head]
  for (let r = 0; r < n; r++) {
    const row: string[] = []
    for (let c = 0; c < n; c++) { const v = board[r * n + c]; row.push(v === BLACK ? 'X' : v === WHITE ? 'O' : '.') }
    L.push(String(n - r).padStart(2) + '  ' + row.join(' ') + '  ' + String(n - r))
  }
  L.push(head)
  return L.join('\n')
}

export type GoGame = {
  n: number
  board: Int8Array
  player: Stone
  ko: number
  moveNo: number
  caps: Record<Stone, number>
  history: string[]
  passes: number
}

export function stateText(g: GoGame) {
  const n = g.n, sc = score(g.board, n)
  return [
    `GAME: Go on a ${n}x${n} board. Area scoring, komi ${KOMI} for White.`, '',
    'RULES',
    '- Players alternate placing one stone on an empty point; X is Black, O is White, . is empty. Black moves first.',
    '- A group (stones connected along the lines) with no empty neighbouring point is captured and removed.',
    '- Suicide is illegal (a move that leaves your own group with no liberties, unless it captures).',
    '- Ko: you may not immediately retake a single stone that was just captured.',
    '- You may pass. Two passes in a row end the game. Score = your stones on the board + empty points surrounded only by you; White adds komi.',
    '- Columns are A..J without I; rows are numbered from the bottom (A1 = bottom-left).', '',
    'STRATEGY NOTES',
    '- Corners, then sides, then centre: territory is cheapest to secure near the edges early on.',
    '- Keep your groups connected and give them two separate eyes so they can\'t be captured.',
    '- Don\'t fill your own eyes. Don\'t play self-atari (a move that leaves your group with one liberty) unless it captures or is a deliberate sacrifice.',
    '- Capture stones that are in atari when it matters; extend or connect your own stones that are in atari.',
    '- Late in the game, pass when no move gains points.', '',
    `YOU ARE PLAYING: ${colorName(g.player)} (${g.player === BLACK ? 'X' : 'O'})`,
    `MOVE ${g.moveNo + 1}. Captured so far: Black has taken ${g.caps[BLACK]} stones, White ${g.caps[WHITE]}.` +
      (g.ko >= 0 ? ` Ko: ${coord(n, g.ko)} can't be played this turn.` : '') +
      (g.passes ? ' Your opponent just passed: if you pass too, the game ends and is scored.' : ''),
    `Current area count: Black ${sc.black}, White ${sc.white} (incl. komi; dead stones not removed).`, '',
    'BOARD', boardText(g.board, n), '',
    g.history.length ? 'RECENT MOVES (most recent last)\n' + g.history.slice(-16).join(', ') : 'No moves yet.',
  ].join('\n')
}

export function moveLabel(m: LegalMove) {
  const bits = [`play ${m.name}`]
  if (m.captures) bits.push(`captures ${m.captures} stone${m.captures > 1 ? 's' : ''}`)
  if (m.selfAtari) bits.push('self-atari')
  return bits.join(', ')
}
