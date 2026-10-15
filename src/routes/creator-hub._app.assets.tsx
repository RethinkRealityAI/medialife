import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Box, Lightbulb, Palette, PenTool, Type, Weight, type LucideIcon } from "lucide-react";
import { z } from "zod";

import { ART, Tile, type Tone } from "@/components/hub/app/look";
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

const TIPS: Array<{ icon: LucideIcon; tone: Tone; title: string; body: string }> = [
  {
    icon: PenTool,
    tone: "ice",
    title: "Logos & wordmarks",
    body: "Vector (AI, SVG, EPS or PDF) stays sharp at any size. Add a transparent PNG too.",
  },
  {
    icon: Palette,
    tone: "pink",
    title: "Characters & art",
    body: "Transparent PNG, 3000px+ on the long side. Layered PSDs are great.",
  },
  {
    icon: Box,
    tone: "violet",
    title: "3D",
    body: "GLB is best: one file with textures. FBX, OBJ, STL, USDZ and Blender work too.",
  },
  { icon: Type, tone: "amber", title: "Fonts", body: "OTF or TTF for the lettering in your logo." },
  {
    icon: Weight,
    tone: "mint",
    title: "Size",
    body: `Up to ${MAX_MB} per file. Zip a folder of many small files.`,
  },
];

function Assets() {
  const ws = useWorkspace();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <Page>
      <PageHeader
        image={ART.keychain}
        imageClassName="object-[50%_40%]"
        eyebrow="Assets"
        title="Your brand, art and files"
        description="One place for everything we design from: logos, characters, 3D, video and more."
        actions={
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="rounded-full bg-black/30 backdrop-blur">
                <Lightbulb aria-hidden /> What works best
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="glass-strong w-80 rounded-2xl p-3">
              <dl className="space-y-1">
                {TIPS.map((t) => (
                  <div key={t.title} className="flex gap-3 rounded-xl p-2 text-sm">
                    <Tile icon={t.icon} tone={t.tone} size="sm" />
                    <div className="min-w-0">
                      <dt className="font-medium">{t.title}</dt>
                      <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {t.body}
                      </dd>
                    </div>
                  </div>
                ))}
              </dl>
            </PopoverContent>
          </Popover>
        }
      />
      <div className="mt-5">
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
