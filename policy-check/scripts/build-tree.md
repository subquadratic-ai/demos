# Building a rulebook tree

The app screens items against a rulebook held as a PageIndex-style tree
(`TreeNode` in `lib/types.ts`). This note covers how to produce that tree for a
real document, what shape the app expects, and how the shipped marketing
rulebook differs.

The quickest route is `npm run index -- <document> --usecase <id>`, which runs
the same pipeline as the upload and writes `usecases/<id>/rulebook.json`. The
rest of this note is for building the tree some other way.

## What the app expects

A `Rulebook` (see `lib/types.ts`) wraps one `TreeNode` root:

```ts
interface TreeNode {
  nodeId: string;     // stable and unique within the rulebook; "root" for the root
  title: string;
  summary: string;    // one line; used as the Choice criterion while descending
  pageStart: number;  // 1-based, inclusive
  pageEnd: number;
  text?: string;      // full clause text; REQUIRED on leaves (children.length === 0)
  children: TreeNode[];
}
```

Rules the screening engine relies on:

- **Leaf `text` is required.** Snap judges `applies_to_item` and `item_complies`
  against the leaf text, and the UI shows it beside every verdict.
- **Ids are stable.** Corrections, answers and pinned findings are keyed by
  `nodeId`, so regenerating a tree must not renumber nodes that did not move.
  The marketing rulebook uses `"<chapter>.<n>"` for leaves and `"<chapter>"` for chapters.
- **Summaries are one line.** The descent sends `title + summary` of each child
  as a Choice option; a first sentence that states the requirement works best.
- **Page ranges nest.** Children lie within their parent's range; a parent's
  range is the span of its children.
- Two or three levels is plenty. Deeper trees cost one Snap request per level.

## Regenerating a tree with PageIndex

[PageIndex](https://github.com/VectifyAI/PageIndex) builds a hierarchical
table-of-contents tree from a PDF, with per-node summaries and page ranges.

### Self-hosted

```bash
git clone https://github.com/VectifyAI/PageIndex && cd PageIndex
pip3 install -r requirements.txt
# PageIndex uses an LLM for summaries; set the key its README asks for.
python3 run_pageindex.py --pdf_path /path/to/policy.pdf \
  --if-add-node-summary yes --if-add-node-text yes --if-add-node-id yes
```

The output JSON (`results/<name>_structure.json`) has nodes shaped roughly as
`{ title, node_id, start_index, end_index, summary, text, nodes[] }`. Map them
to `TreeNode` as follows:

| PageIndex field          | TreeNode field | Notes                                           |
| ------------------------ | -------------- | ----------------------------------------------- |
| `node_id`                | `nodeId`       | Keep PageIndex ids, or renumber to `"3.4"` style once and then never again. |
| `title`                  | `title`        |                                                 |
| `summary`                | `summary`      | Trim to one sentence.                           |
| `start_index`            | `pageStart`    | PageIndex pages are 1-based like ours.          |
| `end_index`              | `pageEnd`      |                                                 |
| `text`                   | `text`         | Leaves only; drop it on internal nodes.         |
| `nodes`                  | `children`     | `[]` on leaves.                                 |

Wrap the result in a `Rulebook` with `source: "fixture"`, `indexer: "pageindex"`,
`pages` from the PDF, a `Preflight` (see `lib/rulebook/preflight.ts`) and the
wall-clock `indexMs`, and save it as `usecases/<id>/rulebook.json`.

### Hosted API

`lib/pageindex/build.ts` calls the hosted service when `PAGEINDEX_API_URL` and
`PAGEINDEX_API_KEY` are set, and maps the response with the same table. The
request and response shapes it assumes are documented in
`lib/pageindex/pageindexApi.ts` and have not been verified against the hosted
API; keep any adjustment isolated in that file.

### Without PageIndex

With no `PAGEINDEX_API_URL`, uploads and `npm run index` use the built-in "snap" indexer: heading
candidates are found by regex and classified with Snap (`is_heading`, and a
`score` for chapter / section / subsection), and each leaf's summary is the
first sentence of its text. No text is generated.

## How the marketing rulebook differs

`usecases/marketing/source/generate.ts` (run with `npm run generate:marketing`)
does **not** index a document. It is synthetic: it takes the hand-written
outline and clauses beside it and expands every leaf into a section (clause
first, then templated procedures, guidance, examples, cross-references and
record-keeping notes) until the book reaches its target page count at about
480 words per page. Page ranges come from that packing, not from a PDF.

The generator is deterministic (seeded PRNG), so `usecases/marketing/rulebook.json`
is byte-identical on every run. To change it, edit the outline or clause file
and regenerate; `tests/marketing-rulebook.test.ts` checks the shape rules above
and that it still has exactly the 109 leaves of `source/outline.ts`.

The samples are written against this tree. If you change clause text, ids or
the outline, check them against the live model again with
`npm run check-samples`.
