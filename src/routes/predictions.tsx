import { createFileRoute } from "@tanstack/react-router";
import { PredictionsLab } from "@/components/gfi/prediction-ledger";
export const Route = createFileRoute("/predictions")({ component: PredictionsLab });
