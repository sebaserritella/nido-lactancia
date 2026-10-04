import { describe, expect, it } from "vitest";
import { passwordRecoveryRedirect, recoveryLinkState } from "./passwordRecovery";

describe("recoveryLinkState", () => {
  it("detects a recovery link and an expired one", () => {
    expect(recoveryLinkState("https://sebaserritella.github.io/nido-lactancia/#access_token=abc&type=recovery")).toBe("recovery");
    expect(recoveryLinkState("https://sebaserritella.github.io/nido-lactancia/#error_code=otp_expired&error=access_denied")).toBe("expired");
    expect(recoveryLinkState("https://sebaserritella.github.io/nido-lactancia/")).toBeNull();
  });
});

describe("passwordRecoveryRedirect", () => {
  it("returns the app url without the recovery hash", () => {
    expect(passwordRecoveryRedirect("https://sebaserritella.github.io/nido-lactancia/#access_token=abc&type=recovery")).toBe(
      "https://sebaserritella.github.io/nido-lactancia/",
    );
    expect(passwordRecoveryRedirect("https://sebaserritella.github.io/nido-lactancia/index.html")).toBe(
      "https://sebaserritella.github.io/nido-lactancia/",
    );
    expect(passwordRecoveryRedirect("http://127.0.0.1:5173/")).toBe("http://127.0.0.1:5173/");
  });
});
