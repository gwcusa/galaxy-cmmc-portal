/**
 * License date formatting, safe to import from client and server components.
 *
 * Always formats in UTC so a license shows the same calendar date on the
 * server (emails, server components) and in every viewer's browser.
 */
export function formatLicenseDate(iso: string, style: "long" | "short" = "short"): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: style,
    day: "numeric",
    timeZone: "UTC",
  });
}
