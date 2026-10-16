import type { ChoiceQuestion } from '../snap'

/** One editable option: what the user sees, plus an optional hint Snap reads. */
export type DraftOption = { label: string; description: string }
export type DraftQuestion = { id: string; instructions: string; options: DraftOption[] }
export type Preset = { id: string; title: string; blurb: string; filename: string; document: string; questions: DraftQuestion[] }

// Decisions API limits.
export const MAX_QUESTIONS = 16
export const MAX_OPTIONS = 255
export const MAX_DOC_CHARS = 200_000
export const MAX_INSTRUCTIONS_CHARS = 4_000

/** Option key for a label: lowercase slug, unique within its question. */
export function optionKeys(options: DraftOption[]): string[] {
  const seen = new Set<string>()
  return options.map((o, i) => {
    const base = o.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || `option_${i + 1}`
    let key = base
    for (let n = 2; seen.has(key); n++) key = `${base}_${n}`
    seen.add(key)
    return key
  })
}

/** Why a question can't be sent yet, or null when it's ready. */
export function questionProblem(q: DraftQuestion): string | null {
  if (!q.instructions.trim()) return 'Write the question'
  if (q.instructions.length > MAX_INSTRUCTIONS_CHARS) return `Keep the question under ${MAX_INSTRUCTIONS_CHARS.toLocaleString()} characters`
  const named = q.options.filter((o) => o.label.trim())
  if (named.length < 2) return 'Add at least two options'
  if (named.length > MAX_OPTIONS) return `Use at most ${MAX_OPTIONS} options`
  return null
}

/**
 * The Decisions API payload for the drafts, plus key → label maps for showing
 * the answers. Options without a label are skipped; a blank description falls
 * back to the label, since every criterion needs text.
 */
export function buildQuestions(drafts: DraftQuestion[]) {
  const questions: Record<string, ChoiceQuestion> = {}
  const labels: Record<string, Record<string, string>> = {}
  for (const q of drafts) {
    const named = q.options.filter((o) => o.label.trim())
    const keys = optionKeys(named)
    questions[q.id] = {
      type: 'choice',
      instructions: q.instructions.trim(),
      criteria: Object.fromEntries(named.map((o, i) => [keys[i], o.description.trim() || o.label.trim()])),
    }
    labels[q.id] = Object.fromEntries(named.map((o, i) => [keys[i], o.label.trim()]))
  }
  return { questions, labels }
}

let nextId = 0
export const newQuestionId = () => `q${Date.now().toString(36)}${(nextId++).toString(36)}`

export const blankQuestion = (): DraftQuestion => ({ id: newQuestionId(), instructions: '', options: [] })

const q = (instructions: string, options: [string, string][]): DraftQuestion => ({
  id: newQuestionId(),
  instructions,
  options: options.map(([label, description]) => ({ label, description })),
})

const RESUME = `JOB: Assistant Regional Manager, Dunder Mifflin Paper Company (Scranton branch)
Reports to the Regional Manager. Leads a sales team of 5, owns the branch's largest client accounts, and runs the branch when the manager is away. 5+ years of B2B sales required; people-management experience strongly preferred. Must work well with the accounting, warehouse and HR teams.

---

CANDIDATE RÉSUMÉ

Dwight K. Schrute
Schrute Farms, Honesdale, PA · dschrute@schrutefarms.example

Summary
Top-performing paper salesman with 12 years at Dunder Mifflin Scranton. Salesman of the Year, nine consecutive quarters. Volunteer sheriff's deputy. Black belt in Goju-Ryu karate.

Experience
Assistant to the Regional Manager, Dunder Mifflin Scranton — 2005–present
- Highest sales numbers in the Northeast region for 9 straight quarters.
- Kept the Scranton branch's biggest accounts during the Staples price war.
- Ran the office fire-safety program (one incident; under review).
- Acting Regional Manager for 3 weeks in 2011. Sales went up; morale went down.

Sales Associate, Staples (Nashua, NH) — 2007 (one month)
- Hired away while undercover. Returned to Dunder Mifflin.

Owner and Operator, Schrute Farms (beet farm and agrotourism bed & breakfast) — 2001–present
- Grows and sells beets; manages seasonal staff (cousin Mose).

Skills
B2B paper sales, account retention, negotiation, beet cultivation, survival skills, self-defense

References
Available on request. Do not contact Jim Halpert.`

const LEAD = `INBOUND DEMO REQUEST (website form, submitted Tuesday 9:14am)

Name: Ryan Howard
Title: VP of North East Sales and Digital Innovation
Company: Dunder Mifflin Infinity (Dunder Mifflin Paper Company)
Company size: 500–1,000 employees
Country: United States

What are you hoping to solve?
"Dunder Mifflin Infinity handles ~30k online paper orders a day and every one goes through an LLM that decides: approve, send to a salesperson, or ask the customer for missing info. Our inference bill tripled this quarter. Most of these are simple routing calls. We need something faster and cheaper than GPT-class models. Budget is approved for Q1 and David Wallace wants a pilot before the next shareholder meeting. IT (Nick) will need a SOC 2 report."

How did you hear about us? Someone at the WUPHF.com launch party.

ENRICHMENT NOTES (from CRM)
- Dunder Mifflin: mid-market paper and office-supply distributor, 13 regional branches.
- Tech stack signals: AWS, Python, OpenAI API.
- No prior contact. Ryan attended our webinar on decision models last month (left after 6 minutes).`

const TICKET = `From: bob.vance@vancerefrigeration.example
To: support@dundermifflin.example
Subject: URGENT — charged twice and now locked out

Hi,

This is Bob Vance, Vance Refrigeration. I upgraded our Dunder Mifflin Infinity account to the Business plan yesterday and my card was charged $480 twice (two identical charges on the 14th). When I tried to log in this morning to download invoices for our accountant, I got "account suspended — payment issue". My whole office is out of paper, the copier is jammed, and we have a client walkthrough at 3pm today.

Please fix this ASAP and refund the duplicate charge. Honestly pretty frustrated. This is the second billing problem in two months, and Phyllis says Kevin in your accounting team still hasn't fixed the last one.

Bob Vance
Vance Refrigeration`

export function makePresets(): Preset[] {
  return [
    {
      id: 'candidate',
      title: 'Screen a candidate',
      blurb: 'Dwight’s résumé for Assistant Regional Manager: level, fit and next step.',
      filename: 'resume-dwight-schrute.txt',
      document: RESUME,
      questions: [
        q('What level does this candidate operate at?', [
          ['Junior', 'Under 3 years; works a defined territory'],
          ['Mid', '3 to 5 years; owns accounts end to end'],
          ['Senior', '5+ years; top performer who mentors others'],
          ['Manager', 'Has led a team or run a branch'],
        ]),
        q('How well does the candidate fit the job described at the top?', [
          ['Strong fit', 'Meets the must-haves and most of the preferred experience'],
          ['Partial fit', 'Meets some must-haves; real gaps to probe'],
          ['Weak fit', 'Missing core requirements'],
        ]),
        q('What should the recruiter do next?', [
          ['Advance', 'Move to a technical interview'],
          ['Hold', 'Keep warm; revisit if the pipeline thins'],
          ['Reject', 'Send a decline'],
        ]),
      ],
    },
    {
      id: 'lead',
      title: 'Qualify a lead',
      blurb: 'Ryan’s demo request for Dunder Mifflin Infinity: ICP fit, stage and priority.',
      filename: 'inbound-dunder-mifflin-infinity.txt',
      document: LEAD,
      questions: [
        q('Does this lead match our ideal customer: a mid-size or larger company running high-volume LLM decisions in production?', [
          ['Yes', 'Clear match on size and workload'],
          ['Partly', 'Some signals match, others unclear'],
          ['No', 'Wrong size, wrong workload, or no production use'],
        ]),
        q('What buying stage is the lead in?', [
          ['Exploring', 'Learning about the space, no project yet'],
          ['Evaluating', 'Active project, comparing options'],
          ['Ready to buy', 'Budget and timeline set, wants to start'],
        ]),
        q('How should sales prioritise this lead?', [
          ['Hot', 'Contact today'],
          ['Warm', 'Contact this week'],
          ['Cold', 'Add to nurture sequence'],
        ]),
      ],
    },
    {
      id: 'support',
      title: 'Triage a ticket',
      blurb: 'Bob Vance was charged twice: queue, urgency and sentiment.',
      filename: 'ticket-vance-refrigeration.txt',
      document: TICKET,
      questions: [
        q('Which queue should this ticket go to?', [
          ['Billing', 'Charges, refunds, invoices, plans'],
          ['Bug', 'Something in the product is broken'],
          ['How-to', 'Question about using the product'],
          ['Account access', 'Login, suspension, permissions'],
        ]),
        q('How urgent is it?', [
          ['P1', 'Blocking a team now; respond within the hour'],
          ['P2', 'Degraded but working; respond today'],
          ['P3', 'No time pressure'],
        ]),
        q("What is the customer's sentiment?", [
          ['Positive', ''],
          ['Neutral', ''],
          ['Frustrated', 'Annoyed but still engaged'],
          ['At risk', 'Signals they might leave'],
        ]),
      ],
    },
  ]
}
