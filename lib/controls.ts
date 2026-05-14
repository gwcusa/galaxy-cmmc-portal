import controlsData from "@/data/nist-800-171-controls.json";

export type Control = {
  id: string;
  domain: string;
  domain_code: string;
  level: number;
  weight: number;
  description: string;
};

export const CONTROLS: Control[] = controlsData as Control[];

export const DOMAINS = [
  { code: "AC", name: "Access Control", controls: 22, color: "#00C9FF" },
  { code: "AT", name: "Awareness & Training", controls: 3, color: "#4DFFA0" },
  { code: "AU", name: "Audit & Accountability", controls: 9, color: "#FFB347" },
  { code: "CM", name: "Configuration Management", controls: 9, color: "#FF6B9D" },
  { code: "IA", name: "Identification & Authentication", controls: 11, color: "#A78BFA" },
  { code: "IR", name: "Incident Response", controls: 3, color: "#F87171" },
  { code: "MA", name: "Maintenance", controls: 6, color: "#34D399" },
  { code: "MP", name: "Media Protection", controls: 9, color: "#60A5FA" },
  { code: "PS", name: "Personnel Security", controls: 2, color: "#FBBF24" },
  { code: "PE", name: "Physical Protection", controls: 6, color: "#F472B6" },
  { code: "RA", name: "Risk Assessment", controls: 3, color: "#818CF8" },
  { code: "CA", name: "Security Assessment", controls: 4, color: "#2DD4BF" },
  { code: "SC", name: "System & Comms Protection", controls: 16, color: "#FB923C" },
  { code: "SI", name: "System & Info Integrity", controls: 7, color: "#A3E635" },
] as const;

export function getControlsByDomain(domainCode: string): Control[] {
  return CONTROLS.filter((c) => c.domain_code === domainCode);
}

export function getDomain(code: string) {
  return DOMAINS.find((d) => d.code === code);
}
