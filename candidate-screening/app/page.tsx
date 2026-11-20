"use client";

import { useCallback, useRef, useState } from "react";

type NextStep = "advance" | "review" | "reject";

type DistributionBucket = { key: string; label: string; p: number };

type Requirement = { text: string; probability: number; met: boolean };

type CandidateResult = {
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
  usage: { input_tokens: number; output_tokens: number };
  rankScore: number;
};

type ScreeningError = { id: string; name: string; error: string };

type ScreenResponse = {
  results: CandidateResult[];
  errors: ScreeningError[];
  usage: { input_tokens: number; output_tokens: number };
};

const STEP_LABEL: Record<NextStep, string> = {
  advance: "Advance",
  review: "Review",
  reject: "Reject",
};

// Prefilled must-haves (edit freely; each line becomes a requirement gate).
const DEFAULT_REQUIREMENTS = [
  "5+ years building production backend services",
  "Typed backend language (Go, Java, or TypeScript/Node)",
  "Designed and operated distributed systems in production",
  "Relational databases with transactional correctness (Postgres/MySQL)",
  "Asynchronous processing / message queues (Kafka, SQS)",
  "Comfortable owning on-call",
  "Payments or fintech domain experience",
].join("\n");

// Shared palettes for the probability distributions.
const RECO_COLORS: Record<string, string> = {
  strong_advance: "#2f7d4f",
  advance: "#6fae86",
  maybe: "#a9731b",
  reject: "#b4322f",
};
const SCORE_COLORS = ["#d9d6cd", "#9bb0d6", "#2f4a9e"];

const prettyChoice = (c: string) =>
  c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

export default function Page() {
  const [jdText, setJdText] = useState("");
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [requirements, setRequirements] = useState(DEFAULT_REQUIREMENTS);
  const [resumes, setResumes] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ScreenResponse | null>(null);

  const resumeInput = useRef<HTMLInputElement>(null);
  const jdInput = useRef<HTMLInputElement>(null);

  const addResumes = useCallback((files: FileList | null) => {
    if (!files) return;
    setResumes((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size));
      const next = [...prev];
      for (const f of Array.from(files)) {
        if (!seen.has(f.name + f.size)) next.push(f);
      }
      return next;
    });
  }, []);

  const canSubmit = (jdText.trim() || jdFile) && resumes.length > 0 && !loading;

  async function onSubmit() {
    setError(null);
    setData(null);
    setLoading(true);
    try {
      const form = new FormData();
      if (jdFile) form.append("jd", jdFile);
      if (jdText.trim()) form.append("jdText", jdText.trim());
      form.append("requirements", requirements);
      for (const r of resumes) form.append("resumes", r);

      const res = await fetch("/api/screen", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setData(json as ScreenResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap">
      <div className="brand">
        <span className="wordmark">
          SubQ<span className="snap">Snap</span>
        </span>
        <span className="section-tag">Candidate Screening</span>
      </div>

      <header className="hero">
        <h1>Screen every candidate</h1>
        <p className="lead">
          <span className="snap">SubQ Snap</span> judges each resume against the
          role: a yes/no gate, a recommendation, a skills match, a seniority
          read, and each must-have requirement.{" "}
          <span className="code">Code</span> combines those judgments into an
          advance / review / reject call and ranks the shortlist — via{" "}
          <code>subq-snap-latest</code> on the Decisions API.
        </p>
      </header>

      <div className="grid">
        {/* Job description */}
        <section className="card">
          <h2>Job Description</h2>
          <label className="field">Paste the job description</label>
          <textarea
            placeholder="Role, must-have requirements, nice-to-haves…"
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
          />
          <div className="divider">or</div>
          <div
            className="dropzone"
            onClick={() => jdInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) setJdFile(f);
            }}
          >
            {jdFile ? (
              <span>
                <b>{jdFile.name}</b> · click to replace
              </span>
            ) : (
              <span>Drop or click to upload a JD (PDF, DOCX, TXT, MD)</span>
            )}
            <input
              ref={jdInput}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={(e) => setJdFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </section>

        {/* Resumes + requirements */}
        <section className="card">
          <h2>Resumes</h2>
          <div
            className={`dropzone${dragging ? " drag" : ""}`}
            onClick={() => resumeInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addResumes(e.dataTransfer.files);
            }}
          >
            <span>Drop or click to attach resumes (multiple allowed)</span>
            <input
              ref={resumeInput}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md"
              onChange={(e) => addResumes(e.target.files)}
            />
          </div>

          {resumes.length > 0 && (
            <ul className="filelist">
              {resumes.map((f, i) => (
                <li key={f.name + f.size + i}>
                  <span>{f.name}</span>
                  <button
                    title="Remove"
                    onClick={() =>
                      setResumes((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="field" style={{ marginTop: 18 }}>
            Must-have requirements — one per line (each becomes a gate)
          </label>
          <textarea
            className="reqs-input"
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
          />
        </section>
      </div>

      <div className="actions">
        <button className="primary" disabled={!canSubmit} onClick={onSubmit}>
          {loading
            ? "Screening…"
            : `Screen ${resumes.length || ""} candidate${
                resumes.length === 1 ? "" : "s"
              }`.trim()}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {data && <Results data={data} />}

      <div className="legend">
        <span>
          <span className="chip snap">SNAP</span>decision model
        </span>
        <span>
          <span className="chip code">CODE</span>thresholds &amp; ranking
        </span>
        <span>
          <span className="chip advance">ADVANCE</span>auto-move to screen
        </span>
        <span>
          <span className="chip review">REVIEW</span>send to a human
        </span>
        <span>
          <span className="chip reject">REJECT</span>pass on candidate
        </span>
      </div>
    </div>
  );
}

function Results({ data }: { data: ScreenResponse }) {
  const { results, errors, usage } = data;
  return (
    <section className="results">
      <div className="results-head">
        <h2>
          Results · {results.length} ranked
          {errors.length > 0 ? `, ${errors.length} failed` : ""}
        </h2>
        <span className="usage">
          {usage.input_tokens + usage.output_tokens} tokens ({usage.input_tokens}{" "}
          in / {usage.output_tokens} out)
        </span>
      </div>

      {results.length === 0 && errors.length === 0 && (
        <div className="empty">No candidates.</div>
      )}

      {results.map((c, i) => (
        <CandidateCard key={c.id} candidate={c} rank={i + 1} />
      ))}

      {errors.map((e) => (
        <div className="candidate" key={`err-${e.id}`}>
          <div className="top">
            <span className="name">{e.name}</span>
            <span className="pill reject">Failed</span>
          </div>
          <p className="errbox">{e.error}</p>
        </div>
      ))}
    </section>
  );
}

function CandidateCard({
  candidate: c,
  rank,
}: {
  candidate: CandidateResult;
  rank: number;
}) {
  return (
    <div className="candidate">
      <div className="top">
        <span className="name">
          <span className="rank">{rank}</span>
          {c.name}
        </span>
        <span className={`pill ${c.nextStep}`}>{STEP_LABEL[c.nextStep]}</span>
      </div>

      <div className="metrics">
        <SimpleMetric
          label="Advance (gate)"
          value={`${Math.round(c.advance * 100)}%`}
          ratio={c.advance}
          tone={c.advance >= 0.5 ? "green" : "amber"}
        />
        <DistMetric
          label="Recommendation"
          value={`${prettyChoice(c.recommendation.choice)} · ${Math.round(
            c.recommendation.confidence * 100,
          )}% conf`}
          distribution={c.recommendation.distribution}
          colorFor={(b) => RECO_COLORS[b.key] ?? "#9bb0d6"}
        />
        <DistMetric
          label="Skills match"
          value={c.skillsMatch.label}
          distribution={c.skillsMatch.distribution}
          colorFor={(_b, i) => SCORE_COLORS[i] ?? "#9bb0d6"}
        />
        <DistMetric
          label="Seniority"
          value={c.seniority.label}
          distribution={c.seniority.distribution}
          colorFor={(_b, i) => SCORE_COLORS[i] ?? "#9bb0d6"}
        />
      </div>

      {c.requirements.length > 0 && (
        <div className="reqs">
          <div className="mono-label" style={{ marginBottom: 12 }}>
            Requirements · {c.requirements.filter((r) => r.met).length}/
            {c.requirements.length} met
          </div>
          <ul className="req-list">
            {c.requirements.map((r, i) => (
              <li className="req-item" key={i}>
                <span className={`req-mark ${r.met ? "yes" : "no"}`}>
                  {r.met ? "✓" : "✕"}
                </span>
                <span className="txt">{r.text}</span>
                <span className="pct">{Math.round(r.probability * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SimpleMetric({
  label,
  value,
  ratio,
  tone,
}: {
  label: string;
  value: string;
  ratio: number;
  tone?: "green" | "amber";
}) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className="metric">
      <div className="metric-label">
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <div className={`bar${tone ? ` ${tone}` : ""}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DistMetric({
  label,
  value,
  distribution,
  colorFor,
}: {
  label: string;
  value: string;
  distribution: DistributionBucket[];
  colorFor: (b: DistributionBucket, index: number) => string;
}) {
  return (
    <div className="metric">
      <div className="metric-label">
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <div className="dist">
        {distribution.map((b, i) => (
          <span
            key={b.key}
            style={{
              width: `${Math.max(0, b.p) * 100}%`,
              background: colorFor(b, i),
            }}
            title={`${b.label}: ${Math.round(b.p * 100)}%`}
          />
        ))}
      </div>
      <div className="dist-legend">
        {distribution.map((b, i) => (
          <span className="k" key={b.key}>
            <span className="sw" style={{ background: colorFor(b, i) }} />
            {b.label} {Math.round(b.p * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}
