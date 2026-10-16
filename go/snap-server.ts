/**
 * Local route that lets the browser talk to SubQ Snap without seeing your API key.
 *
 * The browser POSTs `{ state, questions }` to /api/decide. This middleware runs
 * inside the Vite server (`npm run dev` and `npm run preview`), checks the
 * request, adds `model` and your `SUBQ_API_KEY`, and forwards it to the SubQ
 * Decisions API. The key is read from `.env` on the server and is never sent
 * to the browser or included in the build.
 *
 * Docs: https://docs.subq.ai/endpoints/decisions-api/
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const MODEL = 'subq-snap-preview'
const DEFAULT_URL = 'https://api.subq.ai/v1/systemone'
const TIMEOUT_MS = 60_000
const MAX_BODY_BYTES = 512 * 1024
const MAX_STATE_CHARS = 200_000
const MAX_INSTRUCTIONS_CHARS = 4_000
const MAX_OPTION_CHARS = 100
const MAX_DESCRIPTION_CHARS = 1_000
// Decisions API limits: 1-16 questions per request, 2-255 options per choice question.
const MAX_QUESTIONS = 16
const MIN_OPTIONS = 2
const MAX_OPTIONS = 255
// Sudoku sends at most ceil(81 / 16) = 6 requests at once.
const MAX_IN_FLIGHT = 6

const UPSTREAM_ERRORS: Record<number, string> = {
  400: 'SubQ rejected the request',
  401: 'SubQ rejected your API key. Check SUBQ_API_KEY in .env',
  402: 'Out of SubQ credits',
  403: 'Your API key can’t use SubQ Snap',
  422: 'SubQ rejected the request',
  429: 'Rate limit reached, try again shortly',
}

type ChoiceQuestion = { type: 'choice'; instructions: string; criteria: Record<string, string> }
type DecideRequest = { state: { text: string }; questions: Record<string, ChoiceQuestion> }
type Answer = { choice: string; probabilities: Record<string, number>; confidence: number | null }

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

// Names that would change an object's prototype instead of adding a key.
const RESERVED_NAMES = new Set(['__proto__', 'constructor', 'prototype'])

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A probability in [0, 1], or null. */
function prob(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null
}

/** Checks the browser's request and copies only the fields Snap needs. */
function parseRequest(body: unknown): DecideRequest {
  const bad = (msg: string): never => {
    throw new HttpError(422, msg)
  }
  if (!isRecord(body)) bad('Body must be a JSON object')
  const { state, questions } = body as Record<string, unknown>
  if (!isRecord(state) || typeof state.text !== 'string' || !state.text || state.text.length > MAX_STATE_CHARS) {
    bad(`state.text must be 1 to ${MAX_STATE_CHARS} characters`)
  }
  if (!isRecord(questions)) bad('questions must be an object')
  const entries = Object.entries(questions as Record<string, unknown>)
  if (entries.length < 1 || entries.length > MAX_QUESTIONS) bad(`Send 1 to ${MAX_QUESTIONS} questions`)

  const out: Record<string, ChoiceQuestion> = {}
  for (const [id, q] of entries) {
    if (!id || id.length > MAX_OPTION_CHARS || RESERVED_NAMES.has(id)) bad('Question names must be 1 to 100 characters')
    if (!isRecord(q) || q.type !== 'choice') bad(`Question "${id}" must be a choice question`)
    const { instructions, criteria } = q as Record<string, unknown>
    if (typeof instructions !== 'string' || !instructions || instructions.length > MAX_INSTRUCTIONS_CHARS) {
      bad(`Question "${id}" needs instructions of 1 to ${MAX_INSTRUCTIONS_CHARS} characters`)
    }
    if (!isRecord(criteria)) bad(`Question "${id}" needs criteria`)
    const options = Object.entries(criteria as Record<string, unknown>)
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      bad(`Question "${id}" needs ${MIN_OPTIONS} to ${MAX_OPTIONS} options`)
    }
    const clean: Record<string, string> = {}
    for (const [key, desc] of options) {
      if (!key || key.length > MAX_OPTION_CHARS || RESERVED_NAMES.has(key)) bad('Option names must be 1 to 100 characters')
      if (typeof desc !== 'string' || desc.length > MAX_DESCRIPTION_CHARS) bad('Option descriptions must be strings')
      clean[key] = desc as string
    }
    out[id] = { type: 'choice', instructions: instructions as string, criteria: clean }
  }
  return { state: { text: (state as { text: string }).text }, questions: out }
}

/** Keeps only answers for questions we asked whose choice is one of the offered options. */
function cleanAnswers(data: unknown, req: DecideRequest): Record<string, Answer> {
  const raw = isRecord(data) && isRecord(data.answers) ? data.answers : null
  if (!raw) throw new HttpError(502, 'SubQ Snap returned an unexpected response')
  const answers: Record<string, Answer> = {}
  for (const [id, a] of Object.entries(raw)) {
    const q = Object.hasOwn(req.questions, id) ? req.questions[id] : undefined
    if (!q || !isRecord(a)) continue
    const choice = a.choice
    if (typeof choice !== 'string' || !Object.hasOwn(q.criteria, choice)) continue
    const probabilities: Record<string, number> = {}
    if (isRecord(a.probabilities)) {
      for (const [k, v] of Object.entries(a.probabilities)) {
        const p = prob(v)
        if (Object.hasOwn(q.criteria, k) && p !== null) probabilities[k] = p
      }
    }
    answers[id] = { choice, probabilities, confidence: prob(a.confidence) }
  }
  return answers
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large')
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Body is not valid JSON')
  }
}

/**
 * Only accept requests from this page. Requiring a JSON content type makes
 * browsers send a CORS preflight, which this route never approves, and the
 * Origin check stops other sites from spending your credits through it.
 */
function checkSameOrigin(req: IncomingMessage) {
  // Vite already blocks unknown hosts; checking again keeps this safe if someone sets `allowedHosts: true`.
  const hostname = (req.headers.host ?? '').replace(/:\d+$/, '')
  if (!LOCAL_HOSTS.has(hostname)) throw new HttpError(403, 'Only localhost may use this route')
  const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (type !== 'application/json') throw new HttpError(415, 'Content-Type must be application/json')
  const fetchSite = req.headers['sec-fetch-site']
  if (fetchSite && fetchSite !== 'same-origin') throw new HttpError(403, 'Cross-site requests are not allowed')
  const origin = req.headers.origin
  if (origin) {
    let originHost: string
    try {
      originHost = new URL(origin).host
    } catch {
      throw new HttpError(403, 'Cross-site requests are not allowed')
    }
    if (originHost !== req.headers.host) throw new HttpError(403, 'Cross-site requests are not allowed')
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

/** Your key is only ever sent to SubQ: an https URL on subq.ai or one of its subdomains. */
function decisionsUrl(raw: string | undefined): string {
  const url = (raw ?? '').trim() || DEFAULT_URL
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('SUBQ_API_URL is not a valid URL')
  }
  const host = parsed.hostname
  if (parsed.protocol !== 'https:' || !(host === 'subq.ai' || host.endsWith('.subq.ai'))) {
    throw new Error('SUBQ_API_URL must be an https://*.subq.ai URL')
  }
  return parsed.href
}

export function snapServer(env: Record<string, string>): Plugin {
  const apiKey = (env.SUBQ_API_KEY ?? '').trim()
  const url = decisionsUrl(env.SUBQ_API_URL)
  let inFlight = 0

  async function handle(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST')
    checkSameOrigin(req)
    if (!apiKey) throw new HttpError(500, 'SUBQ_API_KEY is not set. Copy .env.example to .env and add your key')
    if (inFlight >= MAX_IN_FLIGHT) throw new HttpError(429, 'Too many requests at once')
    inFlight++
    try {
      await forward(req, res)
    } finally {
      inFlight--
    }
  }

  async function forward(req: IncomingMessage, res: ServerResponse) {
    const body = parseRequest(await readJson(req))
    const t0 = Date.now()
    let upstream: Response
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, ...body }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (e) {
      const timedOut = e instanceof Error && e.name === 'TimeoutError'
      throw new HttpError(timedOut ? 504 : 502, timedOut ? 'SubQ Snap did not respond in time' : 'Could not reach SubQ Snap')
    }

    if (!upstream.ok) {
      const status = upstream.status
      throw new HttpError(status in UPSTREAM_ERRORS ? status : 502, UPSTREAM_ERRORS[status] ?? `SubQ Snap returned ${status}`)
    }
    let data: unknown
    try {
      data = await upstream.json()
    } catch {
      throw new HttpError(502, 'SubQ Snap returned a non-JSON body')
    }
    send(res, 200, { answers: cleanAnswers(data, body), latency_ms: Date.now() - t0 })
  }

  const middleware = (req: IncomingMessage, res: ServerResponse) => {
    handle(req, res).catch((e: unknown) => {
      if (e instanceof HttpError) send(res, e.status, { detail: e.message })
      else send(res, 500, { detail: 'Unexpected server error' })
    })
  }

  return {
    name: 'subq-snap-server',
    configureServer(server) {
      server.middlewares.use('/api/decide', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/decide', middleware)
    },
  }
}
