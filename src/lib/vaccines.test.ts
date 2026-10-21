import { describe, expect, it } from "vitest";
import { customVaccineRows, mergeVaccineRows, vaccineTitle, visibleStagesForBaby } from "./vaccines";

describe("visibleStagesForBaby", () => {
  it("always includes newborn through up_to_2y when born_on is set and under 5", () => {
    expect(visibleStagesForBaby("2026-03-12", "2026-10-20")).toEqual([
      "newborn",
      "up_to_1y",
      "up_to_2y",
    ]);
  });

  it("adds age_5 when the baby is at least 5 years old", () => {
    expect(visibleStagesForBaby("2020-01-01", "2026-10-20")).toContain("age_5");
  });

  it("still shows infant stages when born_on is null", () => {
    expect(visibleStagesForBaby(null, "2026-10-20")).toEqual([
      "newborn",
      "up_to_1y",
      "up_to_2y",
    ]);
  });
});

describe("mergeVaccineRows", () => {
  it("treats missing rows as pending without date or lot", () => {
    const catalog = [
      {
        id: "c1",
        code: "bcg_birth",
        name: "BCG",
        life_stage: "newborn" as const,
        due_label: "Al nacer",
        sort_order: 1,
        active: true,
      },
    ];
    const merged = mergeVaccineRows(catalog, [], ["newborn"]);
    expect(merged).toEqual([
      {
        kind: "catalog",
        catalog: catalog[0],
        displayName: null,
        status: "pending",
        given_on: null,
        lot_number: null,
        rowId: null,
      },
    ]);
  });

  it("uses display_name as title override for catalogue rows", () => {
    const catalog = [
      {
        id: "c1",
        code: "bcg_birth",
        name: "BCG",
        life_stage: "newborn" as const,
        due_label: "Al nacer",
        sort_order: 1,
        active: true,
      },
    ];
    const rows = [
      {
        id: "r1",
        baby_id: "b1",
        catalog_id: "c1",
        display_name: "BCG - carnet",
        custom_name: null,
        status: "done" as const,
        given_on: "2026-09-26",
        lot_number: null,
      },
    ];
    const merged = mergeVaccineRows(catalog, rows, ["newborn"]);
    expect(merged[0]).toMatchObject({
      kind: "catalog",
      displayName: "BCG - carnet",
      status: "done",
      rowId: "r1",
    });
    expect(vaccineTitle(merged[0]!)).toBe("BCG - carnet");
  });

  it("lists custom rows separately and ignores them in mergeVaccineRows", () => {
    const catalog = [
      {
        id: "c1",
        code: "bcg_birth",
        name: "BCG",
        life_stage: "newborn" as const,
        due_label: "Al nacer",
        sort_order: 1,
        active: true,
      },
    ];
    const rows = [
      {
        id: "r2",
        baby_id: "b1",
        catalog_id: null,
        display_name: null,
        custom_name: "Fiebre amarilla",
        status: "done" as const,
        given_on: "2026-01-01",
        lot_number: "L1",
      },
    ];
    expect(mergeVaccineRows(catalog, rows, ["newborn"])[0]?.rowId).toBeNull();
    const customs = customVaccineRows(rows);
    expect(customs).toEqual([
      {
        kind: "custom",
        customName: "Fiebre amarilla",
        status: "done",
        given_on: "2026-01-01",
        lot_number: "L1",
        rowId: "r2",
      },
    ]);
    expect(vaccineTitle(customs[0]!)).toBe("Fiebre amarilla");
  });
});
