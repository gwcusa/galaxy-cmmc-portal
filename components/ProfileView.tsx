import ChangePasswordCard from "@/components/ChangePasswordCard";

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: 4,
};

type Props = {
  email: string | null | undefined;
  fullName?: string | null;
  role: string;
  /** Shown under the account details, e.g. who to contact for changes. */
  note?: string;
};

export default function ProfileView({ email, fullName, role, note }: Props) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 24 }}>Profile</div>

      <div style={card}>
        {fullName && (
          <>
            <div style={fieldLabel}>Name</div>
            <div style={{ fontSize: 14, color: "#E2E8F0", marginBottom: 16 }}>{fullName}</div>
          </>
        )}
        <div style={fieldLabel}>Email</div>
        <div style={{ fontSize: 14, color: "#E2E8F0", marginBottom: 16 }}>{email}</div>
        <div style={fieldLabel}>Role</div>
        <div style={{ fontSize: 14, color: "#E2E8F0", textTransform: "capitalize", marginBottom: note ? 16 : 0 }}>
          {role}
        </div>
        {note && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{note}</div>}
      </div>

      <ChangePasswordCard />
    </div>
  );
}
