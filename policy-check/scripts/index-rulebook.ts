/**
 * Indexes a document into a use case's rulebook.json, with the same pipeline
 * as "Use your own rulebook" on the page: extract the text, pre-flight it,
 * build the PageIndex tree.
 *
 *   npm run index -- <document> --usecase <id> [--title "…"] [--organisation "…"] [--force]
 *
 * PDF (with a text layer), Word or Markdown. Snap classifies the headings
 * (SNAP_API_KEY in .env.local), or the PageIndex service builds the tree when
 * PAGEINDEX_API_URL is set. A new use case folder also gets a starter
 * index.ts and an empty samples.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { getConfig } from "@/lib/config";
import { buildTree } from "@/lib/pageindex/build";
import { extractDocument } from "@/lib/rulebook/extract";
import { preflight } from "@/lib/rulebook/preflight";
import { countLeaves } from "@/lib/rulebook/tree";
import { createSnapClient } from "@/lib/snap/client";
import type { Rulebook } from "@/lib/types";
import { USE_CASES } from "@/usecases";

interface Args {
  document: string;
  useCase: string;
  title?: string;
  organisation?: string;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--force") force = true;
    else if (arg.startsWith("--")) flags.set(arg.slice(2), argv[++i] ?? "");
    else positional.push(arg);
  }
  const [document] = positional;
  const useCase = flags.get("usecase");
  if (!document || !useCase) throw new Error('Usage: npm run index -- <document> --usecase <id> [--title "…"] [--organisation "…"] [--force]');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(useCase)) throw new Error(`--usecase must be lowercase letters, digits and dashes: "${useCase}"`);
  return { document, useCase, title: flags.get("title"), organisation: flags.get("organisation"), force };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = getConfig();
  const dir = join(process.cwd(), "usecases", args.useCase);
  const out = join(dir, "rulebook.json");
  if (existsSync(out) && !args.force) throw new Error(`${out} exists. Pass --force to replace it, then check the samples again with npm run check-samples.`);

  const startedAt = Date.now();
  const extracted = await extractDocument(new Uint8Array(readFileSync(args.document)), basename(args.document), "");
  const { pages } = extracted;
  const title = args.title ?? extracted.title;
  const checked = preflight(pages, config.snapContextTokens, Date.now() - startedAt);
  console.log(`Read ${pages.length} pages of "${title}" · ${checked.headingCandidates} heading candidates`);
  if (checked.pagesWithText === 0) throw new Error("No text layer found. Run OCR on the document first.");
  for (const warning of checked.warnings) console.log(`  warning: ${warning}`);

  let stage = "";
  const { tree, indexer } = await buildTree({
    pages,
    title,
    client: createSnapClient(config),
    config,
    onProgress: (progress) => {
      if (progress.stage && progress.stage !== stage) console.log(`  ${(stage = progress.stage)}`);
    },
  });

  const rulebook: Rulebook = {
    id: slug(title) || args.useCase,
    title,
    organisation: args.organisation ?? "",
    source: "fixture",
    pages: pages.length,
    preflight: checked,
    tree,
    indexMs: Date.now() - startedAt,
    indexer,
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(out, JSON.stringify(rulebook));
  console.log(`\nWrote ${out}: ${tree.children.length} chapters, ${countLeaves(tree)} clauses (${indexer} indexer, ${((Date.now() - startedAt) / 1000).toFixed(1)}s).`);

  const steps: string[] = [];
  if (!existsSync(join(dir, "index.ts"))) {
    writeFileSync(join(dir, "index.ts"), starter(args.useCase, title));
    steps.push(`Describe the use case in usecases/${args.useCase}/index.ts (kinds, placeholder, wording).`);
  }
  if (!existsSync(join(dir, "samples.json"))) writeFileSync(join(dir, "samples.json"), "[]\n");
  if (!USE_CASES[args.useCase]) {
    steps.push(`Register it in usecases/index.ts: import ${identifier(args.useCase)} from "./${args.useCase}"; and add it to USE_CASES.`);
  }
  steps.push(`Add sample items to usecases/${args.useCase}/samples.json, then check them against the live model: npm run check-samples -- --usecase ${args.useCase}`);
  steps.push(`Set USE_CASE=${args.useCase} in .env.local and run npm run dev.`);
  console.log(`\nNext:\n${steps.map((step, i) => `  ${i + 1}. ${step}`).join("\n")}`);
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function identifier(id: string): string {
  return id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function starter(id: string, title: string): string {
  const name = identifier(id);
  return `import type { UseCase } from "@/lib/usecase";

/** Checks items against ${title.replace(/\*\//g, "")}. */
const ${name}: UseCase = {
  id: ${JSON.stringify(id)},
  // The kinds of item checked here, tried in order against typed text (looksLike: /regex/); the last is the fallback.
  kinds: [{ kind: "item" }],
  question: ${JSON.stringify(`Is this within the ${title}?`)},
  placeholder: "Paste an item to check.",
};

export default ${name};
`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
