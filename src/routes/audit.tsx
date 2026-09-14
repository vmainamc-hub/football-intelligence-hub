import { createFileRoute } from "@tanstack/react-router";
import { AuditLab } from "@/components/gfi/prediction-ledger";
export const Route = createFileRoute("/audit")({ component: AuditLab });
