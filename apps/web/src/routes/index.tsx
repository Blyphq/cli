import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { StudioPage } from "@/components/studio/studio-page";

export const Route = createFileRoute("/")({
  validateSearch: z.object({
    project: z.string().optional(),
  }),
  component: function StudioRoute() {
    const navigate = Route.useNavigate();
    const search = Route.useSearch();
    return <StudioPage navigate={navigate} search={search} />;
  },
});
