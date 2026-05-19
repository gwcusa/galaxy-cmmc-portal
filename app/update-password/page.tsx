"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";

function UpdatePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Exchange the token_hash from the URL for an active session
  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");

    if (tokenHash && type === "recovery") {
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: "recovery" })
        .then(({ error }) => {
          if (error) {
            setSessionError("This invite link is invalid or has expired. Please ask your admin to resend it.");
          } else {
            setSessionReady(true);
          }
        });
    } else {
      // Check if we already have a session (e.g. hash-based redirect handled by Supabase automatically)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setSessionReady(true);
        } else {
          setSessionError("This invite link is invalid or has expired. Please ask your admin to resend it.");
        }
      });
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setTimeout(() => router.push("/portal/dashboard"), 2000);
    }
  }

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "#050B18",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  };

  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 400,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 32,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.06)",
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

  if (sessionError) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Link Expired</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{sessionError}</div>
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div style={containerStyle}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>Verifying your link…</div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#4DFFA0", marginBottom: 8 }}>Password set!</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>Taking you to your dashboard…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px", marginBottom: 6 }}>
            Set your password
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            Choose a password to activate your Galaxy portal account.
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle} htmlFor="password">New Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle} htmlFor="confirm">Confirm Password</label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              required
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: 16,
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.2)",
              color: "#F87171",
              fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 8,
              background: loading ? "rgba(0,201,255,0.3)" : "#00C9FF",
              color: loading ? "rgba(255,255,255,0.5)" : "#050B18",
              fontWeight: 700,
              fontSize: 14,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Saving…" : "Set Password & Log In"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#050B18", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>Loading…</div>
      </div>
    }>
      <UpdatePasswordForm />
    </Suspense>
  );
}
