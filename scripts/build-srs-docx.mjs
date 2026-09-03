/**
 * Renders docs/SRS.md to a Word document for clients and auditors.
 *
 *   npm run docs:srs-docx
 *
 * The Markdown is the source of truth; this script exists so the .docx can be
 * regenerated from it rather than hand-maintained in parallel. It supports the
 * subset of Markdown the SRS actually uses: headings, paragraphs, bullet and
 * numbered lists, tables, blockquotes, fenced code, horizontal rules, and
 * inline bold / italic / code.
 *
 * Only docs/SRS.md is rendered. docs/SRS-known-gaps.md is internal and is
 * deliberately NOT exported to a shareable format.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, LevelFormat, VerticalAlign,
} from "docx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "docs", "SRS.md");
const OUTPUT = path.join(ROOT, "docs", "Galaxy_CMMC_Portal_SRS_v1.0.docx");

// US Letter, 1" margins → 9360 DXA of content width.
const CONTENT_WIDTH = 9360;
const ACCENT = "1F4E79";
const RULE = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const CELL_BORDERS = { top: RULE, bottom: RULE, left: RULE, right: RULE };
const CELL_MARGINS = { top: 80, bottom: 80, left: 120, right: 120 };

// ----------------------------------------------------------- inline formatting

/** Split inline Markdown into docx TextRuns. Handles **bold**, *italic*, `code`. */
function runs(text, base = {}) {
  const out = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ ...base, text: text.slice(last, m.index) }));
    const token = m[0];
    if (token.startsWith("**")) {
      out.push(new TextRun({ ...base, text: token.slice(2, -2), bold: true }));
    } else if (token.startsWith("`")) {
      out.push(new TextRun({ ...base, text: token.slice(1, -1), font: "Consolas", size: 20 }));
    } else {
      out.push(new TextRun({ ...base, text: token.slice(1, -1), italics: true }));
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(new TextRun({ ...base, text: text.slice(last) }));
  return out.length ? out : [new TextRun({ ...base, text: "" })];
}

/** Plain length of a cell, for proportional column sizing. */
function plainLength(text) {
  return text.replace(/\*\*|`|\*/g, "").length;
}

// -------------------------------------------------------------------- tables

function splitRow(line) {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function buildTable(rows) {
  const header = splitRow(rows[0]);
  const bodyRows = rows.slice(2).map(splitRow); // rows[1] is the --- separator
  const columnCount = header.length;

  // Size columns by the longest content they carry, with a floor so a narrow
  // column (a checkmark) stays readable and a cap so one column can't dominate.
  const weights = [];
  for (let c = 0; c < columnCount; c++) {
    const longest = Math.max(
      plainLength(header[c] ?? ""),
      ...bodyRows.map((r) => plainLength(r[c] ?? "")),
    );
    weights.push(Math.min(Math.max(longest, 6), 70));
  }
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.max(Math.round((w / total) * CONTENT_WIDTH), 600));
  // Force the widths to sum exactly to the table width.
  widths[widths.length - 1] += CONTENT_WIDTH - widths.reduce((a, b) => a + b, 0);

  const cell = (text, index, isHeader) =>
    new TableCell({
      borders: CELL_BORDERS,
      width: { size: widths[index], type: WidthType.DXA },
      margins: CELL_MARGINS,
      verticalAlign: VerticalAlign.CENTER,
      shading: isHeader ? { fill: "EDF2F7", type: ShadingType.CLEAR } : undefined,
      children: [
        new Paragraph({
          spacing: { before: 20, after: 20 },
          alignment: text.trim() === "✅" || text.trim() === "—" ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: runs(text, isHeader ? { bold: true, size: 19 } : { size: 19 }),
        }),
      ],
    });

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: header.map((h, i) => cell(h, i, true)),
      }),
      ...bodyRows.map((r) =>
        new TableRow({
          children: Array.from({ length: columnCount }, (_, i) => cell(r[i] ?? "", i, false)),
        }),
      ),
    ],
  });
}

// --------------------------------------------------------------- the parser

function parse(markdown) {
  const lines = markdown.split(/\r?\n/);
  const children = [];
  let i = 0;

  // Buffer for a paragraph split across source lines (the SRS hard-wraps).
  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    children.push(new Paragraph({
      spacing: { after: 140, line: 276 },
      children: runs(paragraph.join(" ")),
    }));
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code
    if (trimmed.startsWith("```")) {
      flushParagraph();
      i++;
      const code = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      i++;
      for (const c of code) {
        children.push(new Paragraph({
          shading: { fill: "F5F7FA", type: ShadingType.CLEAR },
          spacing: { before: 0, after: 0 },
          indent: { left: 240 },
          children: [new TextRun({ text: c || " ", font: "Consolas", size: 19 })],
        }));
      }
      children.push(new Paragraph({ spacing: { after: 140 }, children: [new TextRun("")] }));
      continue;
    }

    // Table
    if (trimmed.startsWith("|")) {
      flushParagraph();
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++].trim());
      if (rows.length >= 2) {
        children.push(buildTable(rows));
        children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun("")] }));
      }
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(trimmed)) {
      flushParagraph();
      children.push(new Paragraph({
        spacing: { before: 120, after: 160 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 1 } },
        children: [new TextRun("")],
      }));
      i++;
      continue;
    }

    // Headings
    if (trimmed.startsWith("#")) {
      flushParagraph();
      const level = trimmed.match(/^#+/)[0].length;
      const text = trimmed.replace(/^#+\s*/, "");
      if (level === 1) {
        children.push(new Paragraph({
          heading: HeadingLevel.TITLE,
          spacing: { after: 120 },
          children: [new TextRun({ text, bold: true, size: 40, color: ACCENT })],
        }));
      } else {
        children.push(new Paragraph({
          heading: level === 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
          pageBreakBefore: level === 2 && children.length > 8,
          children: [new TextRun({ text })],
        }));
      }
      i++;
      continue;
    }

    // Blockquote (callouts)
    if (trimmed.startsWith(">")) {
      flushParagraph();
      const quote = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      children.push(new Paragraph({
        spacing: { before: 120, after: 160 },
        indent: { left: 240 },
        shading: { fill: "F2F7FB", type: ShadingType.CLEAR },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } },
        children: runs(quote.join(" ").trim(), { size: 21 }),
      }));
      continue;
    }

    // Bullet list
    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        let item = lines[i].trim().replace(/^[-*]\s+/, "");
        i++;
        // Continuation lines of a wrapped bullet are indented.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*]\s/.test(lines[i])) {
          item += " " + lines[i].trim();
          i++;
        }
        children.push(new Paragraph({
          numbering: { reference: "srs-bullets", level: 0 },
          spacing: { after: 60 },
          children: runs(item),
        }));
      }
      continue;
    }

    // Numbered list (the table of contents)
    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        children.push(new Paragraph({
          numbering: { reference: "srs-numbers", level: 0 },
          spacing: { after: 40 },
          children: runs(lines[i].trim().replace(/^\d+\.\s+/, "")),
        }));
        i++;
      }
      continue;
    }

    // Blank line ends a paragraph
    if (!trimmed) {
      flushParagraph();
      i++;
      continue;
    }

    paragraph.push(trimmed);
    i++;
  }

  flushParagraph();
  return children;
}

// ----------------------------------------------------------------------- main

const markdown = fs.readFileSync(SOURCE, "utf8");
const body = parse(markdown);

const doc = new Document({
  creator: "Galaxy Consulting LLC",
  title: "Galaxy CMMC Portal — System Requirements Specification v1.0",
  description: "System Requirements Specification for the Galaxy CMMC 2.0 Compliance Portal",
  styles: {
    default: { document: { run: { font: "Arial", size: 21 } } },
    paragraphStyles: [
      {
        id: "Title", name: "Title", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 40, bold: true, font: "Arial", color: ACCENT },
        paragraph: { spacing: { before: 0, after: 240 } },
      },
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: ACCENT },
        paragraph: { spacing: { before: 320, after: 180 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 25, bold: true, font: "Arial", color: "2E5C8A" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "srs-bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 620, hanging: 300 } } },
        }],
      },
      {
        reference: "srs-numbers",
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 620, hanging: 300 } } },
        }],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 6 } },
          children: [new TextRun({
            text: "Galaxy CMMC Portal — SRS v1.0",
            size: 17, color: "888888",
          })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Galaxy Consulting LLC    |    Page ", size: 17, color: "888888" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 17, color: "888888" }),
            new TextRun({ text: " of ", size: 17, color: "888888" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 17, color: "888888" }),
          ],
        })],
      }),
    },
    children: body,
  }],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(OUTPUT, buffer);
console.log(`Wrote ${path.relative(ROOT, OUTPUT)} (${(buffer.length / 1024).toFixed(1)} KB) from ${path.relative(ROOT, SOURCE)}`);
