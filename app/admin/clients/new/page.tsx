"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#E2E8F0",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.5)",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: 6,
  display: "block",
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

export default function NewClientPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    password: "",
    phone: "",
    cmmcTargetLevel: 1,
    engagementStage: "lead",
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "cmmcTargetLevel" ? Number(value) : value,
    }));
  }

  function validate(): string | null {
    if (!form.companyName.trim()) return "Company name is required.";
    if (!form.contactName.trim()) return "Contact name is required.";
    if (!form.email.trim() || !form.email.includes("@")) return "A valid email address is required.";
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      router.push(`/admin/clients/${data.clientId}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <Link
          href="/admin/clients"
          style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none", display: "inline-block", marginBottom: 16 }}
        >
          ← Back to Clients
        </Link>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Invite Client</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          Create a client account and configure their CMMC engagement
        </div>
      </div>

      {/* Form Card */}
      <form onSubmit={handleSubmit}>
        <div style={{ ...card, maxWidth: 640 }}>

          {/* Company Name */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle} htmlFor="companyName">Company Name *</label>
            <input
              id="companyName"
              name="companyName"
              type="text"
              required
              value={form.companyName}
              onChange={handleChange}
              style={inputStyle}
              placeholder="Acme Corp"
            />
          </div>

          {/* Contact Name */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle} htmlFor="contactName">Contact Name *</label>
            <input
              id="contactName"
              name="contactName"
              type="text"
              required
              value={form.contactName}
              onChange={handleChange}
              style={inputStyle}
              placeholder="Jane Smith"
            />
          </div>

          {/* Email */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle} htmlFor="email">Email *</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={form.email}
              onChange={handleChange}
              style={inputStyle}
              placeholder="jane@acmecorp.com"
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle} htmlFor="password">Password *</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={handleChange}
              style={inputStyle}
              placeholder="Min. 8 characters"
            />
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
              Client will use this to log in
            </div>
          </div>

          {/* Phone */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle} htmlFor="phone">Phone</label>
            <input
              id="phone"
              name="phone"
              type="text"
              value={form.phone}
              onChange={handleChange}
              style={inputStyle}
              placeholder="+1 (555) 000-0000"
            />
          </div>

          {/* CMMC Target Level + Engagement Stage side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div>
              <label style={labelStyle} htmlFor="cmmcTargetLevel">CMMC Target Level *</label>
              <select
                id="cmmcTargetLevel"
                name="cmmcTargetLevel"
                value={form.cmmcTargetLevel}
                onChange={handleChange}
                style={inputStyle}
              >
                <option value={1}>Level 1</option>
                <option value={2}>Level 2</option>
              </select>
            </div>
            <div>
              <label style={labelStyle} htmlFor="engagementStage">Engagement Stage *</label>
              <select
                id="engagementStage"
                name="engagementStage"
                value={form.engagementStage}
                onChange={handleChange}
                style={inputStyle}
              >
                <option value="lead">Lead</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle} htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              value={form.notes}
              onChange={handleChange}
              style={{ ...inputStyle, resize: "vertical" }}
              placeholder="Any relevant notes about this engagement..."
            />
          </div>

          {/* Error message */}
          {error && (
            <div style={{
              marginBottom: 20,
              padding: "12px 16px",
              borderRadius: 8,
              background: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.25)",
              color: "#F87171",
              fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "12px 28px",
              borderRadius: 8,
              background: loading ? "rgba(0,201,255,0.3)" : "#00C9FF",
              color: loading ? "rgba(255,255,255,0.5)" : "#050B18",
              fontWeight: 700,
              fontSize: 14,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: "0.3px",
            }}
          >
            {loading ? "Creating account..." : "Create Client Account"}
          </button>
        </div>
      </form>
    </div>
  );
}
