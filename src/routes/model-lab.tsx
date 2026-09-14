import { createFileRoute } from "@tanstack/react-router";
import { ModelLab } from "@/components/gfi/model-lab";
export const Route = createFileRoute("/model-lab")({ component: ModelLab });
