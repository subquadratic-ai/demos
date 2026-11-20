/**
 * Generates the marketing use case's rulebook (../rulebook.json) from the
 * hand-written outline and clauses beside this file:
 *
 *   npm run generate:marketing
 *
 * The rulebook is synthetic, not indexed from a document: every leaf becomes
 * a section with the hand-written clause first, then supporting prose
 * (procedures, guidance, examples, cross-references, record-keeping notes)
 * drawn from sentence-template banks with slot fills, until the book reaches
 * its target page count at ~480 words per page. The PRNG is seeded, so the
 * output is byte-identical on every run.
 *
 * The prose is deliberately generic: it never adds a number, deadline or
 * threshold of its own, so it cannot contradict the clause it supports.
 *
 * A use case built from a real document does not need any of this: see
 * `npm run index` in the README.
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Preflight, Rulebook, TreeNode } from "@/lib/types";
import { CLAUSES } from "./clauses";
import { OUTLINE, RULEBOOK, type ClausedChapter } from "./outline";

// ---------------------------------------------------------------------------
// Deterministic randomness

type Rng = { next(): number; int(n: number): number; pick<T>(xs: readonly T[]): T; shuffle<T>(xs: readonly T[]): T[] };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a: a stable seed from the sample id, so each sample has its own stream. */
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function makeRng(seed: string): Rng {
  const next = mulberry32(hashSeed(seed));
  const rng: Rng = {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    shuffle: (xs) => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
  return rng;
}

// ---------------------------------------------------------------------------
// Sentence-template banks

type Banks = Record<string, readonly string[]>;

/** Slot fills common to every sample. World-specific banks are merged over these. */
const SHARED_BANKS: Banks = {
  product: ["Sublinear Save", "Sublinear Invest", "Sublinear Card", "Sublinear FX"],
  rationale: [
    "a single lapse can affect every customer who encounters the result",
    "the Company must be able to show, not merely assert, that it controls this risk",
    "experience shows that informal arrangements break down under deadline pressure",
    "customers and counterparties cannot be expected to verify what the Company tells them",
    "the cost of correcting a problem after the event is many times the cost of preventing it",
    "the people closest to a decision are rarely best placed to judge its risk",
  ],
  scopePhrase: [
    "every {asset} and every comparable item, whoever produces it",
    "activity in every channel and every market in which the Company operates",
    "employees, contractors and agencies alike",
    "both new items and items that are being reused or refreshed",
    "decisions made under time pressure as much as those made at leisure",
  ],
  purpose: [
    "the Company's conduct can be reconstructed from its records long after the people involved have moved on",
    "the standard applied does not depend on who happens to be on duty",
    "customers and counterparties are treated consistently",
    "problems are caught before they reach a customer, not after",
    "the Company can demonstrate control to anyone entitled to ask",
  ],
  test: [
    "what the recipient will actually see and understand",
    "whether the Company would be comfortable explaining the decision to a regulator",
    "whether the evidence on file would persuade an informed sceptic",
    "whether the record shows who decided what, and when",
    "whether the outcome would be the same if the deadline were a week later",
  ],
  edgeCase: [
    "the item is only seen by a small audience",
    "an agency rather than an employee produced the item",
    "the item repeats something that was accepted last year",
    "the deadline is close and the change seems minor",
    "a senior manager has already seen the item",
    "the amount or audience involved is small",
    "the counterparty is well known to the team",
  ],
  wrongTest: [
    "who produced it",
    "how many people see it",
    "how much time is available",
    "who else has looked at it",
    "the intention behind it",
    "how small the amount seems",
  ],
  error: [
    "treat the requirement as a formality to be completed after the fact",
    "assume that a colleague has already dealt with it",
    "rely on a verbal assurance",
    "apply the requirement to the headline but not to the detail",
    "stop checking once the item is live or paid",
  ],
  nonFix: ["good intentions", "an email trail", "a verbal assurance", "a partial check", "the fact that nothing went wrong"],
  fix: [
    "the requirement is met in substance and the evidence is on file",
    "the item itself, as the recipient or counterparty will see it, meets the standard",
    "the record shows who decided what, and when",
  ],
  trigger: [
    "notices that the draft does not deal with the point covered by this section",
    "is asked by an agency whether this section applies",
    "receives a late request to change the item",
    "finds that the supporting evidence is older than expected",
    "is told that a competitor has done something similar",
    "is asked to proceed on the basis of an email rather than a record",
  ],
  proposal: [
    "a new creative route",
    "a change to the planned channel mix",
    "a shorter version of an accepted item",
    "reusing material from another market",
    "a faster timetable that skips the normal checks",
  ],
  ask: [
    "written confirmation on each point this section covers",
    "the supporting evidence",
    "a revised version that addresses the section in full",
    "a note of who will be accountable for each step",
  ],
  shortcut: [
    "skip the record because the item is urgent",
    "treat a verbal assurance as sufficient",
    "reuse an old decision for a new case",
    "approve something on behalf of an absent colleague",
    "proceed now and sort out the paperwork later",
  ],
  supportStep: [
    "Supporting documents are attached to the record before the request is submitted, so that the reviewer sees the evidence and not only the assertion.",
    "The relevant extract of this section is quoted in the request so that the point at issue is clear.",
    "Any earlier decision on the same or a similar {asset} is located and attached for consistency.",
  ],
  recordItems: [
    "the item as released or paid, the supporting evidence and the decision",
    "the request, the review comments and the final confirmation",
    "the dates on which the requirement was checked and by whom",
    "the reference, the version confirmed and any conditions attached",
  ],
  cadence: ["annual", "rolling", "risk-based"],
  frequency: ["each quarter", "monthly", "at each risk forum", "twice a year"],
  weakSpot: [
    "items that were changed after they were confirmed",
    "records completed after the event",
    "reliance on verbal assurances",
    "items handled under time pressure",
    "cases where the section was applied to the headline but not to the detail",
  ],
  history: [
    "clarified",
    "expanded to cover agency-produced items",
    "renumbered",
    "shortened",
    "aligned with the definitions in chapter 1",
  ],
};

/**
 * Paragraph templates by kind. Slots are `{name}`; a capitalised slot
 * (`{Role}`) capitalises the fill; a trailing digit (`{edgeCase2}`) draws a
 * second, different value from the same bank. `{anAsset}` prefixes the chosen
 * asset with the right article.
 */
const TEMPLATES: Record<string, readonly string[]> = {
  intent: [
    "The requirement in this section exists because {rationale}. It is read together with the rest of chapter {chapterId}, {chapterTitle}, and applies regardless of the channel, budget or urgency involved.",
    "This section applies to {scopePhrase}. Where it is unclear whether a particular case falls within it, the case is treated as in scope until {Reviewer} confirms otherwise, and the question and answer are noted on {system}.",
    "The purpose of this section is to make sure that {purpose}. It does not replace professional judgement, but it sets the floor below which judgement may not go.",
    "{Role} is expected to know this section well enough to apply it without looking it up, and to recognise the situations in which {reviewer} should be consulted. The test applied throughout is a practical one: {test}.",
    "This section is one of the controls on which the Company relies when it tells its regulators and its board that {assurance}. For that reason it is applied in substance and not merely in form.",
  ],
  procedure: [
    "Procedure. (1) {Role} identifies whether this section applies to the {asset} in question and records the conclusion on {system}. (2) {supportStep} (3) {Reviewer} checks the item against this section and either confirms the position or returns it with comments. (4) Comments are addressed in full and the item is resubmitted; partial resubmissions are not accepted. (5) The decision and its reference are recorded before the {asset} is released or acted upon.",
    "Procedure. The steps below are followed in order and none is skipped. First, {role} collects the information this section calls for and checks it against the current version of the {asset}. Second, any point of doubt is raised with {reviewer} in writing, with the relevant extract attached. Third, the response is filed on {system} and the {asset} is updated to reflect it. Finally, {role} diarises any follow-up date that this section or the response requires.",
    "Procedure for changes. When an existing {asset} is changed, {role} compares the new version with the version last confirmed under this section and lists every difference. {Reviewer} decides whether the differences affect compliance with this section. A change that does is treated as a new {asset}; a change that does not is noted on {system} with the reason.",
    "Procedure for urgent cases. Urgency does not relax this section. Where time is short, {role} tells {reviewer} at the outset what the deadline is and why it exists, submits whatever is complete, and makes clear what is still to follow. {Reviewer} may give a conditional view, but the conditions are recorded and the {asset} is not released until they are met.",
    "Procedure at hand-over. When responsibility for {anAsset} passes from one person to another, the outgoing owner records on {system} the status of each requirement of this section, what has been confirmed and what remains open. The incoming owner acknowledges the record. Nothing is assumed to have been done because it is usually done.",
  ],
  guidance: [
    "Guidance. Teams sometimes ask whether this section applies when {edgeCase}. It does. The test is {test}, not {wrongTest}.",
    "Guidance. Where this section and a product or team procedure both apply, the stricter requirement is followed and the decision is noted on {system}. A procedure can add to this section; it cannot subtract from it.",
    "Guidance. {Reviewer} is the point of contact for questions about this section. Questions and the answers given are logged so that consistent positions are taken over time, and so that the next person to face the same question can find the answer.",
    "Guidance. A common error is to {error}. This section is not satisfied by {nonFix}; it is satisfied only when {fix}.",
    "Guidance. The section is written for the ordinary case. An unusual case is not an exemption; it is a reason to involve {reviewer} earlier and to record the reasoning more fully than usual.",
    "Guidance. When reading this section alongside an older {asset}, the current wording applies. Material that was acceptable under a previous edition is brought into line at its next review, or sooner if {reviewer} so decides.",
    "Guidance. Reasonableness is judged from the position of the Company, not the individual. Something that seemed sensible to a busy team at the time may still fall short of this section, and the record should show that the section was considered, not only that a decision was made.",
  ],
  example: [
    "Example: {Role} preparing {anAsset} for {product} {trigger}. They raise the question with {reviewer}, who confirms that this section applies. The {asset} is amended before it is released and the decision is recorded on {system}.",
    "Example: {Role} working on {product} {trigger}. Rather than proceed, they hold the {asset} and record the reason. {Reviewer} confirms the position within the normal turnaround and the {asset} is released with the point addressed.",
    "Example: An agency working on {product} proposes {proposal}. {Reviewer} reviews the proposal against this section and asks for {ask} before any work proceeds. The agency's revised proposal is accepted and filed with the engagement record.",
    "Example: During a routine check, {reviewer} finds {anAsset} relating to {product} that does not meet this section. {Role} is asked to correct it, the earlier version is withdrawn so that it cannot be reused by mistake, and the record is annotated with what was found and how it was fixed.",
    "Example: {Role} receives a request to {shortcut}. They decline, citing this section, and offer the compliant alternative instead. The request and the response are noted on {system} so that the same question does not have to be argued twice.",
    "Example: A new joiner asks whether this section really applies to {anAsset} as small as the one they are working on for {product}. Their manager explains that the section is about the nature of the item, not its size, and walks through the record that will be needed. The {asset} goes through the normal process and the question is added to the team's induction notes.",
  ],
  crossref: [
    "See also section {refId} ({refTitle}). Where both sections apply to the same {asset}, both are satisfied and the record notes each.",
    "Section {refId} ({refTitle}) deals with a related situation. The two sections are applied together, and a question that touches both is raised with {reviewer} once rather than twice.",
    "Nothing in this section relaxes section {refId} ({refTitle}) or any other requirement of this {docNoun}. Where the sections appear to pull in different directions, the stricter reading is applied and {reviewer} is told.",
    "Cross-reference. The record-keeping and escalation requirements that support this section are those of chapter {chapterId}; the related control in section {refId} ({refTitle}) is applied in parallel.",
    "This section is most often applied together with section {refId} ({refTitle}). Teams find it efficient to check the two at the same time and to make a single record covering both.",
  ],
  records: [
    "Records. The record for this section comprises {recordItems}. Records are held on {system} and retained in line with the retention requirements of this {docNoun}.",
    "Records. Where this section is applied to a decision, {role} notes the decision, the reasoning and the date on {system}. A decision that is not recorded is treated as not having been made.",
    "Records. Internal Audit samples records under this section as part of its {cadence} programme. Gaps found are reported to {escalation} and tracked to closure.",
    "Records. The record is made at the time, not reconstructed later. Where a record has to be completed after the event, for example following an emergency, it says so and gives the reason.",
    "Records. Records under this section are kept in a form that a person unfamiliar with the {asset} could follow: what was considered, what was decided, by whom and on what evidence. Abbreviations and internal shorthand are avoided.",
  ],
  responsibilities: [
    "Responsibilities. {Role} is accountable for compliance with this section in respect of the items they own. {Reviewer} provides second-line oversight and may escalate to {escalation}. Agencies and vendors acting for the Company carry the same responsibility under their contracts.",
    "Responsibilities. Line managers make sure that everyone in their team who handles {anAsset} knows this section and has completed the relevant training. {Reviewer} reports on compliance with this section to {escalation} {frequency}.",
    "Responsibilities. Accountability for this section cannot be delegated by forwarding an email. A person who asks someone else to carry out a step remains responsible for confirming that it was done and for the record that shows it.",
  ],
  monitoring: [
    "Monitoring. Compliance with this section is monitored through {monitor}. Findings are rated low, medium or high and reported to {escalation} {frequency}.",
    "Monitoring. {Reviewer} reviews a sample of items under this section {frequency} and looks in particular for {weakSpot}. Repeated findings against the same team lead to additional training and, where necessary, a review of that team's permissions.",
    "Monitoring. Results of monitoring under this section feed into the annual review of this {docNoun}, so that a requirement that is frequently misunderstood is clarified in the next edition rather than simply enforced more often.",
  ],
  interpretation: [
    "Interpretation. In this section, '{asset}' is read widely and includes drafts, variants and translations of the same item. 'Record' means an entry on {system} that identifies the item, the decision and the person responsible.",
    "Interpretation. Words defined in chapter 1 have the same meaning here. 'Promptly' means as soon as reasonably practicable and in any event within any period stated in this section; where none is stated, within the ordinary review turnaround.",
    "Interpretation. References to {reviewer} include any deputy formally authorised to act in that capacity. References to writing include email and entries on {system}, but not messages in chat tools unless they are copied to the record.",
  ],
  faq: [
    "Frequently asked. Does this section apply when {edgeCase}? Yes. Does it apply if {edgeCase2}? Yes. The only exemptions are those stated expressly in this {docNoun} or granted by a logged waiver.",
  ],
  history: [
    "Edition note. The wording of this section was {history} in the current edition. Arrangements made under the previous wording remain valid until their next scheduled review, after which this wording applies.",
    "Edition note. This section is unchanged in substance from the previous edition. Minor drafting changes were made for consistency with the rest of chapter {chapterId}.",
  ],
};

/** The kinds every section opens with, in this order, before the shuffled remainder. */
const OPENING_KINDS = ["intent", "procedure", "guidance", "example", "crossref", "records"] as const;
const REMAINING_KINDS = [
  "responsibilities",
  "monitoring",
  "interpretation",
  "guidance",
  "example",
  "faq",
  "crossref",
  "history",
  "procedure",
  "records",
  "guidance",
  "example",
  "intent",
] as const;

// ---------------------------------------------------------------------------
// Samples

/** The vocabulary that makes one sample's filler read like its own manual. */
interface World {
  /** "policy" | "Code" | "Handbook" — how the document refers to itself. */
  docNoun: string;
  banks: Banks;
}

interface SampleSpec {
  id: string;
  title: string;
  organisation: string;
  edition: string;
  targetPages: number;
  indexMs: number;
  rootSummary: string;
  chapters: ClausedChapter[];
  world: World;
}

const WORLD: World = {
  docNoun: "policy",
  banks: {
    ...SHARED_BANKS,
    role: ["the content owner", "the campaign lead", "the channel manager", "the product marketing manager", "the brand team"],
    reviewer: ["the Marketing Compliance Officer", "Compliance", "the Compliance reviewer", "Legal"],
    escalation: ["the Head of Compliance", "the Chief Marketing Officer", "the Marketing Risk Forum"],
    system: ["the review system", "the marketing compliance repository", "the campaign brief", "the approval record"],
    asset: ["landing page", "email", "paid social post", "app screen", "video script", "press release", "SMS", "display banner", "sales script"],
    monitor: [
      "the monthly post-publication sampling programme",
      "thematic reviews of live content",
      "exception reports from the review system",
      "complaint and query trends",
    ],
    assurance: [
      "its external communications are controlled",
      "every financial promotion was approved before it was published",
      "customers are told the whole story, not only the attractive part",
    ],
  },
};

/** The clauses live in their own file; join them to the outline here and fail loudly on a gap. */
function claused(): ClausedChapter[] {
  return OUTLINE.map((chapter) => ({
    ...chapter,
    leaves: chapter.leaves.map((leaf) => {
      const clause = CLAUSES[leaf.id];
      if (!clause) throw new Error(`clauses-a.ts has no clause for leaf ${leaf.id}`);
      return { ...leaf, clause };
    }),
  }));
}

const SPEC: SampleSpec = {
  ...RULEBOOK,
  indexMs: 192_000,
  rootSummary: "How Sublinear Financial advertises, communicates and pays for promotion: approvals, claims, pricing, disclosures, outbound messaging, social media, vendors and spend controls.",
  chapters: claused(),
  world: WORLD,
};

// ---------------------------------------------------------------------------
// Text generation

const WORDS_PER_PAGE = 480;
/** Words a section heading (number + title + spacing) costs on the page. */
const HEADING_WORDS = 12;
/** Words a chapter opener (title, summary, spacing) costs before its first section. */
const CHAPTER_OPENER_WORDS = 40;
/** Pages reserved for the title page, document control and the contents list. */
const FRONT_MATTER_PAGES = 2;
/** Contents entries per page when estimating the contents list. */
const CONTENTS_LINES_PER_PAGE = 45;
/** A section stops at the first paragraph that crosses its budget, so it overshoots by about half a paragraph. */
const EXPECTED_OVERSHOOT_WORDS = 28;

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function withArticle(noun: string): string {
  // Vowel-initial words, plus initialisms whose first letter is pronounced with a vowel ("an SMS").
  const vowel = /^[aeiou]/i.test(noun);
  const initialism = /^[A-Z]{2}/.test(noun) && /^[FHLMNRSX]/.test(noun);
  return (vowel || initialism ? "an " : "a ") + noun;
}

/** First sentence of a clause: the one-line summary used as the Choice criterion. */
export function firstSentence(text: string): string {
  const match = /^[\s\S]*?[.!?](?=["')]?\s)/.exec(text);
  return (match ? match[0] : text).trim();
}

interface FillContext {
  rng: Rng;
  banks: Banks;
  /** Slots with a single fixed value for this paragraph (ids, titles, the document noun). */
  fixed: Record<string, string>;
}

/**
 * Resolve `{slot}` placeholders. Within one paragraph the same slot always
 * gets the same fill, and two slots drawing on the same bank (`{edgeCase}`,
 * `{edgeCase2}`) get different values, so a paragraph never repeats itself.
 */
function fill(template: string, ctx: FillContext): string {
  const chosen = new Map<string, string>();
  const usedByBank = new Map<string, Set<string>>();

  const pick = (key: string): string => {
    const cached = chosen.get(key);
    if (cached !== undefined) return cached;
    let value: string;
    if (key in ctx.fixed) {
      value = ctx.fixed[key];
    } else if (key === "anAsset") {
      value = withArticle(pick("asset"));
    } else {
      const bankName = key.replace(/\d+$/, "");
      const bank = ctx.banks[bankName];
      if (!bank) throw new Error(`No bank for slot {${key}}`);
      const used = usedByBank.get(bankName) ?? new Set<string>();
      const fresh = bank.filter((v) => !used.has(v));
      value = expand(ctx.rng.pick(fresh.length > 0 ? fresh : bank));
      used.add(value);
      usedByBank.set(bankName, used);
    }
    chosen.set(key, value);
    return value;
  };

  const expand = (text: string): string =>
    text.replace(/\{([A-Za-z]+\d*)\}/g, (_, raw: string) => {
      const capitalise = raw[0] === raw[0].toUpperCase();
      const key = raw[0].toLowerCase() + raw.slice(1);
      const value = pick(key);
      return capitalise ? value[0].toUpperCase() + value.slice(1) : value;
    });

  return expand(template);
}

interface LeafRef {
  id: string;
  title: string;
}

/** Pick a cross-reference target: usually a sibling in the chapter, sometimes further afield. */
function pickReference(rng: Rng, self: LeafRef, siblings: LeafRef[], all: LeafRef[]): LeafRef {
  const pool = rng.next() < 0.7 ? siblings : all;
  const candidates = pool.filter((leaf) => leaf.id !== self.id);
  return rng.pick(candidates.length > 0 ? candidates : all.filter((leaf) => leaf.id !== self.id));
}

/** Expand one leaf into its full section text (clause first), to roughly `budget` words. */
function expandLeaf(
  rng: Rng,
  world: World,
  chapter: ClausedChapter,
  leaf: ClausedChapter["leaves"][number],
  allLeaves: LeafRef[],
  budget: number,
): string {
  const paragraphs: string[] = [leaf.clause];
  let words = countWords(leaf.clause);
  const siblings = chapter.leaves.map((l) => ({ id: l.id, title: l.title }));
  const usedTemplates = new Set<string>();
  const kinds = [...OPENING_KINDS, ...rng.shuffle(REMAINING_KINDS)];

  for (let i = 0; words < budget; i++) {
    // Past the planned list, keep cycling kinds so very long sections still vary.
    const kind = kinds[i % kinds.length];
    const bank = TEMPLATES[kind];
    const fresh = bank.filter((t) => !usedTemplates.has(t));
    const template = rng.pick(fresh.length > 0 ? fresh : bank);
    usedTemplates.add(template);

    const ref = pickReference(rng, leaf, siblings, allLeaves);
    const paragraph = fill(template, {
      rng,
      banks: world.banks,
      fixed: {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        refId: ref.id,
        refTitle: ref.title,
        docNoun: world.docNoun,
      },
    });
    paragraphs.push(paragraph);
    words += countWords(paragraph);
  }

  return paragraphs.join("\n\n");
}

// ---------------------------------------------------------------------------
// Tree building and page packing

interface Built {
  rulebook: Rulebook;
  leafCount: number;
}

function buildSample(spec: SampleSpec): Built {
  const rng = makeRng(spec.id);
  const leafCount = spec.chapters.reduce((n, c) => n + c.leaves.length, 0);
  const nodeCount = spec.chapters.length + leafCount;
  const allLeaves: LeafRef[] = spec.chapters.flatMap((c) => c.leaves.map((l) => ({ id: l.id, title: l.title })));

  // Word budget: the target, less front matter, chapter openers (each chapter
  // starts a fresh page, wasting half a page on average) and section headings.
  const frontPages = FRONT_MATTER_PAGES + Math.ceil(nodeCount / CONTENTS_LINES_PER_PAGE);
  const bodyWords =
    (spec.targetPages - frontPages) * WORDS_PER_PAGE -
    spec.chapters.length * (WORDS_PER_PAGE / 2 + CHAPTER_OPENER_WORDS) -
    leafCount * (HEADING_WORDS + EXPECTED_OVERSHOOT_WORDS);

  // Uneven section lengths read more naturally than uniform ones.
  const weights = allLeaves.map(() => 0.7 + rng.next() * 0.6);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  let cursor = frontPages * WORDS_PER_PAGE;
  let leafIndex = 0;
  const pageAt = (wordOffset: number) => Math.floor(wordOffset / WORDS_PER_PAGE) + 1;

  const chapterNodes: TreeNode[] = spec.chapters.map((chapter) => {
    // Chapters start on a new page.
    cursor = Math.ceil(cursor / WORDS_PER_PAGE) * WORDS_PER_PAGE + CHAPTER_OPENER_WORDS;

    const leaves: TreeNode[] = chapter.leaves.map((leaf) => {
      const budget = Math.round((bodyWords * weights[leafIndex++]) / weightSum);
      const text = expandLeaf(rng, spec.world, chapter, leaf, allLeaves, budget);
      const pageStart = pageAt(cursor);
      cursor += HEADING_WORDS + countWords(text);
      const pageEnd = pageAt(cursor - 1);
      return {
        nodeId: leaf.id,
        title: leaf.title,
        summary: firstSentence(leaf.clause),
        pageStart,
        pageEnd,
        text,
        children: [],
      };
    });

    return {
      nodeId: chapter.id,
      title: chapter.title,
      summary: chapter.summary,
      pageStart: leaves[0].pageStart,
      pageEnd: leaves[leaves.length - 1].pageEnd,
      children: leaves,
    };
  });

  const pages = pageAt(cursor - 1);
  // The root spans its chapters; the front matter before chapter 1 belongs to no node.
  const tree: TreeNode = {
    nodeId: "root",
    title: spec.title,
    summary: spec.rootSummary,
    pageStart: chapterNodes[0].pageStart,
    pageEnd: chapterNodes[chapterNodes.length - 1].pageEnd,
    children: chapterNodes,
  };

  const preflight: Preflight = {
    pages,
    pagesWithText: pages,
    tokens: pages * 650,
    contextTokens: 262_144,
    headingCandidates: nodeCount,
    warnings: [],
    // Reading a few hundred pages takes tens of seconds; scale with size, cap at 40s.
    elapsedMs: Math.min(40_000, 20_000 + pages * 60),
  };

  return {
    rulebook: {
      id: spec.id,
      title: spec.title,
      organisation: spec.organisation,
      source: "fixture",
      pages,
      preflight,
      tree,
      indexMs: spec.indexMs,
      indexer: "fixture",
    },
    leafCount,
  };
}

// ---------------------------------------------------------------------------
// Entry point

function main(): void {
  const out = resolve(dirname(fileURLToPath(import.meta.url)), "../rulebook.json");
  const { rulebook, leafCount } = buildSample(SPEC);
  const json = JSON.stringify(rulebook);
  writeFileSync(out, json);
  console.log(`${SPEC.id}: ${rulebook.pages} pages (target ${SPEC.targetPages}), ${leafCount} leaves, ${(json.length / 1024).toFixed(0)} KB`);
}

main();
