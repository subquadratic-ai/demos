/**
 * Sudoku generation, checking and the text Snap reads, ported from Decision Arena's sudoku.js.
 * A grid is 81 numbers, 0 = empty, row-major (index = row*9 + col). Models see 1-based r1c1..r9c9.
 * Puzzles have exactly one solution, so every placement is checked against it.
 */
import type { ChoiceQuestion } from '../snap'

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const shuffle = <T,>(arr: T[], r: () => number) => {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] }
  return arr
}

export const rowOf = (i: number) => Math.floor(i / 9)
export const colOf = (i: number) => i % 9
export const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3)
export const cellName = (i: number) => `r${rowOf(i) + 1}c${colOf(i) + 1}`

const PEERS = Array.from({ length: 81 }, (_, i) => {
  const s = new Set<number>()
  for (let k = 0; k < 81; k++) if (k !== i && (rowOf(k) === rowOf(i) || colOf(k) === colOf(i) || boxOf(k) === boxOf(i))) s.add(k)
  return [...s]
})

export function candidates(grid: number[], i: number) {
  if (grid[i]) return []
  const used = new Set(PEERS[i].map((k) => grid[k]))
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !used.has(d))
}
export const clashes = (grid: number[], i: number, d: number) => PEERS[i].some((k) => grid[k] === d)

export function countSolutions(grid: number[], limit = 2) {
  const g = grid.slice()
  let count = 0
  const solve = () => {
    if (count >= limit) return
    let best = -1, bestC: number[] | null = null
    for (let i = 0; i < 81; i++) {
      if (!g[i]) {
        const c = candidates(g, i)
        if (!c.length) return
        if (!bestC || c.length < bestC.length) { best = i; bestC = c; if (c.length === 1) break }
      }
    }
    if (best < 0) { count++; return }
    for (const d of bestC!) { g[best] = d; solve(); g[best] = 0; if (count >= limit) return }
  }
  solve()
  return count
}

function fullGrid(r: () => number) {
  const g = new Array<number>(81).fill(0)
  const fill = (i: number): boolean => {
    if (i === 81) return true
    for (const d of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], r)) {
      if (!clashes(g, i, d)) { g[i] = d; if (fill(i + 1)) return true; g[i] = 0 }
    }
    return false
  }
  fill(0)
  return g
}

/** clues: how many givens to aim for (fewer = harder). */
export function makePuzzle(seed: number, clues: number) {
  const r = rng(seed), solution = fullGrid(r), puzzle = solution.slice()
  let filled = 81
  for (const i of shuffle([...Array(81).keys()], r)) {
    if (filled <= clues) break
    const keep = puzzle[i]
    puzzle[i] = 0
    if (countSolutions(puzzle, 2) !== 1) puzzle[i] = keep
    else filled--
  }
  return { puzzle, solution }
}

export function gridText(grid: number[]) {
  const line = (head: string, fields: string[]) => head + '  ' + [0, 3, 6].map((k) => fields.slice(k, k + 3).join(' ')).join(' | ')
  const L = [line('  ', [1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => 'c' + c))]
  for (let r = 0; r < 9; r++) {
    if (r && r % 3 === 0) L.push('    ' + '-'.repeat(9) + '+' + '-'.repeat(10) + '+' + '-'.repeat(9))
    L.push(line('r' + (r + 1), Array.from({ length: 9 }, (_, c) => String(grid[r * 9 + c] || '.').padStart(2))))
  }
  return L.join('\n')
}

export type Mistake = { round: number; i: number; d: number; why: string }

export function stateText(grid: number[], log: Mistake[]) {
  const L = [
    'GAME: Sudoku (9x9).', '',
    'RULES',
    '- Every row, every column and every 3x3 box must contain each digit 1-9 exactly once.',
    '- Rows are r1..r9 top to bottom, columns c1..c9 left to right. Boxes: box 1 = r1-r3 x c1-c3, box 2 = r1-r3 x c4-c6, ... box 9 = r7-r9 x c7-c9.',
    '- This puzzle has exactly one solution. A digit is only right if it matches that solution.',
    '- You are asked about every empty cell. For each, either commit a digit or ABSTAIN. Committed digits are checked at once:',
    '  a right digit is placed; a wrong one is a MISTAKE and is not placed. Abstaining costs nothing; you will be asked again',
    '  after this round\'s placements, when more cells are filled. Commit only digits you are sure of.',
    '- Only make a move if you think it is a legal move: before writing a digit, check that it is not already in that cell\'s',
    '  row, column or box.',
    '', 'CURRENT GRID (. = empty)', gridText(grid),
  ]
  if (log.length) {
    L.push('', `MISTAKE LOG (every wrong digit so far, oldest first: ${log.length}). None of these may be repeated.`)
    for (const x of log) L.push(`round ${x.round}: ${cellName(x.i)}=${x.d}: ${x.why}`)
  }
  return L.join('\n')
}

/** One question per empty cell: digits 1-9, or abstain. */
export function cellQuestion(i: number): ChoiceQuestion {
  const criteria: Record<string, string> = {}
  for (let d = 1; d <= 9; d++) criteria[String(d)] = `digit ${d}`
  const where = `Cell ${cellName(i)} (row ${rowOf(i) + 1}, column ${colOf(i) + 1}, box ${boxOf(i) + 1}) is empty.`
  criteria.abstain = 'ABSTAIN: not certain yet (no penalty; asked again next round)'
  return {
    type: 'choice',
    criteria,
    instructions: `${where} Which digit goes here? Commit a digit only if you can be certain from the grid; otherwise ABSTAIN. A wrong digit is a mistake.`,
  }
}
