import type { ReactNode } from 'react'

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
          ? 'whitespace-nowrap bg-[var(--sq-content-primary)] px-4 py-2 font-medium text-[var(--sq-surface-primary)] hover:opacity-85'
          : 'py-1 text-[var(--sq-content-secondary)] underline-offset-4 hover:text-[var(--sq-content-primary)] hover:underline'
      }`}
    >
      {children}
    </button>
  )
}
