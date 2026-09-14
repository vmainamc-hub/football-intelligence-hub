import { createFileRoute } from "@tanstack/react-router";
import { BatchModule } from "@/components/gfi/functional-modules";
export const Route = createFileRoute("/batch")({ component: BatchModule });
