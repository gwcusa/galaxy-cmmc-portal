import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";

/**
 * Converts the markdown-ish text produced by artifact generation into a .docx
 * buffer. Handles headings (#..####), bullet/numbered lists, bold (**text**),
 * italic (*text*), and plain paragraphs — enough for SSP/POA&M/policy drafts.
 */
export async function markdownToDocx(title: string, markdown: string): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
  ];

  const lines = markdown.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
      children.push(
        new Paragraph({
          children: inlineRuns(heading[2]),
          heading: levels[heading[1].length - 1],
          spacing: { before: 240, after: 120 },
        })
      );
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      children.push(
        new Paragraph({ children: inlineRuns(bullet[1]), bullet: { level: 0 }, spacing: { after: 60 } })
      );
      continue;
    }

    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${numbered[1]}. `, bold: true }), ...inlineRuns(numbered[2])],
          spacing: { after: 60 },
          indent: { left: 360 },
        })
      );
      continue;
    }

    children.push(new Paragraph({ children: inlineRuns(line.trim()), spacing: { after: 120 } }));
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } }, // 11pt
      },
    },
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

/** Splits a line into TextRuns handling **bold**, *italic*, and plain segments. */
function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true }));
    } else {
      runs.push(new TextRun({ text: part }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text })];
}
