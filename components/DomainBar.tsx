import { getDomain } from "@/lib/controls";

type Props = {
  domainCode: string;
  score: number;
};

export default function DomainBar({ domainCode, score }: Props) {
  const domain = getDomain(domainCode);
  if (!domain) return null;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{domain.name}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: domain.color }}>{score}%</span>
      </div>
      <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
        <div style={{ height: "100%", width: `${score}%`, background: domain.color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}
