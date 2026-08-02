"use client";

export type NextStep = {
  title: string;
  body: string;
  cta?: { label: string; anchor: string };
  tone: "action" | "wait" | "done";
};

const TONE: Record<NextStep["tone"], { accent: string; bg: string; border: string; icon: string }> = {
  action: { accent: "#00C9FF", bg: "rgba(0,201,255,0.07)",  border: "rgba(0,201,255,0.30)",  icon: "▶" },
  wait:   { accent: "#FFB347", bg: "rgba(255,179,71,0.06)", border: "rgba(255,179,71,0.25)", icon: "⏳" },
  done:   { accent: "#4DFFA0", bg: "rgba(77,255,160,0.07)", border: "rgba(77,255,160,0.30)", icon: "✓" },
};

export default function NextStepBanner({ step }: { step: NextStep }) {
  const t = TONE[step.tone];

  function scrollTo(anchor: string) {
    const el = document.querySelector(anchor);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div style={{
      background: t.bg,
      border: `1px solid ${t.border}`,
      borderRadius: 14,
      padding: "18px 22px",
      marginBottom: 24,
      display: "flex",
      alignItems: "center",
      gap: 18,
      flexWrap: "wrap",
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: `${t.accent}1e`, border: `1px solid ${t.accent}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, color: t.accent,
      }}>
        {t.icon}
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase",
          color: t.accent, marginBottom: 4,
        }}>
          Next Step
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 3 }}>
          {step.title}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
          {step.body}
        </div>
      </div>
      {step.cta && (
        <button
          onClick={() => scrollTo(step.cta!.anchor)}
          style={{
            flexShrink: 0,
            padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer",
            background: t.accent, border: "none", color: "#050B18",
          }}
        >
          {step.cta.label} →
        </button>
      )}
    </div>
  );
}
