import { createFileRoute } from "@tanstack/react-router";
import { EnginesModule } from "@/components/gfi/functional-modules";
export const Route = createFileRoute("/engines")({ component: EnginesModule });
