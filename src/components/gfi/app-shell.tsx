import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  Activity,
  Beaker,
  ClipboardList,
  Cpu,
  FileSearch,
  FlaskConical,
  Gauge,
  Layers,
  Menu,
  ScanSearch,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Primary navigation for the intelligence platform.
 *
 * The nav mirrors the analysis pipeline order: acquire -> investigate ->
 * compare -> record -> audit. Kept to the nine working areas only.
 */
const NAV = [
  { to: "/", label: "Home", hint: "Search any match", icon: ScanSearch },
  { to: "/batch", label: "Batch lab", hint: "1-24 matches", icon: Layers },
  { to: "/simulation", label: "Simulation", hint: "Scenario explorer", icon: FlaskConical },
  { to: "/engines", label: "Engine arena", hint: "Model-by-model", icon: Cpu },
  { to: "/evidence", label: "Evidence", hint: "Sources & claims", icon: FileSearch },
  { to: "/predictions", label: "Predictions", hint: "Immutable ledger", icon: ClipboardList },
  { to: "/model-lab", label: "Model lab", hint: "Calibration", icon: Beaker },
  { to: "/audit", label: "Post-match audit", hint: "Settled results", icon: Gauge },
  { to: "/system", label: "System health", hint: "Providers & data", icon: Activity },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {NAV.map((item) => {
        const active =
          item.to === "/"
            ? pathname === "/" || pathname.startsWith("/match")
            : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-md px-3 py-2 transition-colors",
              active
                ? "bg-elevated text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon
              className={cn("size-4 shrink-0", active ? "text-primary" : "")}
              strokeWidth={1.75}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.label}</span>
              <span className="block truncate text-[0.6875rem] text-muted-foreground">
                {item.hint}
              </span>
            </span>
            {active ? <span className="size-1.5 rounded-full bg-primary" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-4 py-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border-strong bg-elevated">
        <span className="block size-2.5 rounded-full bg-primary" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[0.8125rem] font-semibold tracking-tight">
          GLOBAL FOOTBALL
        </span>
        <span className="label-xs block">Intelligence</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-sidebar lg:flex">
        <Wordmark />
        <div className="flex-1 overflow-y-auto">
          <NavList />
        </div>
        <p className="border-t border-border px-4 py-3 text-[0.6875rem] leading-relaxed text-muted-foreground">
          Probabilities come from quantitative engines. No outcome is asserted without evidence.
        </p>
      </aside>

      {/* Mobile bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur lg:hidden">
        <Wordmark />
        <button
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen((v) => !v)}
          className="mr-3 grid size-9 place-items-center rounded-md border border-border text-muted-foreground"
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </header>

      {open ? (
        <div className="sticky top-[57px] z-30 border-b border-border bg-sidebar lg:hidden">
          <NavList onNavigate={() => setOpen(false)} />
        </div>
      ) : null}

      <main className="min-w-0">{children}</main>
    </div>
  );
}
