export const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpg",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

export const ALLOWED_UPLOAD_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".docx", ".xlsx", ".txt"];
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

export function sanitizeFilename(name: string): string {
  return name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9.\-]/g, "");
}

export function validateUpload(file: { name: string; type: string; size: number }): string | null {
  if (file.size > MAX_UPLOAD_SIZE) return "File exceeds 10MB limit";
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  const extOk = ALLOWED_UPLOAD_EXTENSIONS.includes(ext);
  const mimeOk = !file.type || ALLOWED_UPLOAD_TYPES.includes(file.type);
  if (!extOk || !mimeOk) return "File type not allowed. Accepted: PDF, PNG, JPG, DOCX, XLSX, TXT";
  return null;
}
