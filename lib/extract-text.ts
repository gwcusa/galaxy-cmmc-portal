import mammoth from "mammoth";
import * as XLSX from "xlsx";

const MAX_EXTRACT_CHARS = 30_000; // keep prompts bounded; ~7.5k tokens per document

export type ExtractedContent =
  | { kind: "text"; text: string; truncated: boolean }
  | { kind: "image"; base64: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" }
  | { kind: "pdf"; base64: string }
  | { kind: "unsupported" };

function clamp(text: string): { text: string; truncated: boolean } {
  const clean = text.replace(/\u0000/g, "").trim();
  if (clean.length <= MAX_EXTRACT_CHARS) return { text: clean, truncated: false };
  return { text: clean.slice(0, MAX_EXTRACT_CHARS), truncated: true };
}

/**
 * Converts an uploaded evidence file into content Claude can read.
 * DOCX → plain text via mammoth; XLSX → CSV per sheet; images/PDFs pass
 * through as base64 blocks; anything else is unsupported.
 */
export async function extractContent(
  buffer: Buffer,
  mimeType: string | null,
  fileName: string
): Promise<ExtractedContent> {
  const mime = (mimeType ?? "").toLowerCase();
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (mime.startsWith("image/")) {
    const mediaType = mime === "image/jpg" ? "image/jpeg" : mime;
    if (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType)) {
      return { kind: "image", base64: buffer.toString("base64"), mediaType: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp" };
    }
    return { kind: "unsupported" };
  }

  if (mime === "application/pdf" || ext === "pdf") {
    return { kind: "pdf", base64: buffer.toString("base64") };
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return { kind: "text", ...clamp(result.value) };
    } catch {
      return { kind: "unsupported" };
    }
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ext === "xlsx"
  ) {
    try {
      const wb = XLSX.read(buffer, { type: "buffer" });
      const parts: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
        if (csv.trim()) parts.push(`## Sheet: ${sheetName}\n${csv}`);
      }
      return { kind: "text", ...clamp(parts.join("\n\n")) };
    } catch {
      return { kind: "unsupported" };
    }
  }

  if (mime === "text/plain" || ext === "txt" || ext === "md" || ext === "csv") {
    return { kind: "text", ...clamp(buffer.toString("utf8")) };
  }

  return { kind: "unsupported" };
}
