import { createFileRoute } from "@tanstack/react-router";
import { EngineArena } from "@/components/gfi/engine-arena";
export const Route = createFileRoute("/engines")({ component: EngineArena });
