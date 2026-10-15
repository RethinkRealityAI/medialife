import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  AtSign,
  BriefcaseBusiness,
  ExternalLink,
  Heart,
  Images,
  MessageCircle,
  MessagesSquare,
  MonitorPlay,
  Pin,
  QrCode,
  Repeat2,
  Store,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import { z } from "zod";

import { FileGallery } from "@/components/hub/app/gallery";
import {
  ART,
  GoChip,
  HubTab,
  HubTabs,
  TabIntro,
  Tile,
  lift,
  surface,
  type Tone,
} from "@/components/hub/app/look";
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

const KIT_TABS = ["link", "posts", "files"] as const;
type KitTab = (typeof KIT_TABS)[number];

export const Route = createFileRoute("/creator-hub/_app/launch-kit")({
  validateSearch: z.object({
    product: z.string().max(60).optional().catch(undefined),
    tab: z.enum(KIT_TABS).optional().catch(undefined),
  }),
  head: () => ({ meta: [{ title: "Launch kit · Creator Hub | MEDIALIFE" }] }),
  component: LaunchKit,
});

type PlatformId = "youtube" | "x" | "discord" | "pinned";
type Template = { id: PlatformId; label: string; icon: LucideIcon; limit?: number; text: string };

/** Each platform's own colour on its tile, so the posts read at a glance. */
const PLATFORM_TILE: Record<PlatformId, { tone: Tone; className?: string }> = {
  youtube: {
    tone: "amber",
    className: "from-[#ff4e45]/35 to-[#ff4e45]/5 text-[#ff8a84] ring-[#ff4e45]/30",
  },
  x: { tone: "ice", className: "from-white/25 to-white/5 text-white ring-white/25" },
  discord: {
    tone: "blue",
    className: "from-[#5865f2]/40 to-[#5865f2]/5 text-[#aab1fb] ring-[#5865f2]/35",
  },
  pinned: { tone: "amber" },
};

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
  const { product: wanted, tab = "link" } = Route.useSearch();
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
        <PageHeader
          image={ART.mat}
          imageClassName="object-[40%_50%]"
          eyebrow="Launch kit"
          title="Everything to promote a drop"
        />
        <EmptyState
          icon={BriefcaseBusiness}
          title="Your kit fills up as launch gets close"
          className="mt-4"
          image={ART.hoodie}
        >
          Activation links, QR codes, mockups and ready-to-post announcements for each product.
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        image={ART.mat}
        imageClassName="object-[40%_50%]"
        eyebrow="Launch kit"
        title="Everything to promote a drop"
        description="Your link and QR code, posts to copy, and promo files. Pick a product."
      />

      <nav
        aria-label="Choose a product"
        className="-mx-4 mt-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
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
                    navigate({
                      search: (prev) => ({ ...prev, product: x.id }),
                      replace: true,
                      resetScroll: false,
                    })
                  }
                  className={cn(
                    surface,
                    "flex h-12 items-center gap-2.5 rounded-full py-1 pr-4 pl-1 text-sm whitespace-nowrap transition-[border-color,background] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none",
                    on
                      ? "border-[var(--partner)]/55 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--partner)_22%,transparent),color-mix(in_oklab,var(--partner-2)_16%,transparent))] text-foreground"
                      : "text-muted-foreground hover:border-white/20 hover:text-foreground",
                  )}
                >
                  <ProductThumb product={x} className="size-10 rounded-full border-white/15" />
                  {x.name}
                  {x.stage === "live" ? (
                    <span className="size-2 rounded-full bg-emerald-400" aria-label="(on sale)" />
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
        tab={tab}
        onTab={(t) =>
          navigate({
            search: (prev) => ({ ...prev, tab: t === "link" ? undefined : t }),
            replace: true,
            resetScroll: false,
          })
        }
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
  tab,
  onTab,
  origin,
  creatorName,
  handle,
  experience,
  files,
}: {
  product: WsProduct;
  tab: KitTab;
  onTab: (t: KitTab) => void;
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
    <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
      <HubTabs<KitTab>
        label="Launch kit sections"
        value={tab}
        onChange={onTab}
        className="mt-3"
        tabs={[
          { id: "link", label: "Link & QR", icon: QrCode },
          {
            id: "posts",
            label: "Posts",
            icon: MessagesSquare,
            badge: (
              <span className="rounded-full bg-white/[0.08] px-1.5 text-xs tabular-nums">
                {list.length}
              </span>
            ),
          },
          {
            id: "files",
            label: "Promo files",
            icon: Images,
            badge: (
              <span className="rounded-full bg-white/[0.08] px-1.5 text-xs tabular-nums">
                {files.length}
              </span>
            ),
          },
        ]}
      >
        <HubTab value="link">
          <div className="grid grid-cols-1 gap-4 @4xl/inset:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card
              title="Activation link & QR code"
              icon={QrCode}
              tone="ice"
              labelledBy="kit-qr"
              className="@container"
            >
              <TriggerCard
                url={triggerUrl(origin, p.trigger.code)}
                name={p.name}
                method={p.trigger.method}
                placement={p.trigger.placement}
              />
            </Card>
            <Card title="Shop link" icon={Store} tone="mint" labelledBy="kit-shop">
              <div className="flex items-center gap-3">
                <ProductThumb product={p} className="size-14 rounded-xl border-white/10" />
                <div className="min-w-0">
                  <Link
                    to="/creator-hub/products/$productId"
                    params={{ productId: p.id }}
                    className="block truncate font-medium hover:text-[var(--partner)]"
                  >
                    {p.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Pill tone={live ? "live" : "primary"}>
                      {live ? "On sale" : stageOf(p.stage).name}
                    </Pill>
                    <span className="text-xs text-muted-foreground">{SKUS[p.sku].short}</span>
                  </div>
                </div>
              </div>
              {p.commerce.shopUrl ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <a
                    href={p.commerce.shopUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate rounded-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs underline-offset-4 hover:underline"
                  >
                    {p.commerce.shopUrl.replace(/^https?:\/\//, "")}
                  </a>
                  <CopyButton
                    value={p.commerce.shopUrl}
                    label="Copy"
                    toastText="Shop link copied"
                    className="rounded-full"
                  />
                  <Button asChild variant="ghost" size="sm" className="rounded-full">
                    <a
                      href={p.commerce.shopUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open the shop page for ${p.name}`}
                    >
                      <ExternalLink aria-hidden />
                    </a>
                  </Button>
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-white/10 p-3 text-sm text-muted-foreground">
                  The shop link arrives on launch day. Posts pick it up automatically.
                </p>
              )}
            </Card>
          </div>
        </HubTab>

        <HubTab value="posts">
          <TabIntro>
            {live ? "Ready to post now." : "Teasers for before launch."} Open one to edit, preview
            and copy.
          </TabIntro>
          <ul className="grid grid-cols-1 gap-3 @3xl/inset:grid-cols-2">
            {list.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setOpen(t.id)}
                  className={cn(surface, lift, "group flex h-full w-full gap-3.5 p-4 text-left")}
                  aria-haspopup="dialog"
                >
                  <Tile
                    icon={t.icon}
                    tone={PLATFORM_TILE[t.id].tone}
                    className={PLATFORM_TILE[t.id].className}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{t.label}</span>
                    <span className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {t.text.replace(/\*\*/g, "")}
                    </span>
                  </span>
                  <GoChip className="self-center" />
                </button>
              </li>
            ))}
          </ul>
        </HubTab>

        <HubTab value="files">
          {sorted.length ? (
            <FileGallery
              files={sorted}
              label={(f) => COLLATERAL_KINDS[kindOf(f) as CollateralKind]}
              className="grid-cols-2 gap-3 @3xl/inset:grid-cols-4 @5xl/inset:grid-cols-5"
            />
          ) : (
            <EmptyState icon={Images} title="Promo files arrive before launch" image={ART.tee}>
              Posters, social posts and mockups for {p.name} land here.
            </EmptyState>
          )}
          <p className="mt-4 text-sm text-muted-foreground">
            Need something else?{" "}
            <Link
              to="/creator-hub/products/$productId"
              params={{ productId: p.id }}
              search={{ tab: "messages" }}
              className="inline-flex items-center gap-1 text-[var(--partner)] hover:underline"
            >
              Ask the team <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </p>
        </HubTab>
      </HubTabs>

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
      <DialogContent className="glass-strong max-h-[100dvh] w-full overflow-y-auto sm:max-w-3xl sm:rounded-3xl">
        {t ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <Tile
                  icon={t.icon}
                  tone={PLATFORM_TILE[t.id].tone}
                  size="sm"
                  className={PLATFORM_TILE[t.id].className}
                />
                {t.label}
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
                className="rounded-full"
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
