import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page frame: consistent gutters and max width across every area. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-[1400px] px-5 py-7 sm:px-7 lg:px-9", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="label-xs">{eyebrow}</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("panel flex flex-col overflow-hidden", className)}>
      {title ? (
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="label-xs">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("min-w-0 flex-1 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

type Tone = "neutral" | "primary" | "positive" | "warning" | "critical" | "dormant";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  primary: "border-primary/40 bg-primary/12 text-primary",
  positive: "border-positive/40 bg-positive/12 text-positive",
  warning: "border-warning/40 bg-warning/12 text-warning",
  critical: "border-destructive/45 bg-destructive/12 text-destructive",
  dormant: "border-border bg-transparent text-muted-foreground",
};

/** Status chip. Mono + uppercase so system states read as machine output. */
export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-wider whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Single headline figure with its label. */
export function Metric({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "primary" | "positive" | "warning" | "critical";
  className?: string;
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "positive"
        ? "text-positive"
        : tone === "warning"
          ? "text-warning"
          : tone === "critical"
            ? "text-destructive"
            : "text-foreground";
  return (
    <div className={cn("min-w-0", className)}>
      <p className="label-xs">{label}</p>
      <p className={cn("metric mt-1 text-xl font-semibold sm:text-2xl", toneClass)} data-numeric>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(digits)}%`;

export const num = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(digits);

/** Colour ramp used consistently for any 0-1 quality/agreement measure. */
export function qualityTone(v: number): Tone {
  if (v >= 0.75) return "positive";
  if (v >= 0.5) return "primary";
  if (v >= 0.3) return "warning";
  return "critical";
}

/** Horizontal probability bar. Width encodes magnitude; colour encodes band. */
export function Bar({
  value,
  tone = "primary",
  className,
}: {
  value: number;
  tone?: "primary" | "positive" | "warning" | "critical" | "muted";
  className?: string;
}) {
  const fill =
    tone === "positive"
      ? "bg-positive"
      : tone === "warning"
        ? "bg-warning"
        : tone === "critical"
          ? "bg-destructive"
          : tone === "muted"
            ? "bg-border-strong"
            : "bg-primary";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", fill)}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

/** Label + bar + figure, the workhorse row for market probabilities. */
export function BarRow({
  label,
  value,
  right,
  tone,
}: {
  label: ReactNode;
  value: number;
  right?: ReactNode;
  tone?: "primary" | "positive" | "warning" | "critical" | "muted";
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-1.5">
      <span className="min-w-0 truncate text-sm">{label}</span>
      <span className="metric text-sm tabular-nums" data-numeric>
        {right ?? pct(value)}
      </span>
      <div className="col-span-2">
        <Bar value={value} tone={tone} />
      </div>
    </div>
  );
}

/** Consistent empty/blocked state. Always tells the user the next action. */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** Skeleton block used while a panel's data is in flight. */
export function Loading({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-muted"
          style={{ width: `${92 - i * 11}%` }}
        />
      ))}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="panel border-destructive/40 bg-destructive/8 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

/** Dense data table shell — one border language everywhere. */
export function DataTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="-mx-4 -mb-4 overflow-x-auto">
      <table className={cn("w-full min-w-[640px] border-collapse text-sm", className)}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "label-xs sticky top-0 z-10 border-b border-border bg-card px-4 py-2.5 text-left font-normal",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td className={cn("border-b border-border/60 px-4 py-2.5 align-middle", className)}>
      {children}
    </td>
  );
}
