import { createFileRoute } from "@tanstack/react-router";
import { EvidenceModule } from "@/components/gfi/functional-modules";
export const Route = createFileRoute("/evidence")({ component: EvidenceModule });
