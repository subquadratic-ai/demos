import Demo from './sudoku/SudokuDemo'

const TITLE = 'Sudoku'
const SUMMARY = 'Snap fills a cell only when it’s sure. Watch it solve, or race it.'

export default function App() {
  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pt-10 pb-16 sm:px-8">
      <header className="mb-10 max-w-[60ch]">
        <h1
          className="font-display font-normal leading-[1.04] tracking-[-0.025em] text-[var(--sq-content-primary)]"
          style={{ fontSize: 'clamp(34px, 4.4vw, 54px)' }}
        >
          {TITLE}
        </h1>
        <p className="mt-3 font-sans text-[15px] leading-relaxed text-[var(--sq-content-secondary)]">{SUMMARY}</p>
      </header>

      <section aria-label={`${TITLE} demo`}>
        <Demo />
      </section>

      <footer className="mt-16 font-sans text-[13px] text-[var(--sq-content-secondary)]">
        Powered by SubQ Snap through the{' '}
        <a
          href="https://docs.subq.ai/endpoints/decisions-api/"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--sq-content-primary)] underline decoration-[var(--sq-rule)] underline-offset-4 hover:decoration-[var(--sq-content-primary)]"
        >
          Decisions API
        </a>
        .
      </footer>
    </main>
  )
}
