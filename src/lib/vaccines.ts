import type { BabyVaccination, VaccineCatalogItem, VaccineLifeStage } from "../domain";

export type MergedVaccine = {
  catalog: VaccineCatalogItem;
  status: "pending" | "done";
  given_on: string | null;
  lot_number: string | null;
  rowId: string | null;
};

export function visibleStagesForBaby(bornOn: string | null, today: string): VaccineLifeStage[] {
  const base: VaccineLifeStage[] = ["newborn", "up_to_1y", "up_to_2y"];
  if (!bornOn) return base;
  const birth = new Date(`${bornOn}T00:00:00`);
  const now = new Date(`${today}T00:00:00`);
  const years =
    now.getFullYear() -
    birth.getFullYear() -
    (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
  if (years >= 5) return [...base, "age_5"];
  return base;
}

export function mergeVaccineRows(
  catalog: VaccineCatalogItem[],
  rows: BabyVaccination[],
  stages: VaccineLifeStage[],
): MergedVaccine[] {
  const byCatalog = new Map(rows.map((row) => [row.catalog_id, row]));
  return catalog
    .filter((item) => item.active && stages.includes(item.life_stage))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => {
      const row = byCatalog.get(item.id);
      return {
        catalog: item,
        status: row?.status ?? "pending",
        given_on: row?.given_on ?? null,
        lot_number: row?.lot_number ?? null,
        rowId: row?.id ?? null,
      };
    });
}

export function isFutureDate(givenOn: string, today: string): boolean {
  return givenOn > today;
}
