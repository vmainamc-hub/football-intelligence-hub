import { createFileRoute } from "@tanstack/react-router";
import { PredictionsModule } from "@/components/gfi/functional-modules";
export const Route = createFileRoute("/predictions")({ component: PredictionsModule });
