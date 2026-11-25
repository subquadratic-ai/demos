import { describe, expect, it } from "vitest";
import { detectKind, extractDocument, guessTitle, paginateText } from "@/lib/rulebook/extract";

const paragraph = "The policy applies to every communication the Company publishes in any channel. ".repeat(10);

describe("detectKind", () => {
  it("uses mime first and extension second", () => {
    expect(detectKind("x.bin", "application/pdf")).toBe("pdf");
    expect(detectKind("policy.PDF", "")).toBe("pdf");
    expect(detectKind("policy.docx", "application/octet-stream")).toBe("docx");
    expect(detectKind("notes.md", "text/markdown")).toBe("text");
  });
});

describe("paginateText", () => {
  it("splits long text into ~480-word pages and prefers heading boundaries", () => {
    const text = [`# Title`, paragraph, paragraph, `## 2 Second part`, paragraph, paragraph, paragraph, `## 3 Third part`, paragraph].join("\n\n");
    const pages = paginateText(text);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages[0].startsWith("# Title")).toBe(true);
    expect(pages.some((p) => p.startsWith("## 2 Second part"))).toBe(true);
    for (const page of pages) expect(page.split(/\s+/).length).toBeLessThanOrEqual(500);
  });
});

describe("guessTitle", () => {
  it("takes the first heading-like line, else the filename", () => {
    expect(guessTitle(["# Marketing Policy\nbody"], "x.md")).toBe("Marketing Policy");
    expect(guessTitle(["1. Scope and Governance\nbody"], "x.md")).toBe("Scope and Governance");
    expect(guessTitle(["just some prose here that is long and lowercase."], "vendor_code-2026.txt")).toBe("vendor code 2026");
  });
});

describe("extractDocument", () => {
  it("reads markdown as paginated text with a title", async () => {
    const text = `# Vendor Code\n\n${paragraph}\n\n## 1 Scope\n\n${paragraph}`;
    const { pages, title } = await extractDocument(new TextEncoder().encode(text), "vendor.md", "text/markdown");
    expect(title).toBe("Vendor Code");
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(pages.join("\n")).toContain("## 1 Scope");
  });
});
