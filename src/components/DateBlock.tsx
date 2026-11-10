import { formatCalendarDate } from "../lib/age";

const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Day number over a short month. Adds the year when it is not the current one. */
export function DateBlock({ isoDate, currentYear }: { isoDate: string; currentYear: string }) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return <div className="item-date">{isoDate}</div>;
  const [, year, month, day] = match;
  return (
    <div className="item-date" aria-label={formatCalendarDate(isoDate)} title={formatCalendarDate(isoDate)}>
      <b aria-hidden="true">{Number(day)}</b>
      <span aria-hidden="true">
        {months[Number(month) - 1]}
        {year !== currentYear ? ` ${year.slice(2)}` : ""}
      </span>
    </div>
  );
}
