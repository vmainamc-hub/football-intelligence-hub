import { createFileRoute } from "@tanstack/react-router";
import { SystemHealth } from "@/components/gfi/system-health";
export const Route = createFileRoute("/system")({ component: SystemHealth });
