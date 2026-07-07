"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CONTROLS } from "@/lib/controls";

type LinkItem = {
  id: string;
  control_id: string;
  status: "suggested" | "confirmed" | "rejected";
  source: string;
  confidence: number | null;
  rationale: string | null;
};

type DocumentItem = {
  id: string;
  file_name: string;
  title: string | null;
  doc_type: string | null;
  file_size: number | null;
  uploaded_at: string;
  signedUrl: string;
  document_control_links: LinkItem[];
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 20,
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (res.ok) {
      const data = await res.json();
      setDocuments(data.documents ?? []);
    }
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/documents", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Upload failed");
    } else {
      await load();
      // Kick off AI mapping right away so suggestions appear without an extra click
      analyze(data.document.id);
    }
    setUploading(false);
  }

  async function analyze(documentId: string) {
    setAnalyzing(documentId);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/documents/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error ?? "Analysis failed");
    else setNotice(`Analysis complete: ${data.suggested} control suggestion(s). Review and confirm them below.`);
    await load();
    setAnalyzing(null);
  }

  async function resolveLink(documentId: string, controlId: string, action: "confirm" | "reject") {
    await fetch("/api/documents/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, controlId, action }),
    });
    await load();
  }

  async function removeDocument(documentId: string, fileName: string) {
    if (!window.confirm(`Delete "${fileName}" and its control mappings?`)) return;
    await fetch(`/api/documents?documentId=${documentId}`, { method: "DELETE" });
    await load();
  }

  const controlDesc = (id: string) => CONTROLS.find((c) => c.id === id)?.description ?? "";

  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Document Library</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 24, maxWidth: 720, lineHeight: 1.6 }}>
        Upload your policies, procedures, plans, and configuration evidence once — we automatically
        identify which CMMC controls each document supports. Confirm the suggestions so your documents
        count as evidence across the whole assessment.
      </div>

      <div style={{ ...card, marginBottom: 24 }}>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            background: uploading ? "rgba(0,201,255,0.3)" : "#00C9FF",
            color: "#050B18",
            fontWeight: 700,
            fontSize: 14,
            border: "none",
            borderRadius: 8,
            padding: "10px 24px",
            cursor: uploading ? "default" : "pointer",
          }}
        >
          {uploading ? "Uploading…" : "+ Upload Document"}
        </button>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginLeft: 14 }}>
          PDF, DOCX, XLSX, PNG, JPG, TXT — max 10MB
        </span>
      </div>

      {error && (
        <div style={{ color: "#F87171", fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}
      {notice && (
        <div style={{ color: "#4DFFA0", fontSize: 13, marginBottom: 16 }}>{notice}</div>
      )}

      {!loaded && <div style={{ color: "rgba(255,255,255,0.4)" }}>Loading…</div>}
      {loaded && documents.length === 0 && (
        <div style={{ ...card, color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
          No documents yet. Start with your System Security Plan, Access Control Policy, or any
          security policies you already have.
        </div>
      )}

      {documents.map((doc) => {
        const suggested = doc.document_control_links.filter((l) => l.status === "suggested");
        const confirmed = doc.document_control_links.filter((l) => l.status === "confirmed");
        return (
          <div key={doc.id} style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <a href={doc.signedUrl} target="_blank" rel="noreferrer" style={{ fontSize: 15, fontWeight: 600, color: "#00C9FF", textDecoration: "none" }}>
                  {doc.title || doc.file_name}
                </a>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                  {doc.file_name} · {formatSize(doc.file_size)}
                  {doc.doc_type ? ` · ${doc.doc_type}` : ""} · uploaded {new Date(doc.uploaded_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => analyze(doc.id)}
                  disabled={analyzing === doc.id}
                  style={{
                    background: "rgba(0,201,255,0.12)", color: "#00C9FF", border: "1px solid rgba(0,201,255,0.35)",
                    borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: "pointer",
                  }}
                >
                  {analyzing === doc.id ? "Analyzing…" : "Re-analyze"}
                </button>
                <button
                  onClick={() => removeDocument(doc.id, doc.file_name)}
                  style={{
                    background: "rgba(248,113,113,0.1)", color: "#F87171", border: "1px solid rgba(248,113,113,0.3)",
                    borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>

            {confirmed.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>
                  Evidence for {confirmed.length} control{confirmed.length === 1 ? "" : "s"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {confirmed.map((l) => (
                    <span key={l.id} title={controlDesc(l.control_id)} style={{
                      background: "rgba(77,255,160,0.1)", color: "#4DFFA0", border: "1px solid rgba(77,255,160,0.3)",
                      borderRadius: 12, padding: "3px 10px", fontSize: 12,
                    }}>
                      {l.control_id}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {suggested.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: "#FFB347", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>
                  {suggested.length} suggested mapping{suggested.length === 1 ? "" : "s"} — confirm or dismiss
                </div>
                {suggested.map((l) => (
                  <div key={l.id} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                    borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 13,
                  }}>
                    <span style={{ color: "#FFB347", fontWeight: 600, minWidth: 56 }}>{l.control_id}</span>
                    <span style={{ color: "rgba(255,255,255,0.55)", flex: 1 }}>
                      {l.rationale ?? controlDesc(l.control_id)}
                    </span>
                    <button onClick={() => resolveLink(doc.id, l.control_id, "confirm")} style={{
                      background: "rgba(77,255,160,0.12)", color: "#4DFFA0", border: "1px solid rgba(77,255,160,0.35)",
                      borderRadius: 6, padding: "4px 12px", fontSize: 12, cursor: "pointer",
                    }}>
                      Confirm
                    </button>
                    <button onClick={() => resolveLink(doc.id, l.control_id, "reject")} style={{
                      background: "transparent", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 6, padding: "4px 12px", fontSize: 12, cursor: "pointer",
                    }}>
                      Dismiss
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
