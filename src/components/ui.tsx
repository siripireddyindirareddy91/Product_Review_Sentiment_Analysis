import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, Inbox, X } from "lucide-react";
import type { Sentiment } from "../types";

export const sentiments: Sentiment[] = ["positive", "neutral", "negative"];
export const colors = {
  positive: "#35d6ab",
  neutral: "#f5b94c",
  negative: "#ff657a",
  violet: "#8b7cff",
};
export const number = (value: number) => Intl.NumberFormat().format(value);
export const percent = (value: number) =>
  `${Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}%`;
export const probability = (value: number) => percent(value * 100);
export const titleCase = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
export const showDate = (value: string | null) =>
  value
    ? new Date(
        value.length === 10 ? `${value}T00:00:00Z` : value,
      ).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Unavailable";

export function Heading({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Tag({ label }: { label: string }) {
  return (
    <span className={`tag ${label.toLowerCase()}`}>
      <i />
      {titleCase(label)}
    </span>
  );
}

export function Empty({
  title = "No results",
  text = "Try changing the filters or selecting a dataset with reviews.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty">
      <Inbox size={22} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

export function Busy() {
  return (
    <div className="skeleton-grid" aria-label="Loading" role="status">
      <i />
      <i />
      <i />
    </div>
  );
}

export function Failure({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div className="failure" role="alert">
      <AlertTriangle size={18} />
      <div>{error.message}</div>
      {retry && (
        <button className="button ghost small" onClick={retry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="dialog-body">
        <div className="panel-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Meter({ label, value }: { label: Sentiment; value: number }) {
  return (
    <div className="meter">
      <div>
        <Tag label={label} />
        <strong>{percent(value)}</strong>
      </div>
      <div className="meter-track">
        <span style={{ width: `${value}%`, background: colors[label] }} />
      </div>
    </div>
  );
}
