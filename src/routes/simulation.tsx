import { createFileRoute } from "@tanstack/react-router";
import { SimulationLab } from "@/components/gfi/simulation-lab";

export const Route = createFileRoute("/simulation")({ component: SimulationLab });
