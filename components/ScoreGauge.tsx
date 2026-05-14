type Props = {
  score: number;
  size?: number;
};

export default function ScoreGauge({ score, size = 120 }: Props) {
  const r = size / 2 - 10;
  const circ = 2 * Math.PI * r;
  const pct = score / 100;
  const color = score >= 70 ? "#4DFFA0" : score >= 40 ? "#FFB347" : "#F87171";

  return (
    <svg width={size} height={size} style={{ display: "block", margin: "0 auto" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fill="#fff" fontSize={size > 100 ? 22 : 16} fontWeight={700}>
        {score}%
      </text>
      <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={10}>
        Score
      </text>
    </svg>
  );
}
