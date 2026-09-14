import { createFileRoute } from "@tanstack/react-router";
import { AuditModule } from "@/components/gfi/functional-modules";
export const Route = createFileRoute("/audit")({ component: AuditModule });
