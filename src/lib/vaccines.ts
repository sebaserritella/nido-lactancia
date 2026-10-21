import type { BabyVaccination, VaccineCatalogItem, VaccineLifeStage } from "../domain";

export type MergedVaccine =
  | {
      kind: "catalog";
      catalog: VaccineCatalogItem;
      displayName: string | null;
      status: "pending" | "done";
      given_on: string | null;
      lot_number: string | null;
      rowId: string | null;
    }
  | {
      kind: "custom";
      customName: string;
      status: "pending" | "done";
      given_on: string | null;
      lot_number: string | null;
      rowId: string;
    };

export type CatalogMergedVaccine = Extract<MergedVaccine, { kind: "catalog" }>;

function isCatalogMergeRow(row: BabyVaccination): row is BabyVaccination & { catalog_id: string } {
  if (row.catalog_id == null) return false;
  if (row.custom_name?.trim()) return false;
  return true;
}

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
): CatalogMergedVaccine[] {
  const byCatalog = new Map(
    rows.filter(isCatalogMergeRow).map((row) => [row.catalog_id, row] as const),
  );
  return catalog
    .filter((item) => item.active && stages.includes(item.life_stage))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => {
      const row = byCatalog.get(item.id);
      return {
        kind: "catalog" as const,
        catalog: item,
        displayName: row?.display_name ?? null,
        status: row?.status ?? "pending",
        given_on: row?.given_on ?? null,
        lot_number: row?.lot_number ?? null,
        rowId: row?.id ?? null,
      };
    });
}

export function customVaccineRows(rows: BabyVaccination[]): MergedVaccine[] {
  return rows
    .filter((row) => Boolean(row.custom_name?.trim()))
    .map((row) => ({
      kind: "custom" as const,
      customName: row.custom_name!.trim(),
      status: row.status,
      given_on: row.given_on,
      lot_number: row.lot_number,
      rowId: row.id,
    }));
}

export function vaccineTitle(item: MergedVaccine): string {
  if (item.kind === "custom") return item.customName;
  if (item.displayName) return item.displayName;
  return item.catalog.name;
}

export function isFutureDate(givenOn: string, today: string): boolean {
  return givenOn > today;
}
