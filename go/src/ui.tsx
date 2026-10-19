import type { ReactNode } from 'react'
import { BOARD, pctLabel } from './format'

/**
 * Shared demo UI. Visual rules: gold is reserved for Snap's probabilities,
 * ink is you and the board, everything else stays quiet.
 */

/** Small sentence-case heading for a panel section. */
export function PanelHeading({ children }: { children: ReactNode }) {
  return <h2 className="font-sans text-[13px] font-medium text-[var(--sq-content-primary)]">{children}</h2>
}

/** Inline segmented toggle, e.g. "Play as  White | Black". */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-sans text-[13px] text-[var(--sq-content-secondary)]">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-[var(--sq-rule)] p-0.5">
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => !active && onChange(o.value)}
              className={`rounded-full px-3 py-1 font-sans text-[13px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sq-content-primary)] disabled:opacity-40 ${
                active
                  ? 'bg-[var(--sq-content-primary)] text-[var(--sq-surface-primary)]'
                  : 'text-[var(--sq-content-secondary)] hover:text-[var(--sq-content-primary)]'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Quiet text action; `strong` for the one primary action in a panel. */
export function TextButton({
  children,
  onClick,
  disabled,
  strong,
  pressed,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  strong?: boolean
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={`rounded-full font-sans text-[13px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sq-content-primary)] disabled:cursor-default disabled:opacity-40 ${
        strong
          ? 'bg-[var(--sq-content-primary)] px-4 py-2 font-medium text-[var(--sq-surface-primary)] hover:opacity-85'
          : 'py-1 text-[var(--sq-content-secondary)] underline-offset-4 hover:text-[var(--sq-content-primary)] hover:underline'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * A probability disc on a board cell. Discs bloom in by rank when a decision
 * lands; the chosen option is ringed and labelled with its share.
 */
export function HeatDisc({
  p,
  rank,
  chosen,
  label,
  maxSize = 88,
}: {
  p: number
  rank: number
  chosen?: boolean
  /** Share printed on the chosen disc; defaults to `p`. */
  label?: number
  maxSize?: number
}) {
  const size = 22 + Math.sqrt(p) * (maxSize - 22)
  return (
    <span
      className="heat-bloom pointer-events-none absolute grid place-items-center rounded-full"
      style={{
        width: `${size}%`,
        height: `${size}%`,
        background: `color-mix(in srgb, var(--accent-gold) ${Math.round(28 + p * 62)}%, transparent)`,
        boxShadow: chosen ? '0 0 0 2px var(--accent-gold)' : undefined,
        animationDelay: `${Math.min(rank, 12) * 45}ms`,
      }}
    >
      {chosen && (
        <span className="font-sans text-[clamp(9px,1.6vw,12px)] font-semibold tabular-nums" style={{ color: BOARD.ink }}>
          {pctLabel(label ?? p)}
        </span>
      )}
    </span>
  )
}

/** Ranked list of Snap's options: the panel's main content. */
export function DecisionList({
  options,
  choice,
  empty,
  limit = 6,
}: {
  options: { key: string; label: string; p: number }[]
  choice?: string | null
  empty: string
  limit?: number
}) {
  const ranked = [...options].sort((a, b) => b.p - a.p).slice(0, limit)
  const rest = options.length - ranked.length
  return (
    <section className="grid gap-3" aria-label="Snap's read">
      <PanelHeading>Snap&apos;s read</PanelHeading>
      {ranked.length === 0 ? (
        <p className="font-sans text-[13px] leading-relaxed text-[var(--sq-content-secondary)]">{empty}</p>
      ) : (
        <ol className="grid gap-2.5">
          {ranked.map((o) => {
            const isChoice = o.key === choice
            return (
              <li key={o.key} className="grid grid-cols-[minmax(56px,auto)_1fr_40px] items-center gap-3">
                <span className={`truncate font-sans text-[14px] tabular-nums ${isChoice ? 'font-semibold text-[var(--sq-content-primary)]' : 'text-[var(--sq-content-secondary)]'}`}>
                  {o.label}
                </span>
                <span className="h-[3px] overflow-hidden rounded-full bg-[var(--sq-rule)]">
                  <span
                    className="block h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{
                      width: `${Math.max(o.p * 100, 2)}%`,
                      background: isChoice ? 'var(--accent-gold)' : 'color-mix(in srgb, var(--sq-content-primary) 35%, transparent)',
                    }}
                  />
                </span>
                <span className={`text-right font-sans text-[13px] tabular-nums ${isChoice ? 'text-[var(--sq-content-primary)]' : 'text-[var(--sq-content-secondary)]'}`}>
                  {pctLabel(o.p)}
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {rest > 0 && (
        <p className="font-sans text-[12px] text-[var(--sq-content-secondary)]">
          {rest} more option{rest === 1 ? '' : 's'} weighed.
        </p>
      )}
    </section>
  )
}

/**
 * The highlighted bar under the board: whose turn, Snap thinking, the result,
 * or what went wrong. Its tint follows the state (gold while Snap thinks, to
 * match the heat map; red for errors; neutral otherwise). `action` sits at
 * the right edge, e.g. Go's Pass.
 */
export function StatusLine({
  thinking,
  error,
  onRetry,
  action,
  children,
}: {
  thinking?: boolean
  error?: string | null
  onRetry?: () => void
  action?: ReactNode
  children?: ReactNode
}) {
  const tone = error
    ? 'bg-[color-mix(in_srgb,var(--accent-red)_10%,transparent)] text-[var(--sq-content-primary)]'
    : thinking
      ? 'bg-[color-mix(in_srgb,var(--accent-gold)_16%,transparent)] text-[var(--sq-content-primary)]'
      : 'bg-[var(--sq-surface-secondary)] text-[var(--sq-content-primary)]'

  let content: ReactNode
  if (error) {
    content = (
      <>
        <span className="size-1.5 shrink-0 rounded-full bg-[var(--accent-red)]" aria-hidden="true" />
        <span>Snap couldn&apos;t move. {error}.</span>
        {onRetry && <TextButton onClick={onRetry}>Try again</TextButton>}
      </>
    )
  } else if (thinking) {
    content = (
      <>
        <span className="thinking-dots" aria-hidden="true"><span /><span /><span /></span>
        <span>Snap is weighing its options</span>
      </>
    )
  } else {
    content = children
  }

  return (
    <div
      className={`flex min-h-12 items-center justify-between gap-4 rounded-[8px] px-4 py-2.5 font-sans text-[14px] transition-colors duration-300 ${tone}`}
      role={error ? 'alert' : undefined}
      aria-live={error ? undefined : 'polite'}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">{content}</div>
      {action}
    </div>
  )
}

/** Board left, panel right; stacks on narrow screens. */
export function DemoLayout({ board, panel }: { board: ReactNode; panel: ReactNode }) {
  return (
    <div className="grid items-start gap-x-14 gap-y-8 min-[960px]:grid-cols-[minmax(0,600px)_minmax(260px,340px)]">
      <div className="grid gap-3">{board}</div>
      <aside className="grid content-start gap-8">{panel}</aside>
    </div>
  )
}
