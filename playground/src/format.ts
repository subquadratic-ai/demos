export const pctLabel = (p: number) => (p >= 0.995 ? '100%' : p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`)
