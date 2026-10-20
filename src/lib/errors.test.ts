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

  it("explains a future vaccine date from the database check", () => {
    expect(
      messageForError({ code: "23514", message: "baby_vaccinations_given_on_not_future" }),
    ).toMatch(/futura/);
  });

  it("explains a future pediatric visit date from the database check", () => {
    expect(
      messageForError({ code: "23514", message: "pediatric_visits_visited_on_not_future" }),
    ).toMatch(/futura/);
  });

  it("explains a duplicate baby vaccination", () => {
    expect(
      messageForError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "baby_vaccinations_baby_id_catalog_id_key"',
      }),
    ).toMatch(/ya está anotada/);
  });

  it("explains cannot transfer ownership to self", () => {
    expect(messageForError({ message: "cannot transfer to self" })).toMatch(/pasarte la creación/);
  });
});
