import { Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, CircleDashed } from "lucide-react";

export function ModulePage({ title, eyebrow, description, stages }: { title: string; eyebrow: string; description: string; stages: { name: string; detail: string; live?: boolean }[] }) {
  return <div className="mx-auto max-w-6xl px-5 py-10 lg:px-10">
    <Link to="/" className="label-xs inline-flex items-center gap-2 hover:text-foreground"><ArrowLeft className="size-3" /> HOME</Link>
    <header className="mt-8 border-b border-border pb-8"><div className="label-xs text-primary">{eyebrow}</div><h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></header>
    <div className="mt-7 grid gap-3">{stages.map((s) => <div key={s.name} className="panel flex items-start gap-4 p-5"><div className="mt-0.5">{s.live ? <CheckCircle2 className="size-5 text-positive" /> : <CircleDashed className="size-5 text-muted-foreground" />}</div><div className="min-w-0 flex-1"><div className="font-medium">{s.name}</div><p className="mt-1 text-sm leading-6 text-muted-foreground">{s.detail}</p></div><span className="label-xs">{s.live ? "ACTIVE" : "READY"}</span></div>)}</div>
  </div>;
}
