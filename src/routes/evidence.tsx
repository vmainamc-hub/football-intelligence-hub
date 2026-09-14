import { createFileRoute } from "@tanstack/react-router";
import { EvidenceLab } from "@/components/gfi/evidence-lab";
export const Route = createFileRoute("/evidence")({ component: EvidenceLab });
