export type ScopingQuestion = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "boolean";
  options?: string[];
  placeholder?: string;
  help?: string;
};

/**
 * Lightweight scoping profile completed before the control questionnaire.
 * Answers feed every AI evidence review as environment context, and drive
 * applicability calls (e.g., no wireless → 3.1.16/3.1.17 may be N/A).
 */
export const SCOPING_QUESTIONS: ScopingQuestion[] = [
  {
    id: "org_overview",
    label: "Briefly describe your organization and the work you do for the DoD",
    type: "textarea",
    placeholder: "e.g., 45-person machine shop producing aircraft components under subcontract to...",
  },
  {
    id: "employee_count",
    label: "Number of employees",
    type: "select",
    options: ["1-10", "11-50", "51-200", "201-500", "500+"],
  },
  {
    id: "it_management",
    label: "Who manages your IT?",
    type: "select",
    options: ["Internal IT staff", "Managed service provider (MSP)", "Hybrid (internal + MSP)", "No dedicated IT"],
  },
  {
    id: "environment",
    label: "Where do your systems run?",
    type: "select",
    options: ["Cloud only", "On-premises only", "Hybrid cloud + on-prem", "Separate CUI enclave"],
  },
  {
    id: "cloud_services",
    label: "Primary cloud / SaaS platforms",
    type: "text",
    placeholder: "e.g., Microsoft 365 GCC High, Azure Government, AWS GovCloud, Google Workspace",
  },
  {
    id: "cui_description",
    label: "What CUI or FCI do you handle, and where does it live?",
    type: "textarea",
    placeholder: "e.g., Technical drawings (CUI//SP-CTI) stored in SharePoint GCC High and a file server in the office...",
    help: "Describe the types of information and the systems/locations that store or process it. Do not paste actual CUI.",
  },
  {
    id: "remote_work",
    label: "Do employees work remotely or access systems from outside the office?",
    type: "boolean",
  },
  {
    id: "wireless_networks",
    label: "Do you operate wireless networks in facilities that handle CUI/FCI?",
    type: "boolean",
  },
  {
    id: "mobile_devices",
    label: "Do employees use mobile devices (phones/tablets) for company work?",
    type: "boolean",
  },
  {
    id: "byod",
    label: "Are personal (BYOD) devices allowed to access company systems?",
    type: "boolean",
  },
  {
    id: "public_systems",
    label: "Do you publish content to public-facing systems (website, social media)?",
    type: "boolean",
  },
  {
    id: "security_tools",
    label: "Security tooling in place today",
    type: "textarea",
    placeholder: "e.g., Microsoft Defender for Business, Intune MDM, Duo MFA, Splunk, FortiGate firewall...",
    help: "Name the actual products — antivirus/EDR, MFA, MDM, SIEM/logging, firewall, backup.",
  },
  {
    id: "network_topology",
    label: "Describe your network layout and any segmentation",
    type: "textarea",
    placeholder: "e.g., Single office VLAN, guest Wi-Fi isolated, CUI file server on separate subnet behind internal firewall...",
  },
];

export function formatScopingForPrompt(answers: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const q of SCOPING_QUESTIONS) {
    const v = answers[q.id];
    if (v === undefined || v === null || v === "") continue;
    const value = typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
    lines.push(`- ${q.label}: ${value}`);
  }
  return lines.length > 0 ? lines.join("\n") : "(No scoping profile provided)";
}
