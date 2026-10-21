import type { Baby } from "../domain";
import { es } from "../i18n/es";
import { developmentTipsForBaby } from "../lib/developmentTips";
import { todayLocalDate } from "../lib/localTime";

type DevelopmentSectionProps = {
  baby: Baby;
  timeZone: string;
};

export function DevelopmentSection({ baby, timeZone }: DevelopmentSectionProps) {
  const tip = developmentTipsForBaby(baby.born_on, todayLocalDate(timeZone));
  if (!tip) return null;

  return (
    <section className="card stack development">
      <h2>
        {es.development} · {baby.name}
      </h2>
      <p className="muted">{tip.title}</p>
      <div className="stack">
        <h3 className="vaccine-stage-title">{es.developmentExpected}</h3>
        <ul className="entries plain">
          {tip.expected.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div className="stack">
        <h3 className="vaccine-stage-title">{es.developmentConsultIf}</h3>
        <ul className="entries plain">
          {tip.consultIf.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div className="stack">
        <h3 className="vaccine-stage-title">{es.developmentTipsHeading}</h3>
        <ul className="entries plain">
          {tip.tips.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <p className="muted">{es.developmentDisclaimer}</p>
    </section>
  );
}
