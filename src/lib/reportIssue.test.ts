import { describe, expect, it } from "vitest";
import { SUPPORT_EMAIL, buildReportMailto } from "./reportIssue";

describe("buildReportMailto", () => {
  it("targets the support inbox with a fixed subject", () => {
    const href = buildReportMailto({
      href: "https://example.com/nido/",
      userAgent: "TestAgent/1.0",
    });
    expect(href.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
    expect(new URL(href).searchParams.get("subject")).toBe("Nido lactancia — problema");
  });

  it("puts the prompt first and appends url, agent, and optional account email", () => {
    const href = buildReportMailto({
      href: "https://example.com/nido/?v=1",
      userAgent: "Mozilla/5.0",
      userEmail: "mama@example.com",
      prompt: "Describí qué pasó:",
    });
    const body = decodeURIComponent(new URL(href).searchParams.get("body") ?? "");
    expect(body.startsWith("Describí qué pasó:\n\n")).toBe(true);
    expect(body).toContain("https://example.com/nido/?v=1");
    expect(body).toContain("Mozilla/5.0");
    expect(body).toContain("mama@example.com");
  });

  it("omits the account line when there is no signed-in email", () => {
    const href = buildReportMailto({
      href: "https://example.com/",
      userAgent: "UA",
      prompt: "Describí qué pasó:",
    });
    const body = decodeURIComponent(new URL(href).searchParams.get("body") ?? "");
    expect(body).not.toMatch(/@/);
  });
});
