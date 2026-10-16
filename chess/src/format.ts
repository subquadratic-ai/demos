export const pctLabel = (p: number) => (p >= 0.995 ? '100%' : p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`)

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Boards keep one warm palette in light and dark themes, like a real board:
 * themed squares made black pieces and stones vanish in dark mode.
 */
export const BOARD = {
  light: '#ece8df',
  dark: '#cdc6b8',
  go: '#e9e4d9',
  ink: '#1a1917',
  mute: '#6f695f',
  line: 'rgba(26, 25, 23, 0.42)',
  whitePiece: '#faf8f3',
} as const
