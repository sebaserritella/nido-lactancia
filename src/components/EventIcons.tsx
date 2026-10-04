import type { ReactNode } from "react";

type EventIconProps = {
  /** Spanish name only when nearby text does not already name this event. */
  label?: string;
};

function EventSvg({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <svg
      className="event-icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Milk drop for a feed. Pass label only when the control has no other name. */
export function FeedIcon({ label }: EventIconProps) {
  return (
    <EventSvg label={label}>
      <path fill="currentColor" d="M12 2.4c.55 2.15 5 6.55 5 10.85a5 5 0 1 1-10 0c0-4.3 4.45-8.7 5-10.85z" />
    </EventSvg>
  );
}

/** Diaper silhouette: wide waist and a narrow crotch, distinct from the drop. */
export function DiaperIcon({ label }: EventIconProps) {
  return (
    <EventSvg label={label}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M2 9 H7 V3.5 H17 V9 H22 V13 H18.5 C18.5 17.5 15.8 20 12 20 C8.2 20 5.5 17.5 5.5 13 H2 Z M9 5 H15 V6.8 H9 Z"
      />
    </EventSvg>
  );
}
