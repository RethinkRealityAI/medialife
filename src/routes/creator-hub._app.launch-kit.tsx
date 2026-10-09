import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AtSign,
  BriefcaseBusiness,
  ExternalLink,
  Heart,
  MessageCircle,
  MessagesSquare,
  MonitorPlay,
  Pin,
  Repeat2,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import { z } from "zod";

import { FileGallery } from "@/components/hub/app/gallery";
import { ProductThumb } from "@/components/hub/app/product-card";
import { TriggerCard } from "@/components/hub/app/qr-download";
import {
  Card,
  CopyButton,
  EmptyState,
  Monogram,
  Page,
  PageHeader,
  Pill,
} from "@/components/hub/app/ui";
import { useWorkspace, type WsExperience, type WsProduct } from "@/components/hub/app/workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  COLLATERAL_KINDS,
  SKUS,
  fileUrl,
  shortDate,
  stageIndex,
  stageOf,
  triggerUrl,
  type CollateralKind,
  type HubFile,
} from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creator-hub/_app/launch-kit")({
  validateSearch: z.object({ product: z.string().max(60).optional().catch(undefined) }),
  head: () => ({ meta: [{ title: "Launch kit · Creator Hub | MEDIALIFE" }] }),
  component: LaunchKit,
});

type PlatformId = "youtube" | "x" | "discord" | "pinned";
type Template = { id: PlatformId; label: string; icon: LucideIcon; limit?: number; text: string };

function templates(p: WsProduct, e: WsExperience | undefined): Template[] {
  const live = p.stage === "live";
  const shop = p.commerce.shopUrl || "[shop link]";
  const reward = e?.reward
    ? e.reward.charAt(0).toLowerCase() + e.reward.slice(1)
    : "a secret experience";
  const how =
    p.trigger.method === "qr"
      ? "Scan it"
      : p.trigger.method === "nfc"
        ? "Tap your phone on it"
        : "Scan or tap it";
  const howLower = how.charAt(0).toLowerCase() + how.slice(1);
  const when = p.eta ? shortDate(p.eta) : "soon";
  return live
    ? [
        {
          id: "youtube",
          label: "YouTube community post",
          icon: MonitorPlay,
          text: `The ${p.name} is here!\n\nIt's not just merch: ${howLower} with your phone and it unlocks ${reward}. No app needed, it opens right in your browser.\n\nGet yours: ${shop}`,
        },
        {
          id: "x",
          label: "X post",
          icon: AtSign,
          limit: 280,
          text: `${p.name} is live 👀\n\n${how} to unlock ${reward}. No app needed.\n\n${shop}`,
        },
        {
          id: "discord",
          label: "Discord announcement",
          icon: MessagesSquare,
          text: `@everyone New merch drop: **${p.name}**\n\nEvery one is activated. ${how} with your phone to unlock ${reward}. Works right in the browser.\n\nShop: ${shop}`,
        },
        {
          id: "pinned",
          label: "Pinned comment",
          icon: Pin,
          text: `📌 The ${p.name} is out now! ${how} to unlock ${reward}. ${shop}`,
        },
      ]
    : [
        {
          id: "youtube",
          label: "YouTube community post",
          icon: MonitorPlay,
          text: `Something's coming: the ${p.name}.\n\nIt's activated merch: ${howLower} with your phone and it unlocks ${reward}. No app needed.\n\nDrops ${when}. Stay tuned.`,
        },
        {
          id: "x",
          label: "X post",
          icon: AtSign,
          limit: 280,
          text: `New merch soon: the ${p.name}. ${how} to unlock ${reward} 👀\n\nDrops ${when}.`,
        },
        {
          id: "discord",
          label: "Discord announcement",
          icon: MessagesSquare,
          text: `@everyone Sneak peek: **${p.name}** is on its way.\n\nIt's activated: ${howLower} with your phone to unlock ${reward}. Shop link coming on launch day.`,
        },
        {
          id: "pinned",
          label: "Pinned comment",
          icon: Pin,
          text: `📌 The ${p.name} drops ${when}. ${how} to unlock ${reward}.`,
        },
      ];
}

function LaunchKit() {
  const ws = useWorkspace();
  const { product: wanted } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const products = [...ws.products].sort(
    (a, b) =>
      (a.stage === "live" ? 0 : 1) - (b.stage === "live" ? 0 : 1) ||
      stageIndex(b.stage) - stageIndex(a.stage),
  );
  const p = products.find((x) => x.id === wanted) ?? products[0];

  if (!p) {
    return (
      <Page>
        <PageHeader title="Launch kit" />
        <EmptyState
          icon={BriefcaseBusiness}
          title="Your launch kit fills up as products get close to launch"
          className="mt-6"
        >
          Activation links, QR codes, mockups and ready-to-post announcements appear here for each
          product.
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page className="lg:pt-8">
      <PageHeader
        title="Launch kit"
        description="Everything to promote a drop: the link, the QR code, promo files and posts to copy."
      />

      <nav
        aria-label="Choose a product"
        className="-mx-4 mt-5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
      >
        <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
          {products.map((x) => {
            const on = x.id === p.id;
            return (
              <li key={x.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    navigate({ search: { product: x.id }, replace: true, resetScroll: false })
                  }
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    on
                      ? "border-primary/60 bg-primary/12 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ProductThumb product={x} className="size-8 rounded-full" />
                  {x.name}
                  {x.stage === "live" ? (
                    <span className="size-1.5 rounded-full bg-emerald-400" aria-label="(on sale)" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <ProductKit
        key={p.id}
        product={p}
        origin={ws.origin}
        creatorName={ws.creator.profile.displayName || "You"}
        handle={
          ws.creator.channels.find((c) => c.primary)?.handle ?? ws.creator.channels[0]?.handle ?? ""
        }
        experience={ws.experiences.find((e) => e.id === p.experienceId)}
        files={ws.files.filter(
          (f) =>
            f.productId === p.id && (f.kind === "collateral" || f.kind === "mockup") && f.complete,
        )}
      />
    </Page>
  );
}

function ProductKit({
  product: p,
  origin,
  creatorName,
  handle,
  experience,
  files,
}: {
  product: WsProduct;
  origin: string;
  creatorName: string;
  handle: string;
  experience: WsExperience | undefined;
  files: HubFile[];
}) {
  const live = p.stage === "live";
  const list = templates(p, experience);
  const [open, setOpen] = useState<PlatformId | null>(null);
  const order = Object.keys(COLLATERAL_KINDS);
  const kindOf = (f: HubFile) =>
    f.kind === "mockup" ? "mockup" : order.includes(f.category) ? f.category : "other";
  const sorted = [...files].sort((a, b) => order.indexOf(kindOf(a)) - order.indexOf(kindOf(b)));

  return (
    <div className="mt-5 space-y-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-lg font-medium">
          <Link
            to="/creator-hub/products/$productId"
            params={{ productId: p.id }}
            className="hover:text-primary"
          >
            {p.name}
          </Link>
        </h2>
        <Pill tone={live ? "live" : "primary"}>{live ? "On sale" : stageOf(p.stage).name}</Pill>
        <span className="text-sm text-muted-foreground">
          {SKUS[p.sku].short}
          {p.campaign ? ` · ${p.campaign}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 @4xl/inset:grid-cols-2">
        <Card title="Link & QR code" labelledBy="kit-qr" className="@container">
          <TriggerCard
            url={triggerUrl(origin, p.trigger.code)}
            name={p.name}
            method={p.trigger.method}
            placement={p.trigger.placement}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">Shop link</span>
            {p.commerce.shopUrl ? (
              <>
                <a
                  href={p.commerce.shopUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                >
                  {p.commerce.shopUrl.replace(/^https?:\/\//, "")}
                </a>
                <CopyButton value={p.commerce.shopUrl} label="Copy" toastText="Shop link copied" />
                <Button asChild variant="ghost" size="sm">
                  <a
                    href={p.commerce.shopUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open the shop page for ${p.name}`}
                  >
                    <ExternalLink aria-hidden />
                  </a>
                </Button>
              </>
            ) : (
              <span className="text-muted-foreground">· arrives at launch</span>
            )}
          </div>
        </Card>

        <Card title="Posts to copy" labelledBy="kit-posts">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {list.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setOpen(t.id)}
                  className="group flex h-full w-full flex-col gap-1.5 rounded-lg border border-border bg-background/40 p-3 text-left transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-haspopup="dialog"
                >
                  <span className="flex items-center gap-2 text-xs font-medium">
                    <t.icon className="size-3.5 text-primary" aria-hidden />
                    {t.label}
                  </span>
                  <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {t.text.replace(/\*\*/g, "")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!p.commerce.shopUrl ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Shop link arrives at launch; the posts will include it automatically.
            </p>
          ) : null}
        </Card>
      </div>

      <Card
        title="Promo files"
        labelledBy="kit-files"
        action={
          <span className="text-xs text-muted-foreground">
            {files.length} file{files.length === 1 ? "" : "s"}
          </span>
        }
      >
        {sorted.length ? (
          <FileGallery
            files={sorted}
            label={(f) => COLLATERAL_KINDS[kindOf(f) as CollateralKind]}
            className="@3xl/inset:grid-cols-5 @5xl/inset:grid-cols-6"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Posters, social posts and mockups for this product arrive before launch.
          </p>
        )}
      </Card>

      <PostDialog
        template={list.find((t) => t.id === open) ?? null}
        onClose={() => setOpen(null)}
        creatorName={creatorName}
        handle={handle}
        image={files.find((f) => f.kind === "collateral" && f.category === "social") ?? files[0]}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   A post, full text, editable, with a preview styled like the platform
   --------------------------------------------------------------------------- */

function PostDialog({
  template: t,
  onClose,
  creatorName,
  handle,
  image,
}: {
  template: Template | null;
  onClose: () => void;
  creatorName: string;
  handle: string;
  image: HubFile | undefined;
}) {
  const [text, setText] = useState(t?.text ?? "");
  useEffect(() => setText(t?.text ?? ""), [t]);
  const over = t?.limit ? text.length > t.limit : false;

  return (
    <Dialog open={!!t} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[100dvh] w-full overflow-y-auto sm:max-w-3xl">
        {t ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <t.icon className="size-4 text-primary" aria-hidden /> {t.label}
              </DialogTitle>
              <DialogDescription>
                Edit it if you like, then copy it into{" "}
                {t.id === "discord" ? "Discord" : t.id === "x" ? "X" : "YouTube"}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col">
                <label htmlFor="post-text" className="sr-only">
                  Post text
                </label>
                <Textarea
                  id="post-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={9}
                  className="flex-1 text-sm leading-relaxed"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      over ? "text-red-300" : "text-muted-foreground",
                    )}
                    aria-live="polite"
                  >
                    {text.length}
                    {t.limit ? ` / ${t.limit}` : ""} characters{over ? " — too long for X" : ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setText(t.text)}
                    disabled={text === t.text}
                  >
                    Reset
                  </Button>
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs text-muted-foreground">Preview</div>
                <PlatformPreview
                  id={t.id}
                  text={text}
                  name={creatorName}
                  handle={handle}
                  image={image}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <CopyButton
                value={text}
                label="Copy post"
                variant="default"
                size="default"
                toastText={`${t.label} copied`}
              />
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Renders **bold** as Discord does; everything else as plain text. */
function discordText(text: string) {
  return text.split(/(\*\*[^*]+\*\*|@everyone)/g).map((part, i) =>
    part.startsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : part === "@everyone" ? (
      <span key={i} className="rounded bg-[#5865f2]/30 px-0.5 text-[#c9cdfb]">
        @everyone
      </span>
    ) : (
      part
    ),
  );
}

function PlatformPreview({
  id,
  text,
  name,
  handle,
  image,
}: {
  id: PlatformId;
  text: string;
  name: string;
  handle: string;
  image: HubFile | undefined;
}) {
  const at = handle
    ? handle.startsWith("@")
      ? handle
      : `@${handle}`
    : `@${name.toLowerCase().replace(/\s+/g, "")}`;
  if (id === "discord") {
    return (
      <div className="rounded-lg bg-[#313338] p-4 font-sans text-[15px] leading-relaxed text-[#dbdee1]">
        <div className="flex gap-3">
          <Monogram name={name} className="size-10" />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-[#f2f3f5]">{name}</span>
              <span className="text-xs text-[#949ba4]">Today at 6:00 PM</span>
            </div>
            <p className="break-words whitespace-pre-line">{discordText(text)}</p>
          </div>
        </div>
      </div>
    );
  }
  if (id === "x") {
    return (
      <div className="rounded-xl border border-[#2f3336] bg-black p-4 text-[15px] leading-normal text-[#e7e9ea]">
        <div className="flex gap-3">
          <Monogram name={name} className="size-10" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5 text-[15px]">
              <span className="truncate font-bold">{name}</span>
              <span className="truncate text-[#71767b]">{at} · now</span>
            </div>
            <p className="mt-0.5 break-words whitespace-pre-line">{text}</p>
            <div className="mt-3 flex justify-between pr-6 text-[#71767b]" aria-hidden>
              <MessageCircle className="size-4" />
              <Repeat2 className="size-4" />
              <Heart className="size-4" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (id === "pinned") {
    return (
      <div className="rounded-xl bg-[#0f0f0f] p-4 text-sm text-[#f1f1f1]">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-[#aaa]">
          <Pin className="size-3.5" aria-hidden /> Pinned by {at}
        </div>
        <div className="flex gap-3">
          <Monogram name={name} className="size-9" />
          <div className="min-w-0">
            <div className="text-[13px]">
              <span className="rounded-full bg-[#272727] px-1.5 py-0.5 font-medium">{at}</span>{" "}
              <span className="text-[#aaa]">now</span>
            </div>
            <p className="mt-1 break-words whitespace-pre-line">{text}</p>
            <div className="mt-2 flex items-center gap-4 text-[#aaa]" aria-hidden>
              <ThumbsUp className="size-4" />
              <span className="text-xs font-medium">Reply</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[#3f3f3f] bg-[#0f0f0f] p-4 text-sm text-[#f1f1f1]">
      <div className="flex items-center gap-3">
        <Monogram name={name} className="size-9" />
        <div className="text-[13px]">
          <div className="font-medium">{name}</div>
          <div className="text-[#aaa]">just now</div>
        </div>
      </div>
      <p className="mt-3 break-words whitespace-pre-line">{text}</p>
      {image ? (
        <img src={fileUrl(image)} alt="" className="mt-3 max-h-48 w-full rounded-lg object-cover" />
      ) : null}
      <div className="mt-3 flex items-center gap-4 text-[#aaa]" aria-hidden>
        <ThumbsUp className="size-4" />
        <MessageCircle className="size-4" />
      </div>
    </div>
  );
}
