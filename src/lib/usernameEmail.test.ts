import { describe, expect, it } from "vitest";
import { usernameToEmail } from "./usernameEmail";

describe("usernameToEmail", () => {
  it("maps a username to the synthetic auth email", () => {
    expect(usernameToEmail("Mama")).toBe("mama@nido-lactancia.local");
  });

  it("trims surrounding spaces", () => {
    expect(usernameToEmail("  papa_2  ")).toBe("papa_2@nido-lactancia.local");
  });

  it("rejects usernames outside 3-32 lowercase letters, digits, or underscore", () => {
    expect(() => usernameToEmail("ab")).toThrow(/username/);
    expect(() => usernameToEmail("mamá")).toThrow(/username/);
    expect(() => usernameToEmail("ma ma")).toThrow(/username/);
  });
});
