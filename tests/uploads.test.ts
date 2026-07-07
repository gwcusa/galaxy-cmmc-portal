import { describe, it, expect } from "vitest";
import { validateUpload, sanitizeFilename, MAX_UPLOAD_SIZE } from "@/lib/uploads";

describe("upload validation", () => {
  it("accepts allowed types", () => {
    expect(validateUpload({ name: "policy.pdf", type: "application/pdf", size: 1000 })).toBeNull();
    expect(validateUpload({ name: "policy.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1000 })).toBeNull();
    expect(validateUpload({ name: "shot.png", type: "image/png", size: 1000 })).toBeNull();
  });

  it("accepts a missing mime type when the extension is allowed", () => {
    expect(validateUpload({ name: "notes.txt", type: "", size: 1000 })).toBeNull();
  });

  it("rejects disallowed extensions even with an allowed mime type", () => {
    expect(validateUpload({ name: "run.exe", type: "application/pdf", size: 1000 })).not.toBeNull();
  });

  it("rejects a disallowed mime type even with an allowed extension", () => {
    expect(validateUpload({ name: "fake.pdf", type: "application/x-msdownload", size: 1000 })).not.toBeNull();
  });

  it("rejects oversized files", () => {
    expect(validateUpload({ name: "big.pdf", type: "application/pdf", size: MAX_UPLOAD_SIZE + 1 })).not.toBeNull();
  });
});

describe("filename sanitization", () => {
  it("strips path separators and shell characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).not.toContain("/");
    expect(sanitizeFilename("my file (v2).pdf")).toBe("my-file-v2.pdf");
  });
});
