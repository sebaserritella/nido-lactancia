import { describe, expect, it } from "vitest";
import { messageForError } from "./errors";

describe("messageForError", () => {
  it("explains an already open feed", () => {
    expect(messageForError({ code: "23505", message: "duplicate key" })).toMatch(/en curso/);
  });

  it("explains a bad invite and a bad login", () => {
    expect(messageForError({ message: "invalid invite" })).toMatch(/código/);
    expect(messageForError({ message: "Invalid login credentials" })).toMatch(/contraseña/);
    expect(messageForError({ message: "Email address not authorized" })).toMatch(/mail de prueba/);
  });
});
