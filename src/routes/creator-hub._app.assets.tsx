import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Lightbulb } from "lucide-react";
import { z } from "zod";

import { Page, PageHeader } from "@/components/hub/app/ui";
import { useWorkspace } from "@/components/hub/app/workspace";
import { AssetLibrary, type LibraryNav } from "@/components/hub/assets/library";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HUB } from "@/lib/hub/model";

// The creator's asset library (src/components/hub/assets/library.tsx). The
// place, folder, filters and open file are in the URL, so a view can be
// bookmarked or sent to the team.

const idParam = z
  .string()
  .regex(/^[A-Za-z0-9]{6,60}$/)
  .optional()
  .catch(undefined);

export const Route = createFileRoute("/creator-hub/_app/assets")({
  validateSearch: z.object({
    s: z.string().max(24).optional().catch(undefined),
    folder: idParam,
    q: z.string().max(100).optional().catch(undefined),
    tag: z.string().max(64).optional().catch(undefined),
    type: z.string().max(16).optional().catch(undefined),
    file: idParam,
  }),
  head: () => ({ meta: [{ title: "Assets · Creator Hub | MEDIALIFE" }] }),
  component: Assets,
});

const MAX_MB = `${Math.round(HUB.maxUploadBytes / 1_048_576)} MB`;

const TIPS = [
  {
    title: "Logos & wordmarks",
    body: "Vector files (AI, SVG, EPS or PDF) stay sharp at any print size. Add a transparent PNG too.",
  },
  {
    title: "Characters & art",
    body: "Transparent PNG, 3000px or more on the long side. Layered PSDs are great.",
  },
  {
    title: "3D",
    body: "GLB is best: one file with its textures. FBX, OBJ, STL, USDZ and Blender work too.",
  },
  { title: "Fonts", body: "OTF or TTF files for the lettering in your logo and graphics." },
  { title: "Size", body: `Up to ${MAX_MB} per file. Zip a folder of many small files.` },
];

function Assets() {
  const ws = useWorkspace();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <Page className="lg:pt-8">
      <PageHeader
        title="Assets"
        description="Your brand, content and source files in one place. We work from here when we design your merch and experiences."
        actions={
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Lightbulb aria-hidden /> What works best
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <dl className="space-y-2.5 text-sm">
                {TIPS.map((t) => (
                  <div key={t.title}>
                    <dt className="font-medium">{t.title}</dt>
                    <dd className="mt-0.5 leading-relaxed text-muted-foreground">{t.body}</dd>
                  </div>
                ))}
              </dl>
            </PopoverContent>
          </Popover>
        }
      />
      <div className="mt-6">
        <AssetLibrary
          mode="creator"
          files={ws.files}
          folders={ws.folders}
          products={ws.products}
          nav={search}
          onNav={(next: LibraryNav, opts) =>
            void navigate({ search: next, replace: opts?.replace, resetScroll: false })
          }
          productHref={(id) => `/creator-hub/products/${id}`}
        />
      </div>
    </Page>
  );
}
