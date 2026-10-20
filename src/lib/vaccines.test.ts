import { describe, expect, it } from "vitest";
import { mergeVaccineRows, visibleStagesForBaby } from "./vaccines";

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
        catalog: catalog[0],
        status: "pending",
        given_on: null,
        lot_number: null,
        rowId: null,
      },
    ]);
  });
});
