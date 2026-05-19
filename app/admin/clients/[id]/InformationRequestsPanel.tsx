"use client";

import { useEffect, useState } from "react";

type InfoRequest = {
  id: string;
  subject: string;
  body: string;
  status: "pending" | "responded" | "closed";
  requested_at: string;
  client_response: string | null;
  responded_at: string | null;
};

const STATUS_CONFIG = {
  pending:   { label: "Pending",    color: "#FFB347", dot: "●" },
  responded: { label: "Responded",  color: "#4DFFA0", dot: "●" },
  closed:    { label: "Closed",     color: "rgba(255,255,255,0.3)", dot: "○" },
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#E2E8F0",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

export default function InformationRequestsPanel({ assessmentId }: { assessmentId: string }) {
  const [requests, setRequests] = useState<InfoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/info-requests?assessmentId=${assessmentId}`)
      .then((r) => r.json())
      .then((d) => { setRequests(d.requests ?? []); setLoading(false); });
  }, [assessmentId]);

  async function sendRequest() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    const res = await fetch("/api/admin/info-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId, subject, body }),
    });
    const data = await res.json();
    if (data.request) {
      setRequests((prev) => [data.request, ...prev]);
      setSubject("");
      setBody("");
      setShowForm(false);
    }
    setSending(false);
  }

  async function closeRequest(id: string) {
    setClosingId(id);
    await fetch(`/api/admin/info-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "closed" } : r));
    setClosingId(null);
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const respondedCount = requests.filter((r) => r.status === "responded").length;

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {pendingCount > 0 && (
          <span style={{ fontSize: 12, color: "#FFB347", background: "rgba(255,179,71,0.1)", border: "1px solid rgba(255,179,71,0.25)", borderRadius: 20, padding: "3px 10px", fontWeight: 600 }}>
            {pendingCount} pending
          </span>
        )}
        {respondedCount > 0 && (
          <span style={{ fontSize: 12, color: "#4DFFA0", background: "rgba(77,255,160,0.08)", border: "1px solid rgba(77,255,160,0.2)", borderRadius: 20, padding: "3px 10px", fontWeight: 600 }}>
            {respondedCount} responded
          </span>
        )}
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            marginLeft: "auto", padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: showForm ? "rgba(255,255,255,0.08)" : "rgba(0,201,255,0.12)",
            border: showForm ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(0,201,255,0.3)",
            color: showForm ? "rgba(255,255,255,0.6)" : "#00C9FF",
            cursor: "pointer",
          }}
        >
          {showForm ? "Cancel" : "+ New Request"}
        </button>
      </div>

      {/* New request form */}
      {showForm && (
        <div style={{ ...card, marginBottom: 16, border: "1px solid rgba(0,201,255,0.2)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 14 }}>New Information Request</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Subject</div>
            <input
              style={inputStyle}
              placeholder="e.g., Please provide your current password policy document"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Details / Request Body</div>
            <textarea
              style={{ ...inputStyle, minHeight: 90, resize: "vertical", lineHeight: 1.6 }}
              placeholder="Describe exactly what you need the client to provide..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
            />
          </div>
          <button
            onClick={sendRequest}
            disabled={sending || !subject.trim() || !body.trim()}
            style={{
              padding: "9px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: "rgba(0,201,255,0.15)", border: "1px solid rgba(0,201,255,0.35)", color: "#00C9FF",
              cursor: sending || !subject.trim() || !body.trim() ? "not-allowed" : "pointer",
              opacity: sending || !subject.trim() || !body.trim() ? 0.5 : 1,
            }}
          >
            {sending ? "Sending..." : "Send Request"}
          </button>
        </div>
      )}

      {/* Request list */}
      {loading ? (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "16px 0" }}>Loading...</div>
      ) : requests.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 32, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
          No information requests sent yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {requests.map((req) => {
            const sc = STATUS_CONFIG[req.status];
            const isExpanded = expandedId === req.id;
            return (
              <div key={req.id} style={{
                ...card, padding: "16px 20px",
                opacity: req.status === "closed" ? 0.55 : 1,
                border: req.status === "responded"
                  ? "1px solid rgba(77,255,160,0.2)"
                  : "1px solid rgba(255,255,255,0.08)",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{req.subject}</span>
                      <span style={{ fontSize: 11, color: sc.color, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 9 }}>{sc.dot}</span>{sc.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                      Sent {new Date(req.requested_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {req.responded_at && ` · Responded ${new Date(req.responded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : req.id)}
                      style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
                    >
                      {isExpanded ? "Collapse" : "View"}
                    </button>
                    {req.status !== "closed" && (
                      <button
                        onClick={() => closeRequest(req.id)}
                        disabled={closingId === req.id}
                        style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" }}
                      >
                        {closingId === req.id ? "..." : "Close"}
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Request Details</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: req.client_response ? 16 : 0 }}>
                      {req.body}
                    </div>
                    {req.client_response && (
                      <>
                        <div style={{ fontSize: 11, color: "#4DFFA0", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6, marginTop: 14 }}>Client Response</div>
                        <div style={{
                          fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.6,
                          background: "rgba(77,255,160,0.04)", border: "1px solid rgba(77,255,160,0.12)",
                          borderRadius: 8, padding: "12px 14px", whiteSpace: "pre-wrap",
                        }}>
                          {req.client_response}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
