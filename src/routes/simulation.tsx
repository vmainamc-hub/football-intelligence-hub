import { createFileRoute } from "@tanstack/react-router";
import { SimulationModule } from "@/components/gfi/functional-modules";
export const Route = createFileRoute("/simulation")({ component: SimulationModule });
