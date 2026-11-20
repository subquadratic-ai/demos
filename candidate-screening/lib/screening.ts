/**
 * Candidate screening logic built on the Decisions API.
 *
 * We send the model one state per candidate (the job description + the resume)
 * and ask a few narrow questions. The model only makes the judgments; the code
 * below decides what happens next (advance / review / reject and ranking).
 */

import {
  type ChoiceAnswer,
  type DecisionResponse,
  type NoulAnswer,
  type Questions,
  type ScoreAnswer,
  decideWithRetry,
} from "./decisions";

// Base questions, asked for every candidate. One judgment per question.
export const SCREENING_QUESTIONS: Questions = {
  advance: {
    type: "noul",
    instructions:
      "Should this candidate advance to a recruiter phone screen for the role in the job description?",
    criteria: {
      true: "Meets the core must-have requirements with relevant, verifiable experience",
      false: "Missing core requirements or shows little relevant experience",
    },
  },
  recommendation: {
    type: "choice",
    instructions:
      "What hiring recommendation best fits this candidate for this specific role?",
    criteria: {
      strong_advance: "Clearly exceeds the requirements; prioritize for a screen",
      advance: "Meets the requirements; worth a phone screen",
      maybe: "Borderline or ambiguous; needs a human to review",
      reject: "Does not meet the needs of this role",
    },
  },
  skills_match: {
    type: "score",
    instructions:
      "How well do the candidate's skills and experience match the job description's requirements?",
    criteria: ["Weak match", "Partial match", "Strong match"],
  },
  seniority: {
    type: "score",
    instructions:
      "What seniority level does the resume demonstrate relative to the role?",
    criteria: ["Below the role's level", "At the role's level", "Above the role's level"],
  },
};

// Default must-haves (editable in the UI). Each line becomes a noul gate so the
// decision is explainable as a per-requirement checklist — structured
// "reasoning" instead of free text, which a decision model does not produce.
export const DEFAULT_REQUIREMENTS = [
  "5+ years building production backend services",
  "Typed backend language (Go, Java, or TypeScript/Node)",
  "Designed and operated distributed systems in production",
  "Relational databases with transactional correctness (Postgres/MySQL)",
  "Asynchronous processing / message queues (Kafka, SQS)",
  "Comfortable owning on-call",
  "Payments or fintech domain experience",
];

const MAX_REQUIREMENTS = 16;

/** Turn a list of requirement strings into one noul question each. */
function requirementQuestions(requirements: string[]): Questions {
  const q: Questions = {};
  requirements.forEach((text, i) => {
    q[`req_${i}`] = {
      type: "noul",
      instructions: `Does the candidate clearly meet this requirement for the role: "${text}"?`,
      criteria: {
        true: "The resume shows clear, relevant evidence of meeting this requirement",
        false: "The resume shows little or no evidence of meeting this requirement",
      },
    };
  });
  return q;
}

// ---- Result shapes --------------------------------------------------------

export type DistributionBucket = { key: string; label: string; p: number };

export type Requirement = {
  text: string;
  probability: number; // 0..1 that the candidate meets it
  met: boolean;
};

export type NextStep = "advance" | "review" | "reject";

export type CandidateResult = {
  id: string;
  name: string;
  nextStep: NextStep;
  advance: number;
  recommendation: {
    choice: string;
    confidence: number;
    distribution: DistributionBucket[];
  };
  skillsMatch: {
    score: number;
    label: string;
    confidence: number;
    distribution: DistributionBucket[];
  };
  seniority: {
    score: number;
    label: string;
    confidence: number;
    distribution: DistributionBucket[];
  };
  requirements: Requirement[];
  usage: DecisionResponse["usage"];
  rankScore: number;
};

export type ScreeningError = {
  id: string;
  name: string;
  error: string;
};

// Thresholds live in code so they're easy to tune from your own labeled data.
const ADVANCE_THRESHOLD = 0.5;
const CONFIDENCE_THRESHOLD = 0.6;
const REQUIREMENT_THRESHOLD = 0.5;

const prettyKey = (k: string) =>
  k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

function labelFor(answer: ScoreAnswer): string {
  return answer.legend[String(Math.round(answer.score))] ?? "";
}

/** Build an ordered distribution for a choice answer (criteria order). */
function choiceDistribution(answer: ChoiceAnswer): DistributionBucket[] {
  return Object.keys(answer.probabilities).map((key) => ({
    key,
    label: prettyKey(key),
    p: answer.probabilities[key],
  }));
}

/** Build an ordered distribution for a score answer (level order). */
function scoreDistribution(answer: ScoreAnswer): DistributionBucket[] {
  return Object.keys(answer.legend)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => ({
      key,
      label: answer.legend[key],
      p: answer.probabilities[key] ?? 0,
    }));
}

function deriveNextStep(
  advance: number,
  recommendation: ChoiceAnswer,
): NextStep {
  if (recommendation.confidence < CONFIDENCE_THRESHOLD) return "review";
  if (recommendation.choice === "maybe") return "review";
  if (recommendation.choice === "reject") return "reject";
  if (advance >= ADVANCE_THRESHOLD) return "advance";
  return "review";
}

/**
 * Screen a single candidate's resume against the job description.
 */
export async function screenCandidate(params: {
  id: string;
  name: string;
  jobDescription: string;
  resume: string;
  requirements?: string[];
  signal?: AbortSignal;
}): Promise<CandidateResult> {
  const requirements = (params.requirements ?? []).slice(0, MAX_REQUIREMENTS);

  const state = {
    job_description: params.jobDescription,
    resume: params.resume,
  };

  const questions: Questions = {
    ...SCREENING_QUESTIONS,
    ...requirementQuestions(requirements),
  };

  const result = await decideWithRetry({
    state,
    questions,
    signal: params.signal,
  });

  const advance = (result.answers.advance as NoulAnswer).noul;
  const recommendation = result.answers.recommendation as ChoiceAnswer;
  const skillsMatch = result.answers.skills_match as ScoreAnswer;
  const seniority = result.answers.seniority as ScoreAnswer;

  const requirementResults: Requirement[] = requirements.map((text, i) => {
    const p = (result.answers[`req_${i}`] as NoulAnswer).noul;
    return { text, probability: p, met: p >= REQUIREMENT_THRESHOLD };
  });

  const metCount = requirementResults.filter((r) => r.met).length;

  return {
    id: params.id,
    name: params.name,
    nextStep: deriveNextStep(advance, recommendation),
    advance,
    recommendation: {
      choice: recommendation.choice,
      confidence: recommendation.confidence,
      distribution: choiceDistribution(recommendation),
    },
    skillsMatch: {
      score: skillsMatch.score,
      label: labelFor(skillsMatch),
      confidence: skillsMatch.confidence,
      distribution: scoreDistribution(skillsMatch),
    },
    seniority: {
      score: seniority.score,
      label: labelFor(seniority),
      confidence: seniority.confidence,
      distribution: scoreDistribution(seniority),
    },
    requirements: requirementResults,
    usage: result.usage,
    // Rank by advance probability, then skills match, then requirements met.
    rankScore: advance * 100 + skillsMatch.score + metCount * 0.1,
  };
}
