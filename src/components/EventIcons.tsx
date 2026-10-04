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
        d="M3.2 7.1c0-1 .8-1.8 1.8-1.8h14c1 0 1.8.8 1.8 1.8v1.3c0 1.2-.6 2.15-1.55 2.7-.95.55-1.6 1.5-2 2.75-.5 1.5-.85 2.65-1.6 3.3-.7.6-1.55.95-2.65.95s-1.95-.35-2.65-.95c-.75-.65-1.1-1.8-1.6-3.3-.4-1.25-1.05-2.2-2-2.75-1-.55-1.55-1.5-1.55-2.7V7.1zm2.5 1.05h12.6v.95H5.7v-.95z"
      />
    </EventSvg>
  );
}
