export type FeedSide = "left" | "right" | "both";
export type FeedKind = "breast" | "bottle";
export type DiaperKind = "pee" | "poop" | "both";

export type Baby = {
  id: string;
  household_id: string;
  name: string;
  born_on: string | null;
};

export type Weight = {
  id: string;
  household_id: string;
  baby_id: string;
  weighed_on: string;
  grams: number | null;
  length_mm: number | null;
};

export type Feed = {
  id: string;
  household_id: string;
  baby_id: string;
  started_at: string;
  ended_at: string | null;
  paused_ms: number;
  paused_at: string | null;
  side: FeedSide | null;
  kind: FeedKind;
  ml: number | null;
  session_id: string | null;
};

export type Diaper = {
  id: string;
  household_id: string;
  baby_id: string;
  occurred_at: string;
  kind: DiaperKind;
};

export type RangeStats = {
  day_count: number;
  feed_count: number;
  feeds_per_day: number | null;
  minutes_per_feed: number | null;
  pee_per_day: number | null;
  poop_per_day: number | null;
  both_diapers_per_day: number | null;
  mean_gap_minutes: number | null;
};

export type VaccineLifeStage =
  | "pregnancy"
  | "newborn"
  | "up_to_1y"
  | "up_to_2y"
  | "age_5"
  | "age_11"
  | "age_15_64"
  | "age_65_plus";

export type VaccineCatalogItem = {
  id: string;
  code: string;
  name: string;
  life_stage: VaccineLifeStage;
  due_label: string;
  sort_order: number;
  active: boolean;
};

export type BabyVaccination = {
  id: string;
  baby_id: string;
  catalog_id: string;
  status: "pending" | "done";
  given_on: string | null;
  lot_number: string | null;
};
