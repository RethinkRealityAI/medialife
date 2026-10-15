/**
 * A creator's merch shelf in the Partner Hub: the compact status on the
 * creators list, the "Merch shelf" card on a creator's page, and the button
 * that builds one in the team's look (src/lib/shelf/partner-shelves.functions.ts).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink, Loader2, PenLine, Store, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { CopyButton } from "@/components/hub/app/ui";
import { Surface, Tag } from "@/components/partner/ui";
import { Button } from "@/components/ui/button";
import { kitShelfPreview } from "@/lib/shelf/partner-presets";
import {
  partnerCreateShelfFn,
  partnerCreatorShelvesFn,
  type CreatorShelf,
} from "@/lib/shelf/partner-shelves.functions";
import { shelfPath } from "@/lib/shelf/shelves";
import { cn } from "@/lib/utils";

export const creatorShelvesKey = ["partner-hub", "creator-shelves"] as const;

/** creatorId → their shelf, for the team's creators. */
export function useCreatorShelves() {
  return useQuery({
    queryKey: creatorShelvesKey,
    queryFn: () => partnerCreatorShelvesFn(),
    staleTime: 30_000,
  });
}

const isLive = (s: CreatorShelf) => s.status !== "draft";

/** Make a shelf for a creator in the team's look, then open it in the builder. */
function useBuildShelf() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const build = async (creatorId: string, name: string) => {
    if (pending) return;
    setPending(true);
    try {
      const r = await partnerCreateShelfFn({
        data: { creator: name.trim().slice(0, 28) || "Creator", start: "preset", creatorId },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      await qc.invalidateQueries({ queryKey: creatorShelvesKey });
      toast.success(`${name}'s shelf is ready`);
      await navigate({ to: "/partner-hub/shelves", search: { shelf: r.slug } });
    } catch {
      toast.error("Couldn't build it. Try again.");
    } finally {
      setPending(false);
    }
  };
  return { build, pending };
}

export function BuildShelfButton({
  creatorId,
  name,
  variant = "ghost",
  className,
}: {
  creatorId: string;
  name: string;
  variant?: "ghost" | "outline" | "default";
  className?: string;
}) {
  const { build, pending } = useBuildShelf();
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      disabled={pending}
      onClick={() => void build(creatorId, name)}
      className={className}
      aria-label={`Build ${name}'s merch shelf`}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Wand2 aria-hidden />}
      {pending ? "Building…" : "Build their shelf"}
    </Button>
  );
}

/** For a list row: "Shelf live", "Shelf draft" or a quiet build button. */
export function CreatorShelfStatus({
  creatorId,
  name,
  shelf,
  loading,
  className,
}: {
  creatorId: string;
  name: string;
  shelf: CreatorShelf | undefined;
  loading: boolean;
  className?: string;
}) {
  if (loading) return <span aria-hidden className={cn("h-8", className)} />;
  if (!shelf)
    return (
      <span className={className}>
        <BuildShelfButton
          creatorId={creatorId}
          name={name}
          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
        />
      </span>
    );
  return (
    <span className={className}>
      <Link
        to="/partner-hub/shelves"
        search={{ shelf: shelf.slug }}
        className="inline-flex rounded-full focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none"
        aria-label={`${name}'s merch shelf: ${isLive(shelf) ? "live" : "draft"}. Open in the builder`}
      >
        {isLive(shelf) ? (
          <Tag tone="mint" className="hover:brightness-125">
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            Shelf live
          </Tag>
        ) : (
          <Tag tone="blue" className="hover:brightness-125">
            Shelf draft
          </Tag>
        )}
      </Link>
    </span>
  );
}

/** The "Merch shelf" card on a creator's page. */
export function MerchShelfCard({
  creatorId,
  name,
  kit,
  origin,
  className,
}: {
  creatorId: string;
  name: string;
  kit: string;
  origin: string;
  className?: string;
}) {
  const q = useCreatorShelves();
  const shelf = q.data?.[creatorId];
  const live = !!shelf && isLive(shelf);
  const url = shelf ? `${origin}${shelfPath(shelf.slug)}` : "";
  return (
    <Surface className={cn("overflow-hidden", className)}>
      <div className="flex flex-col @2xl/inset:flex-row">
        <div className="relative aspect-[1200/630] shrink-0 overflow-hidden border-b border-white/[0.06] bg-[#0b0a10] @2xl/inset:aspect-auto @2xl/inset:w-64 @2xl/inset:border-r @2xl/inset:border-b-0">
          <img
            src={shelf?.snapshot ?? kitShelfPreview(kit)}
            alt=""
            loading="lazy"
            className={cn(
              "size-full object-cover object-top @2xl/inset:absolute @2xl/inset:inset-0",
              !shelf && "opacity-60 saturate-50",
            )}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Store className="size-4 text-[var(--partner)]" aria-hidden /> Merch shelf
            </h2>
            {shelf ? (
              live ? (
                <Tag tone="mint">
                  <span aria-hidden className="size-1.5 rounded-full bg-current" />
                  Live
                </Tag>
              ) : (
                <Tag tone="blue">Draft</Tag>
              )
            ) : null}
          </div>
          {q.isPending ? (
            <div className="h-16" aria-hidden />
          ) : shelf ? (
            <>
              <p className="text-sm text-muted-foreground">
                {live
                  ? `${name}'s 3D merch shop in your look, with their name in neon. Send the link with your pitch.`
                  : "Not live yet. Publish it from the builder to get a link you can send."}
              </p>
              {live ? (
                <p className="min-w-0 truncate rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
                  {url}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to="/partner-hub/shelves" search={{ shelf: shelf.slug }}>
                    <PenLine aria-hidden /> Open in builder
                  </Link>
                </Button>
                {live ? (
                  <>
                    <CopyButton value={url} label="Copy link" toastText="Shelf link copied" />
                    <Button asChild variant="ghost" size="sm">
                      <a
                        href={`${shelfPath(shelf.slug)}?notrack=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink aria-hidden /> View
                      </a>
                    </Button>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                No shelf yet. Build {name} a 3D merch shop in your team&rsquo;s look, with their
                name in neon, ready to send.
              </p>
              <div>
                <BuildShelfButton creatorId={creatorId} name={name} variant="outline" />
              </div>
            </>
          )}
        </div>
      </div>
    </Surface>
  );
}
