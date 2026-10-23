export const SUPPORT_EMAIL = "sebaserritella@gmail.com";

const REPORT_SUBJECT = "Nido lactancia — problema";

export type ReportMailtoInput = {
  href: string;
  userAgent: string;
  userEmail?: string | null;
  prompt?: string;
};

export function buildReportMailto({
  href,
  userAgent,
  userEmail,
  prompt = "Describí qué pasó:",
}: ReportMailtoInput): string {
  const lines = [prompt, "", ""];
  lines.push(`URL: ${href}`);
  lines.push(`Navegador: ${userAgent}`);
  if (userEmail) {
    lines.push(`Cuenta: ${userEmail}`);
  }
  const params = new URLSearchParams({
    subject: REPORT_SUBJECT,
    body: lines.join("\n"),
  });
  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`;
}
