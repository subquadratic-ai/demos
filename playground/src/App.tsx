import Demo from './playground/PlaygroundDemo'

const TITLE = 'Playground'
const SUMMARY = 'Add a document, ask multiple-choice questions about it, and see the probability Snap gives every answer.'

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
