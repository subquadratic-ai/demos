import { useCallback, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronUp, FileText, Inbox, Paperclip, Pencil, Plus, Sparkles, Target, UserSearch, X } from 'lucide-react'
import { normalise, SnapError, useSnap, type SnapAnswer } from '../snap'
import { pctLabel } from '../format'
import { TextButton } from '../ui'
import {
  blankQuestion,
  buildQuestions,
  makePresets,
  MAX_DOC_CHARS,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  optionKeys,
  questionProblem,
  type DraftQuestion,
  type Preset,
} from './presets'

// Files are read as text in the browser. PDF and Word need a parser, so this demo asks for pasted text instead.
const BINARY_EXTENSIONS = ['.pdf', '.docx', '.doc']
const ACCEPT = '.txt,.md,.csv,.json,.jsonl,.xml,.yaml,.yml,.html'
const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024
const PRESET_ICONS: Record<string, typeof Target> = { candidate: UserSearch, lead: Target, support: Inbox }
const PRESET_COLORS: Record<string, string> = { candidate: 'var(--accent-blue)', lead: 'var(--accent-green)', support: 'var(--accent-orange)' }

/** One colour per step so the eye can follow document → questions; gold stays Snap's. */
const STEPS = {
  document: { bg: 'var(--accent-blue)', fg: 'var(--sq-surface-primary)' },
  questions: { bg: 'var(--accent-orange)', fg: 'var(--sq-surface-primary)' },
}

type Run = {
  answers: Record<string, SnapAnswer>
  labels: Record<string, Record<string, string>>
  /** What each question looked like when sent, so later edits mark its answer stale. */
  sent: Record<string, string>
  doc: string
}

const signature = (q: DraftQuestion) => JSON.stringify([q.instructions, q.options])

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sq-content-primary)]'
const card = 'rounded-[10px] border border-[var(--sq-rule)] bg-[var(--sq-surface-primary)]'
const iconButton = `grid size-7 shrink-0 place-items-center rounded-full text-[var(--sq-content-secondary)] transition-colors hover:bg-[var(--sq-surface-secondary)] hover:text-[var(--sq-content-primary)] ${focusRing}`

export default function PlaygroundDemo() {
  const { askSnap } = useSnap()
  const presets = useMemo(makePresets, [])
  const [filename, setFilename] = useState('')
  const [doc, setDoc] = useState('')
  const [questions, setQuestions] = useState<DraftQuestion[]>(() => [blankQuestion()])
  const [run, setRun] = useState<Run | null>(null)
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const isEmpty = !doc.trim() && questions.every((q) => !q.instructions.trim() && q.options.length === 0)

  const reset = (next: { filename: string; doc: string; questions: DraftQuestion[] }) => {
    controllerRef.current?.abort()
    setFilename(next.filename)
    setDoc(next.doc)
    setQuestions(next.questions)
    setRun(null)
    setError(null)
    setUploadError(null)
    setThinking(false)
  }
  const loadPreset = (p: Preset) => reset({ filename: p.filename, doc: p.document, questions: p.questions })
  const clearAll = () => reset({ filename: '', doc: '', questions: [blankQuestion()] })

  const readFile = async (file: File) => {
    setUploadError(null)
    const name = file.name
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : ''
    setUploading(true)
    try {
      if (BINARY_EXTENSIONS.includes(ext)) throw new Error('PDF and Word files need a parser. Copy the text and paste it in instead')
      if (file.size > MAX_TEXT_FILE_BYTES) throw new Error('That file is over 10 MB')
      const text = await file.text()
      if (!text.trim()) throw new Error('No text found in that file')
      setFilename(name)
      setDoc(text)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void readFile(file)
  }

  const updateQuestion = (id: string, patch: (q: DraftQuestion) => DraftQuestion) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? patch(q) : q)))

  const docTooLong = doc.length > MAX_DOC_CHARS
  const blocker = !doc.trim()
    ? 'Add a document to ask about'
    : docTooLong
      ? `Trim the document to ${MAX_DOC_CHARS.toLocaleString()} characters`
      : questions.map((q, i) => {
          const p = questionProblem(q)
          return p && (questions.length > 1 ? `Question ${i + 1}: ${p.toLowerCase()}` : p)
        }).find(Boolean) ?? null

  const ask = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const { questions: payload, labels } = buildQuestions(questions)
    setThinking(true)
    setError(null)
    try {
      const answers = await askSnap(doc, payload, controller.signal)
      if (controller.signal.aborted) return
      if (!Object.keys(answers).length) throw new SnapError('Snap returned no answers', 502)
      setRun({ answers, labels, doc, sent: Object.fromEntries(questions.map((q) => [q.id, signature(q)])) })
    } catch (e) {
      if (controller.signal.aborted) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!controller.signal.aborted) setThinking(false)
    }
  }, [askSnap, doc, questions])

  const status = error ? `Snap couldn’t answer. ${error}.` : blocker
  const statusClass = error ? 'text-[var(--accent-red)]' : 'text-[var(--sq-content-secondary)]'

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !blocker && !thinking) {
      e.preventDefault()
      void ask()
    }
  }

  return (
    <div className="grid gap-6" onKeyDown={onKeyDown}>
      <div className="grid items-start gap-x-8 gap-y-8 min-[960px]:grid-cols-2">
        <section className="grid min-w-0 gap-2" aria-label="Document">
          <Step n={1} color={STEPS.document}>Add a document</Step>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`${card} overflow-hidden transition-[border-color,box-shadow] focus-within:border-[var(--accent-blue)] focus-within:shadow-[0_0_0_3px_var(--accent-blue-soft)] ${
              dragging ? 'border-[var(--accent-blue)] shadow-[0_0_0_3px_var(--accent-blue-soft)]' : ''
            }`}
          >
            {filename && (
              <div className="flex items-center gap-2 border-b border-[var(--sq-rule)] bg-[var(--accent-blue-soft)] px-3 py-2">
                <FileText className="size-4 shrink-0 text-[var(--accent-blue)]" strokeWidth={1.75} aria-hidden="true" />
                <span className="truncate font-sans text-[13px] font-medium text-[var(--sq-content-primary)]">{filename}</span>
                <button type="button" className={`${iconButton} ml-auto size-6`} aria-label="Remove file" onClick={() => reset({ filename: '', doc: '', questions })}>
                  <X className="size-3.5" strokeWidth={1.75} />
                </button>
              </div>
            )}
            <textarea
              value={doc}
              onChange={(e) => {
                setDoc(e.target.value)
                if (!e.target.value) setFilename('')
              }}
              placeholder="Paste a résumé, an email, a contract, meeting notes… or drop a file here."
              aria-label="Document text"
              spellCheck={false}
              className="block max-h-[560px] min-h-[220px] w-full resize-none bg-transparent px-4 py-3 font-sans text-[14px] leading-relaxed text-[var(--sq-content-primary)] [field-sizing:content] placeholder:text-[var(--sq-content-secondary)] focus:outline-none min-[960px]:min-h-[320px]"
            />
            <div className="flex items-center justify-between gap-3 border-t border-[var(--sq-rule)] px-2 py-1.5">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading || thinking}
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-sans text-[13px] text-[var(--sq-content-secondary)] transition-colors hover:bg-[var(--sq-surface-secondary)] hover:text-[var(--sq-content-primary)] disabled:opacity-40 ${focusRing}`}
              >
                <Paperclip className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                {uploading ? 'Reading file…' : 'Attach file'}
              </button>
              <span className={`pr-2 font-sans text-[12px] tabular-nums ${docTooLong ? 'text-[var(--accent-red)]' : 'text-[var(--sq-content-secondary)]'}`}>
                {doc.length ? `${doc.length.toLocaleString()} characters` : 'Text, Markdown, CSV or JSON'}
              </span>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void readFile(file)
                e.target.value = ''
              }}
            />
          </div>
          {uploadError && (
            <p role="alert" className="font-sans text-[13px] text-[var(--accent-red)]">
              {uploadError}.
            </p>
          )}
        </section>

        <section className="grid min-w-0 gap-2" aria-label="Questions" aria-live="polite">
          <Step n={2} color={STEPS.questions} hint="Snap picks one option each and shows its odds">Ask questions</Step>
          <ol className="grid gap-2.5">
            {questions.map((q, qi) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={qi}
                removable={questions.length > 1}
                onChange={(patch) => updateQuestion(q.id, patch)}
                onRemove={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}
                thinking={thinking}
                result={
                  run?.sent[q.id]
                    ? {
                        answer: run.answers[q.id],
                        labels: run.labels[q.id] ?? {},
                        stale: run.doc !== doc || run.sent[q.id] !== signature(q),
                      }
                    : undefined
                }
              />
            ))}
          </ol>
          {questions.length < MAX_QUESTIONS && (
            <div>
              <TextButton onClick={() => setQuestions((qs) => [...qs, blankQuestion()])}>
                <span className="inline-flex items-center gap-1">
                  <Plus className="size-3.5" strokeWidth={1.75} aria-hidden="true" /> Add question
                </span>
              </TextButton>
            </div>
          )}
        </section>
      </div>

      <div
        className={`sticky bottom-4 z-10 grid gap-1.5 rounded-[10px] border bg-[var(--sq-surface-primary)] p-2 shadow-[0_8px_24px_color-mix(in_srgb,var(--sq-content-primary)_8%,transparent)] ${
          error ? 'border-[var(--accent-red)]' : 'border-[var(--sq-rule)]'
        }`}
      >
        {/* Narrow screens: the status gets its own line so the controls keep theirs. */}
        <p role={error ? 'alert' : undefined} className={`px-2 pt-1 font-sans text-[12.5px] min-[520px]:hidden ${statusClass} ${status ? '' : 'hidden'}`}>
          {status}
        </p>
        <div className="flex items-center justify-between gap-3">
          <ExamplesMenu presets={presets} onPick={loadPreset} onCustom={clearAll} disabled={thinking} highlight={isEmpty} />
          <span className={`min-w-0 flex-1 font-sans text-[12.5px] leading-snug max-[519px]:hidden ${statusClass}`}>
            {status ?? `${questions.length} question${questions.length === 1 ? '' : 's'} · ⌘↵ to run`}
          </span>
          <TextButton strong onClick={() => void ask()} disabled={!!blocker || thinking}>
            {thinking ? 'Asking…' : run || error ? 'Ask again' : 'Ask Snap'}
          </TextButton>
        </div>
      </div>
    </div>
  )
}

type InlineResult = { answer: SnapAnswer | undefined; labels: Record<string, string>; stale: boolean }

function QuestionCard({
  question: q,
  index,
  removable,
  onChange,
  onRemove,
  thinking,
  result,
}: {
  question: DraftQuestion
  index: number
  removable: boolean
  onChange: (patch: (q: DraftQuestion) => DraftQuestion) => void
  onRemove: () => void
  thinking: boolean
  /** Snap's answer from the last run, when this question was in it. */
  result?: InlineResult
}) {
  const [draft, setDraft] = useState('')
  const addOption = () => {
    const label = draft.trim()
    if (!label || q.options.length >= MAX_OPTIONS) return
    onChange((x) => ({ ...x, options: [...x.options, { label, description: '' }] }))
    setDraft('')
  }
  const keys = optionKeys(q.options)
  const probs = result?.answer ? normalise(result.answer.probabilities) : {}
  const choice = result?.answer?.choice

  return (
    <li className={`${card} grid gap-3 p-3 pl-4 transition-[border-color,box-shadow] focus-within:border-[var(--accent-orange)] focus-within:shadow-[0_0_0_3px_var(--accent-orange-soft)]`}>
      <div className="flex items-start gap-2">
        <textarea
          value={q.instructions}
          onChange={(e) => onChange((x) => ({ ...x, instructions: e.target.value }))}
          placeholder={index === 0 ? 'Ask a multiple-choice question, e.g. Which team should handle this?' : 'Ask another question'}
          aria-label={`Question ${index + 1}`}
          rows={1}
          className="min-h-0 w-full resize-none bg-transparent pt-0.5 font-sans text-[15px] leading-snug text-[var(--sq-content-primary)] [field-sizing:content] placeholder:text-[var(--sq-content-secondary)] focus:outline-none"
        />
        {removable && (
          <button type="button" className={iconButton} aria-label={`Remove question ${index + 1}`} onClick={onRemove}>
            <X className="size-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>
      <ul className="flex flex-wrap items-center gap-1.5" aria-label={`Options for question ${index + 1}`}>
        {q.options.map((o, oi) => (
          <li
            key={keys[oi]}
            title={o.description || undefined}
            className="inline-flex items-center gap-0.5 rounded-full bg-[var(--accent-orange-soft)] py-0.5 pr-0.5 pl-3 font-sans text-[13px] text-[var(--sq-content-primary)]"
          >
            {o.label}
            <button
              type="button"
              aria-label={`Remove option ${o.label}`}
              onClick={() => onChange((x) => ({ ...x, options: x.options.filter((_, j) => j !== oi) }))}
              className={`grid size-5 place-items-center rounded-full text-[var(--sq-content-secondary)] hover:bg-[var(--sq-rule)] hover:text-[var(--sq-content-primary)] ${focusRing}`}
            >
              <X className="size-3" strokeWidth={2} />
            </button>
          </li>
        ))}
        <li className="min-w-[160px] flex-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(',', ''))}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === ',') {
                e.preventDefault()
                addOption()
              } else if (e.key === 'Backspace' && !draft && q.options.length) {
                onChange((x) => ({ ...x, options: x.options.slice(0, -1) }))
              }
            }}
            onBlur={addOption}
            placeholder={q.options.length ? 'Add option' : 'Add options, pressing Enter after each'}
            aria-label={`Add an option to question ${index + 1}`}
            maxLength={100}
            className="w-full bg-transparent px-1 py-0.5 font-sans text-[13px] text-[var(--sq-content-primary)] placeholder:text-[var(--sq-content-secondary)] focus:outline-none"
          />
        </li>
      </ul>

      {thinking && !questionProblem(q) ? (
        <div className="grid gap-2 border-t border-[var(--sq-rule)] pt-3" aria-hidden="true">
          <span className="h-5 w-1/3 animate-pulse rounded bg-[color-mix(in_srgb,var(--accent-gold)_24%,transparent)]" />
          <span className="h-1.5 w-full animate-pulse rounded bg-[var(--sq-surface-secondary)]" />
          <span className="h-1.5 w-3/4 animate-pulse rounded bg-[var(--sq-surface-secondary)]" />
        </div>
      ) : result ? (
        <div className={`grid gap-2.5 border-t border-[var(--sq-rule)] pt-3 transition-opacity ${result.stale ? 'opacity-50' : ''}`}>
          {choice ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="inline-flex items-baseline gap-2">
                  <span className="font-sans text-[12px] text-[var(--sq-content-secondary)]">Snap:</span>
                  <span className="font-display text-[22px] leading-tight tracking-[-0.01em] text-[var(--sq-content-primary)]">{result.labels[choice]}</span>
                </span>
                <span className="font-sans text-[14px] font-medium tabular-nums text-[var(--sq-content-primary)]">{pctLabel(probs[choice] ?? 0)}</span>
              </div>
              <ol className="grid gap-1.5">
                {Object.entries(result.labels)
                  .map(([key, label]) => ({ key, label, p: probs[key] ?? 0 }))
                  .sort((a, b) => b.p - a.p)
                  .map((o) => {
                    const isChoice = o.key === choice
                    return (
                      <li key={o.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_36px] items-center gap-3 font-sans text-[12px]">
                        <span className={`truncate ${isChoice ? 'text-[var(--sq-content-primary)]' : 'text-[var(--sq-content-secondary)]'}`}>{o.label}</span>
                        <span className="h-[4px] overflow-hidden rounded-full bg-[var(--sq-rule)]">
                          <span
                            className="block h-full rounded-full transition-[width] duration-500 ease-out"
                            style={{
                              width: `${Math.max(o.p * 100, 1.5)}%`,
                              background: isChoice ? 'var(--accent-gold)' : 'color-mix(in srgb, var(--sq-content-primary) 30%, transparent)',
                            }}
                          />
                        </span>
                        <span className="text-right tabular-nums text-[var(--sq-content-secondary)]">{pctLabel(o.p)}</span>
                      </li>
                    )
                  })}
              </ol>
            </>
          ) : (
            <p className="font-sans text-[13px] text-[var(--sq-content-secondary)]">Snap left this one unanswered.</p>
          )}
          {result.stale && <p className="font-sans text-[12px] text-[var(--sq-content-secondary)]">Edited since this run.</p>}
        </div>
      ) : null}
    </li>
  )
}

function ExamplesMenu({
  presets,
  onPick,
  onCustom,
  disabled,
  highlight,
}: {
  presets: Preset[]
  onPick: (p: Preset) => void
  /** Start over with a blank document and question. */
  onCustom: () => void
  disabled?: boolean
  /** Draw attention while the playground is empty. */
  highlight?: boolean
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  const item = `w-full rounded-[6px] px-3 py-2 text-left font-sans text-[13px] text-[var(--sq-content-primary)] hover:bg-[var(--sq-surface-secondary)] ${focusRing}`
  const choose = (fn: () => void) => () => {
    ref.current?.removeAttribute('open')
    fn()
  }
  return (
    <details ref={ref} className="relative">
      <summary
        aria-disabled={disabled}
        className={`inline-flex cursor-pointer list-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 font-sans text-[13px] transition-colors [&::-webkit-details-marker]:hidden ${focusRing} ${
          highlight
            ? 'border-[var(--accent-gold)] bg-[var(--accent-gold-soft)] font-medium text-[var(--sq-content-primary)]'
            : 'border-[var(--sq-rule)] text-[var(--sq-content-secondary)] hover:text-[var(--sq-content-primary)]'
        } ${disabled ? 'pointer-events-none opacity-40' : ''}`}
      >
        {highlight && <Sparkles className="size-3.5 text-[var(--accent-gold)]" strokeWidth={1.75} aria-hidden="true" />}
        {highlight ? 'Try an example' : 'Examples'}
        <ChevronUp className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
      </summary>
      <ul className={`${card} absolute bottom-full left-0 z-20 mb-2 grid w-[300px] gap-0.5 p-1 shadow-[0_12px_32px_color-mix(in_srgb,var(--sq-content-primary)_14%,transparent)]`}>
        <li className="border-b border-[var(--sq-rule)] pb-0.5">
          <button type="button" onClick={choose(onCustom)} className={`${item} flex items-center gap-2.5`}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--sq-surface-secondary)]">
              <Pencil className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="grid gap-0.5">
              <span className="font-medium">Custom</span>
              <span className="text-[12px] leading-snug text-[var(--sq-content-secondary)]">Start from a blank document</span>
            </span>
          </button>
        </li>
        {presets.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={choose(() => onPick(p))} className={`${item} flex items-center gap-2.5`}>
              <PresetIcon id={p.id} />
              <span className="grid gap-0.5">
                <span className="font-medium">{p.title}</span>
                <span className="text-[12px] leading-snug text-[var(--sq-content-secondary)]">{p.blurb}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}

function Step({ n, color, hint, children }: { n: number; color: { bg: string; fg: string }; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
      <span
        className="grid size-[22px] shrink-0 translate-y-[-1px] place-items-center self-center rounded-full font-sans text-[12px] font-semibold tabular-nums"
        style={{ background: color.bg, color: color.fg }}
        aria-hidden="true"
      >
        {n}
      </span>
      <h2 className="font-sans text-[15px] font-medium text-[var(--sq-content-primary)]">{children}</h2>
      {hint && <span className="font-sans text-[12px] text-[var(--sq-content-secondary)]">{hint}</span>}
    </div>
  )
}

function PresetIcon({ id }: { id: string }) {
  const Icon = PRESET_ICONS[id] ?? FileText
  const color = PRESET_COLORS[id] ?? 'var(--sq-content-primary)'
  return (
    <span
      className="grid size-7 shrink-0 place-items-center rounded-full"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      <Icon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
    </span>
  )
}
