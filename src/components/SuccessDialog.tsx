import { es } from "../i18n/es";
import type { SuccessNotice } from "../lib/successCopy";

type SuccessDialogProps = {
  notice: SuccessNotice;
  onClose: () => void;
};

export function SuccessDialog({ notice, onClose }: SuccessDialogProps) {
  return (
    <div className="success-overlay" role="presentation">
      <div className="success-dialog" role="dialog" aria-modal="true" aria-labelledby="success-title">
        <h2 id="success-title">{notice.title}</h2>
        <div className="success-lines">
          {notice.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <button type="button" onClick={onClose}>
          {es.done}
        </button>
      </div>
    </div>
  );
}
